import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build' }),
		// Origin checks are done in hooks.server.ts so the app works behind
		// reverse proxies (Authentik, Traefik, NPM) without extra configuration.
		csrf: { trustedOrigins: ['*'] }
	}
};

export default config;
