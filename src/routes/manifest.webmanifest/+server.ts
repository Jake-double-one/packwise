import { messagesFor } from '$lib/server/i18n';
import { translate } from '$lib/i18n';
import type { RequestHandler } from './$types';

/**
 * Web app manifest, built per request so that the app shortcuts (long press on the icon)
 * carry the user's language and the colours match the chosen theme: Chrome paints an
 * installed app's navigation bar and splash screen from here, not from the live page.
 * "System" can't be known on the server and gets the light colours. Public: browsers
 * fetch it before anybody is logged in.
 */
const COLORS: Record<string, { theme: string; background: string }> = {
	light: { theme: '#ffffff', background: '#f6f7fb' },
	dark: { theme: '#171a23', background: '#0f1117' },
	amoled: { theme: '#000000', background: '#000000' }
};

export const GET: RequestHandler = ({ locals }) => {
	const m = messagesFor(locals.locale);
	const t = (k: string) => translate(m, k);
	const colors = COLORS[locals.theme] ?? COLORS.light;
	const manifest = {
		id: '/',
		name: 'Packwise',
		short_name: 'Packwise',
		description: t('app.description'),
		lang: locals.locale,
		start_url: '/',
		scope: '/',
		display: 'standalone',
		orientation: 'any',
		background_color: colors.background,
		theme_color: colors.theme,
		categories: ['travel', 'productivity', 'lifestyle'],
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
			{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
			{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }
		],
		shortcuts: [
			{ name: t('trips.new'), url: '/trips/new', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
			{ name: t('nav.trips'), url: '/', icons: [{ src: '/icon-192.png', sizes: '192x192' }] }
		]
	};
	return new Response(JSON.stringify(manifest), {
		headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' }
	});
};
