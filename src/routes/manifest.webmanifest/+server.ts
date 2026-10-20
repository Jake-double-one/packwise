import { messagesFor } from '$lib/server/i18n';
import { translate } from '$lib/i18n';
import type { RequestHandler } from './$types';

/**
 * Web app manifest, built per request so that the app shortcuts (long press on the icon)
 * carry the user's language and the splash screen matches the chosen theme ("system" can't
 * be known on the server and gets the light one). No theme_color on purpose: with one, Chrome
 * paints the installed app's Android navigation bar in that single colour for good – without,
 * Android colours it after the phone's light/dark mode. Public: browsers fetch it before
 * anybody is logged in.
 */
const BACKGROUND: Record<string, string> = { light: '#f6f7fb', dark: '#0f1117', amoled: '#000000' };

export const GET: RequestHandler = ({ locals }) => {
	const m = messagesFor(locals.locale);
	const t = (k: string) => translate(m, k);
	const background = BACKGROUND[locals.theme] ?? BACKGROUND.light;
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
		background_color: background,
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
