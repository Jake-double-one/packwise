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
import { effectiveTheme, THEME_COLORS } from '$lib/theme';

db();
purgeExpiredSessions();
// profile pictures only exist with real accounts – drop leftovers from none/local
if (config.authMode !== 'accounts') db().exec('UPDATE users SET avatar = NULL, avatar_img = NULL WHERE avatar IS NOT NULL OR avatar_img IS NOT NULL');
startScheduler();
// Links in e-mails and the cookie's Secure flag come from the request's Host / X-Forwarded-*
// headers unless ORIGIN is set – anybody who can reach the port could forge them.
if (config.authMode === 'accounts' && !config.origin) {
	console.warn('[packwise] ORIGIN is not set. With AUTH_MODE=accounts set ORIGIN=https://your.host so that password links in e-mails can\'t be redirected via a forged Host header.');
}

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

	// MCP: token auth instead of cookies, called by AI services – no session, no CSRF check
	if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
		locals.user = null;
		locals.unlocked = false;
		locals.household = null;
		locals.locale = config.defaultLang;
		locals.theme = 'system';
		return resolve(event);
	}

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

	// browser chrome colours: a chosen theme applies to both schemes, "system" follows the device
	const tcLight = THEME_COLORS[effectiveTheme(locals.theme, false)];
	const tcDark = THEME_COLORS[effectiveTheme(locals.theme, true)];
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%pw.lang%', locals.locale).replace('%pw.theme%', locals.theme).replace('%pw.tc.light%', tcLight).replace('%pw.tc.dark%', tcDark)
	});
	// the Content-Security-Policy comes from svelte.config.js (kit.csp)
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	return response;
};
