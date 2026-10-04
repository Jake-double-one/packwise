import fs from 'node:fs';
import path from 'node:path';
import en from '$lib/i18n/en.json';
import de from '$lib/i18n/de.json';
import type { Messages } from '$lib/i18n';
import { config } from './config';

const BUILTIN: Record<string, Messages> = { en, de };

let cache: Record<string, Messages> | null = null;

/**
 * Built-in locales plus any `*.json` dropped into `<DATA_DIR>/locales`.
 * A custom file may also override keys of a built-in locale.
 */
function load(): Record<string, Messages> {
	if (cache) return cache;
	const all: Record<string, Messages> = {};
	for (const [code, msgs] of Object.entries(BUILTIN)) all[code] = { ...msgs };
	const dir = path.join(config.dataDir, 'locales');
	try {
		for (const file of fs.readdirSync(dir)) {
			if (!file.endsWith('.json')) continue;
			const code = file.slice(0, -5).toLowerCase();
			try {
				const custom = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Messages;
				all[code] = { ...(all[code] ?? {}), ...custom };
			} catch (err) {
				console.warn(`[i18n] could not parse ${file}:`, (err as Error).message);
			}
		}
	} catch {
		/* no custom locales */
	}
	cache = all;
	return all;
}

export function availableLocales(): { code: string; name: string }[] {
	return Object.entries(load())
		.map(([code, m]) => ({ code, name: m._name ?? code }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function messagesFor(locale: string): Messages {
	const all = load();
	return { ...all.en, ...(all[locale] ?? {}) };
}

export function resolveLocale(candidates: (string | null | undefined)[], acceptLanguage: string | null): string {
	const all = load();
	for (const c of candidates) if (c && all[c]) return c;
	for (const part of (acceptLanguage ?? '').split(',')) {
		const code = part.split(';')[0].trim().toLowerCase();
		if (all[code]) return code;
		const short = code.split('-')[0];
		if (all[short]) return short;
	}
	return all[config.defaultLang] ? config.defaultLang : 'en';
}
