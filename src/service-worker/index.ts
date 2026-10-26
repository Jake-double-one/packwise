/**
 * Offline support:
 * - the app shell (JS, CSS, icons) is precached per version
 * - pages and their data (incl. /api/trips/<id>) are network-first and fall
 *   back to the last copy, so an opened packing list keeps working offline
 * - changes are queued by the page itself (see #lib/offline) – the service
 *   worker never touches POST requests
 */
import { self as sw } from '$app/service-worker';
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { resolve } from '$app/paths';

const STATIC = `pw-static-${version}`;
const PAGES = 'pw-pages';
// the Vite output and everything in static/, as absolute pathnames
const ASSETS = new Set([...immutable, ...assets].map((a) => resolve(a.path)));

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC)
			.then((cache) => cache.addAll([...ASSETS]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith('pw-static-') && k !== STATIC).map((k) => caches.delete(k))))
			.then(dropAuthPages)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	// sent on logout so the next person on this device can't read cached lists
	if (event.data === 'clear-pages') event.waitUntil(caches.delete(PAGES));
});

/** Login and invitation pages are never kept – offline they would only get in the way. */
const AUTH_PAGES = /^\/(login|register|setup|forgot|reset|invite)(\/|$)/;

/** Copies an older version kept of those pages. */
async function dropAuthPages() {
	if (!(await caches.has(PAGES))) return;
	const cache = await caches.open(PAGES);
	for (const req of await cache.keys()) if (AUTH_PAGES.test(new URL(req.url).pathname)) await cache.delete(req);
}

/** Responses worth keeping for offline use. */
function cacheable(url: URL, request: Request): boolean {
	if (url.pathname.startsWith('/api/')) return /^\/api\/(trips\/[^/]+(\/info)?|avatar\/[^/]+)$/.test(url.pathname);
	if (AUTH_PAGES.test(url.pathname)) return false;
	return request.mode === 'navigate' || url.pathname.endsWith('/__data.json');
}

/**
 * The server answered "not logged in": what this device cached for offline use goes. Seen on
 * data and API requests only – a navigation that is redirected comes back opaque, and then the
 * login page itself clears the cache when it renders.
 */
function loggedOut(response: Response): boolean {
	if (response.status === 401) return true;
	return response.redirected && /^\/login(\/|$)/.test(new URL(response.url).pathname);
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		if (loggedOut(response)) await caches.delete(PAGES);
		else if (response.ok && response.type === 'basic' && !response.redirected) cache.put(request, response.clone());
		return response;
	} catch (err) {
		const hit = await cache.match(request, { ignoreVary: true });
		if (hit) return hit;
		if (request.mode === 'navigate') {
			const home = await cache.match('/', { ignoreVary: true });
			if (home) return home;
		}
		throw err;
	}
}

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	if (url.pathname.endsWith('/live')) return; // event streams

	if (ASSETS.has(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}
	if (cacheable(url, request)) event.respondWith(networkFirst(request));
});

// ── Web Push: reminders from the server (see #lib/server/notify) ────────────

sw.addEventListener('push', (event) => {
	let data: { title?: string; body?: string; url?: string } = {};
	try {
		data = event.data?.json() ?? {};
	} catch {
		data = { body: event.data?.text() };
	}
	event.waitUntil(
		sw.registration.showNotification(data.title || 'Packwise', {
			body: data.body ?? '',
			icon: '/icon-192.png',
			// status-bar silhouette: Android paints the badge's alpha channel white
			badge: '/badge-96.png',
			data: { url: data.url || '/' }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const target = new URL((event.notification.data as { url?: string })?.url || '/', sw.location.origin);
	// links point to this app only; focus an open window if there is one
	const url = target.origin === sw.location.origin ? target.href : sw.location.origin;
	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
			const win = wins.find((w) => new URL(w.url).origin === sw.location.origin) as WindowClient | undefined;
			const open = () => sw.clients.openWindow(url);
			// navigate() fails on windows this worker doesn't control – then open a new one
			if (win) return win.navigate(url).then((w) => (w ? w.focus() : open())).catch(open);
			return open();
		})
	);
});
