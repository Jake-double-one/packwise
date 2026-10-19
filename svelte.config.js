import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build' }),
		// Origin checks are done in hooks.server.ts so the app works behind
		// reverse proxies (Authentik, Traefik, NPM) without extra configuration.
		csrf: { trustedOrigins: ['*'] },
		// Only own code and assets; the map is an OpenStreetMap iframe, pictures may be data/blob
		// URLs (QR codes, profile picture preview). Inline styles are needed for colours (--bag …).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'frame-src': ['https://www.openstreetmap.org'],
				'worker-src': ['self'],
				'manifest-src': ['self'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'object-src': ['none'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
