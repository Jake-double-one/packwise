import { json, type Handle } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import {
	cookieOptions,
	getUser,
	listUsers,
	householdsFor,
	HOUSEHOLD_COOKIE,
	PROFILE_COOKIE,
	purgeExpiredSessions,
	readSession,
	userCount
} from '$lib/server/auth';
import { needsClaim } from '$lib/server/admin';
import { db } from '$lib/server/db';
import { resolveLocale } from '$lib/server/i18n';
import { startScheduler } from '$lib/server/scheduler';

db();
purgeExpiredSessions();
startScheduler();

/** Paths reachable without passing the gate. */
const PUBLIC = [/^\/login/, /^\/register/, /^\/invite\//, /^\/forgot/, /^\/reset\//, /^\/setup/, /^\/api\/health/, /^\/api\/prefs/, /^\/manifest\.webmanifest/];

/** With a single profile there is nothing to choose – log it in right away. */
function soleProfile(event: Parameters<Handle>[0]['event']) {
	const users = listUsers();
	if (users.length !== 1) return null;
	event.cookies.set(PROFILE_COOKIE, users[0].id, cookieOptions(event, 3650));
	return users[0];
}

const THEMES = ['system', 'light', 'dark', 'amoled'];

/**
 * CSRF protection that works behind reverse proxies: for state-changing
 * requests the Origin host must match the Host / X-Forwarded-Host header.
 */
function sameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true; // same-origin navigations from old browsers / non-browser clients
	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		return false;
	}
	if (config.origin && originHost === new URL(config.origin).host) return true;
	const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host')]
		.filter(Boolean)
		.flatMap((h) => h!.split(',').map((s) => s.trim()));
	return hosts.includes(originHost);
}

export const handle: Handle = async ({ event, resolve }) => {
	const { request, url, cookies, locals } = event;
	const isApi = url.pathname.startsWith('/api/');

	if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) {
		return isApi
			? json({ error: 'cross-origin request blocked' }, { status: 403 })
			: new Response('Cross-origin request blocked', { status: 403 });
	}

	const mode = config.authMode;
	const session = mode === 'none' ? null : readSession(cookies);
	locals.unlocked = mode === 'none' || (mode === 'local' ? !!session : !!session?.user_id);
	locals.user = !locals.unlocked
		? null
		: mode === 'accounts'
			? getUser(session?.user_id)
			: (getUser(cookies.get(PROFILE_COOKIE)) ?? soleProfile(event));
	if (mode === 'accounts' && locals.unlocked && !locals.user) locals.unlocked = false;

	const households = householdsFor(locals.user);
	const wanted = cookies.get(HOUSEHOLD_COOKIE);
	locals.household = households.find((h) => h.id === wanted) ?? households[0] ?? null;

	locals.locale = resolveLocale([locals.user?.locale, cookies.get('pw_lang')], request.headers.get('accept-language'));
	const theme = locals.user?.theme ?? cookies.get('pw_theme') ?? 'system';
	locals.theme = THEMES.includes(theme) ? theme : 'system';

	const path = url.pathname;
	const isPublic = PUBLIC.some((re) => re.test(path)) || path.startsWith('/_app/') || /\.(png|svg|ico|webmanifest|js|css|txt)$/.test(path);

	if (!isPublic) {
		const deny = (to: string) =>
			isApi ? json({ error: 'unauthorized' }, { status: 401 }) : new Response(null, { status: 303, headers: { location: to } });
		if (userCount() === 0 || needsClaim()) return deny('/setup');
		if (!locals.unlocked) return deny(`/login?next=${encodeURIComponent(path + url.search)}`);
		if (!locals.user && path !== '/profiles') return deny(`/profiles?next=${encodeURIComponent(path + url.search)}`);
	}

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%pw.lang%', locals.locale).replace('%pw.theme%', locals.theme)
	});
};
