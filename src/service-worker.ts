/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * Offline support:
 * - the app shell (JS, CSS, icons) is precached per version
 * - pages and their data (incl. /api/trips/<id>) are network-first and fall
 *   back to the last copy, so an opened packing list keeps working offline
 * - changes are queued by the page itself (see $lib/offline) – the service
 *   worker never touches POST requests
 */
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const STATIC = `pw-static-${version}`;
const PAGES = 'pw-pages';
const ASSETS = new Set([...build, ...files]);

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
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	// sent on logout so the next person on this device can't read cached lists
	if (event.data === 'clear-pages') event.waitUntil(caches.delete(PAGES));
});

/** Responses worth keeping for offline use. */
function cacheable(url: URL, request: Request): boolean {
	if (url.pathname.startsWith('/api/')) return /^\/api\/trips\/[^/]+(\/info)?$/.test(url.pathname);
	return request.mode === 'navigate' || url.pathname.endsWith('/__data.json');
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(PAGES);
	try {
		const response = await fetch(request);
		if (response.ok && response.type === 'basic' && !response.redirected) cache.put(request, response.clone());
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
