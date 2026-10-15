import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };
import { thirdPartyLicenses } from './scripts/licenses.js';

export default defineConfig({
	plugins: [sveltekit(), thirdPartyLicenses()],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	test: { include: ['src/**/*.test.ts'] }
});
