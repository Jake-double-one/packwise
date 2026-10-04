import { json } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { availableLocales } from '$lib/server/i18n';
import type { RequestHandler } from './$types';

const THEMES = ['system', 'light', 'dark', 'amoled'];

/** Language / theme preference. Stored on the user when known, else in a cookie. */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const body = (await request.json().catch(() => ({}))) as { lang?: string; theme?: string };
	const opts = { path: '/', maxAge: 3650 * 86400, httpOnly: false, sameSite: 'lax' as const, secure: false };
	if (body.lang && availableLocales().some((l) => l.code === body.lang)) {
		cookies.set('pw_lang', body.lang, opts);
		if (locals.user) run('UPDATE users SET locale = ? WHERE id = ?', body.lang, locals.user.id);
	}
	if (body.theme && THEMES.includes(body.theme)) {
		cookies.set('pw_theme', body.theme, opts);
		if (locals.user) run('UPDATE users SET theme = ? WHERE id = ?', body.theme, locals.user.id);
	}
	return json({ ok: true });
};
