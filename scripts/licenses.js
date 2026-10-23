// Vite plugin: writes licenses.txt (served as /licenses.txt) with the license of every third-party
// package Packwise ships – everything in the browser and server bundles, the packages the Docker
// image runs from node_modules, and what @sveltejs/adapter-node bundles into its server – plus the
// data services used at runtime. Taken from the packages themselves, so the list can't fall behind
// when dependencies change.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PKG_RE = /^(.*[\\/]node_modules[\\/])((?:@[^\\/]+[\\/])?[^\\/]+)/;
const LICENSE_FILE = /^(licen[cs]e|copying|ofl)([.-].*)?$/i;

/**
 * Collected over both builds: server (SSR) runs first, then the client build writes the file.
 * Kept on globalThis because the config (and this module) is loaded again for the second build.
 */
const dirs = (globalThis.__packwiseLicenseDirs ??= new Set());

const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const authorOf = (pkg) => (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name) || `the ${pkg.name} authors`;

function packageInfo(dir) {
	const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const files = readdirSync(dir);
	const file = files.find((f) => LICENSE_FILE.test(f));
	const notice = files.find((f) => /^notice(\.(md|txt))?$/i.test(f));
	const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
	const info = {
		name: pkg.name,
		version: pkg.version,
		license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'see text',
		url: (pkg.homepage || (repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : '')).replace(/#readme$/, ''),
		text: [file, notice]
			.filter(Boolean)
			.map((f) => readFileSync(join(dir, f), 'utf8').trim())
			.join('\n\n')
	};
	// some packages declare MIT in package.json but ship no license file: use the MIT text with their author
	if (!info.text && info.license === 'MIT') info.text = `(no license file in the package – MIT text with the author from package.json)\n\n${MIT(authorOf(pkg))}`;
	return info;
}

/** Production dependencies (and theirs) – they run from node_modules in the Docker image. */
function runtimeDependencies(root) {
	const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
	return Object.entries(lock.packages)
		.filter(([path, p]) => path.startsWith('node_modules/') && !p.dev && !p.devOptional)
		.map(([path]) => join(root, path));
}

/** Bundled into the server by @sveltejs/adapter-node without being installed as a package. */
const ADAPTER_BUNDLED = [
	{
		name: 'polka',
		version: '1.0.0-next',
		license: 'MIT',
		url: 'https://github.com/lukeed/polka',
		text: MIT('Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)')
	}
];
const ADAPTER_INSTALLED = ['@sveltejs/adapter-node', 'sirv', '@polka/url', 'mrmime', 'totalist'];

/** Data and services Packwise talks to at runtime (no code of theirs is shipped). */
const SERVICES = `Data and services used at runtime
(no code of these is shipped; their terms apply to the data)

- Weather forecast and climate data: Open-Meteo.com – data licensed under
  Creative Commons Attribution 4.0 International (CC BY 4.0).
  https://open-meteo.com/en/license
- Place search (geocoding): Open-Meteo geocoding API, based on GeoNames –
  CC BY 4.0. https://open-meteo.com/en/docs/geocoding-api / https://www.geonames.org
- Maps: © OpenStreetMap contributors – data available under the Open Database
  License (ODbL). https://www.openstreetmap.org/copyright
- Web Push: messages are delivered through the push service of the browser
  (Google, Mozilla, Apple) under their terms.`;

export function thirdPartyLicenses({ fileName = 'licenses.txt', root = process.cwd() } = {}) {
	return {
		name: 'third-party-licenses',
		apply: 'build',
		generateBundle(options, bundle) {
			const external = new Set();
			for (const id of this.getModuleIds()) {
				const m = id.replace(/^\0/, '').split('?')[0].match(PKG_RE);
				if (m) dirs.add(m[1] + m[2]);
				else external.add(id);
			}
			// imports left external by the server build (e.g. cookie) – adapter-node bundles them later
			for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') for (const id of chunk.imports) external.add(id);
			for (const id of external) {
				// package names only – rolldown lists sibling chunks as relative paths (../chunks/x.js)
				const name = id.match(/^((?:@[\w.-]+\/)?[\w-][\w.-]*)/)?.[1];
				if (name && !id.startsWith('node:') && existsSync(join(root, 'node_modules', name, 'package.json'))) dirs.add(join(root, 'node_modules', name));
			}
			// the client build comes second and writes the file (served from /licenses.txt)
			if (this.environment?.config?.build?.ssr ?? !!options.dir?.endsWith('server')) return;
			for (const dir of runtimeDependencies(root)) dirs.add(dir);
			for (const name of ADAPTER_INSTALLED) {
				const dir = join(root, 'node_modules', name);
				if (existsSync(join(dir, 'package.json'))) dirs.add(dir);
			}
			const byName = new Map();
			for (const dir of dirs) {
				if (!existsSync(join(dir, 'package.json'))) continue;
				const p = packageInfo(dir);
				if (p.name && !byName.has(p.name)) byName.set(p.name, p);
			}
			for (const p of ADAPTER_BUNDLED) if (!byName.has(p.name)) byName.set(p.name, p);
			const pkgs = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
			for (const p of pkgs) if (!p.text) this.warn(`${p.name}: no license file in the package`);
			const line = '='.repeat(72);
			const parts = [
				`Third-party software\n\nPackwise contains the following software and fonts. Each one is used under its own\nlicense; the full texts follow after the list and the data services.`,
				pkgs.map((p) => `- ${p.name} ${p.version} (${p.license})`).join('\n'),
				SERVICES,
				...pkgs.map((p) => `${line}\n${p.name} ${p.version} – ${p.license}${p.url ? `\n${p.url}` : ''}\n${line}\n\n${p.text || `License: ${p.license}`}`)
			];
			this.emitFile({ type: 'asset', fileName, source: `${parts.join('\n\n')}\n` });
		}
	};
}
