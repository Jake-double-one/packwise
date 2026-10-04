import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from './en.json';
import de from './de.json';
import { DIMENSIONS } from '../context';
import { ROAD_RULES } from '../data/road-rules';
import { translate } from './index';

const base = (k: string) => k.replace(/_(one|other)$/, '');

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return sourceFiles(p);
		return /\.(ts|svelte)$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
	});
}

describe('locales', () => {
	const enKeys = new Set(Object.keys(en).map(base));
	const deKeys = new Set(Object.keys(de).map(base));

	it('en and de have the same keys', () => {
		expect([...enKeys].filter((k) => !deKeys.has(k))).toEqual([]);
		expect([...deKeys].filter((k) => !enKeys.has(k))).toEqual([]);
	});

	it('every static t() key used in the source exists', () => {
		const used = new Set<string>();
		for (const file of sourceFiles(path.resolve(__dirname, '..', '..'))) {
			const src = fs.readFileSync(file, 'utf8');
			for (const m of src.matchAll(/\bt\(\s*'([a-z_][a-z0-9_.]*)'/g)) used.add(m[1]);
			for (const m of src.matchAll(/(?:error|key): '([a-z_]+\.[a-z0-9_.]+)'/g)) used.add(m[1]);
		}
		expect([...used].filter((k) => !enKeys.has(k))).toEqual([]);
	});

	it('every dimension value and road rule is translated', () => {
		const needed = [
			...DIMENSIONS.flatMap((d) => [`dim.${d.key}`, ...d.values.map((v) => `ctx.${d.key}.${v}`)]),
			...ROAD_RULES.flatMap((r) => [`road.${r.key}.name`, `road.${r.key}.note`]),
			...['adult', 'child', 'baby', 'pet'].map((k) => `kind.${k}`),
			...['owner', 'member', 'packer'].map((k) => `role.${k}`),
			...['system', 'light', 'dark', 'amoled'].map((k) => `settings.theme_${k}`)
		];
		expect(needed.filter((k) => !enKeys.has(k) || !deKeys.has(k))).toEqual([]);
	});

	it('interpolates and pluralises', () => {
		expect(translate(en, 'trips.in_days', { count: 1 })).toBe('tomorrow');
		expect(translate(de, 'trips.in_days', { count: 3 })).toBe('in 3 Tagen');
		expect(translate(en, 'missing.key')).toBe('missing.key');
	});
});
