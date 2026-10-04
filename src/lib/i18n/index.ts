import { getContext, setContext } from 'svelte';

export type Messages = Record<string, string>;
export type Params = Record<string, string | number>;

export function translate(messages: Messages, key: string, params?: Params): string {
	let msg: string | undefined;
	if (params && typeof params.count === 'number') {
		msg = messages[`${key}_${params.count === 1 ? 'one' : 'other'}`];
	}
	msg ??= messages[key];
	if (msg === undefined) return key;
	if (!params) return msg;
	return msg.replace(/\{(\w+)\}/g, (m, name) => (params[name] !== undefined ? String(params[name]) : m));
}

export interface I18n {
	readonly locale: string;
	t: (key: string, params?: Params) => string;
}

const KEY = Symbol('i18n');

/** Called once in the root layout with a getter so locale switches stay reactive. */
export function provideI18n(state: () => { locale: string; messages: Messages }) {
	const i18n: I18n = {
		get locale() {
			return state().locale;
		},
		t: (key, params) => translate(state().messages, key, params)
	};
	setContext(KEY, i18n);
	return i18n;
}

export function useI18n(): I18n {
	return getContext<I18n>(KEY);
}

export function formatDate(iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
	const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
	if (Number.isNaN(d.getTime())) return iso;
	return new Intl.DateTimeFormat(locale, { ...opts, timeZone: iso.length === 10 ? 'UTC' : undefined }).format(d);
}

export function formatRange(start: string, end: string, locale: string) {
	try {
		const a = new Date(`${start}T12:00:00Z`);
		const b = new Date(`${end}T12:00:00Z`);
		const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
		return fmt.formatRange(a, b);
	} catch {
		return `${start} – ${end}`;
	}
}

export function timeAgo(ts: number, locale: string) {
	const diff = (ts - Date.now()) / 1000;
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	const abs = Math.abs(diff);
	if (abs < 60) return rtf.format(Math.round(diff), 'second');
	if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
	return rtf.format(Math.round(diff / 86400), 'day');
}
