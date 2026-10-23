import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };
import { thirdPartyLicenses } from './scripts/licenses.js';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess(),
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
		}),
		thirdPartyLicenses()
	],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	test: { include: ['src/**/*.test.ts'] }
});
