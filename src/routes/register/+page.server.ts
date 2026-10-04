import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { clientIp, createSession, createUser, hashPassword, PALETTE, rateLimit } from '$lib/server/auth';
import { get, tx } from '$lib/server/db';
import { addMember, createBag, createHousehold, createPerson, seedTemplate } from '$lib/server/repo';
import { consumeToken, readToken } from '$lib/server/tokens';
import { starterBags, starterTemplate } from '$lib/data/starter';
import { str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

function allowed(invite: string | null) {
	if (config.authMode !== 'accounts') return { ok: false as const };
	const token = readToken(invite, 'invite');
	if (token) return { ok: true as const, token };
	return { ok: config.registration === 'open', token: null };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (config.authMode !== 'accounts') redirect(303, '/');
	if (locals.user) redirect(303, '/');
	const invite = url.searchParams.get('invite');
	const res = allowed(invite);
	const household = res.token?.household_id
		? get<{ name: string }>('SELECT name FROM households WHERE id = ?', res.token.household_id)?.name
		: null;
	return { allowed: res.ok, invite, household, email: res.token?.email ?? '' };
};

export const actions: Actions = {
	default: async (event) => {
		const invite = event.url.searchParams.get('invite');
		const res = allowed(invite);
		if (!res.ok) return fail(403, { name: '', email: '', error: 'auth.err.registration_closed' });
		if (!rateLimit(`register:${clientIp(event)}`, 10, 3_600_000)) return fail(429, { name: '', email: '', error: 'auth.err.rate_limited' });

		const form = await event.request.formData();
		const name = str(form, 'name');
		const email = str(form, 'email').toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!name) return fail(400, { name, email, error: 'setup.err.name' });
		if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, { name, email, error: 'auth.err.email' });
		if (password.length < 8) return fail(400, { name, email, error: 'auth.err.password_short' });
		if (get('SELECT 1 FROM users WHERE email = ?', email)) return fail(400, { name, email, error: 'auth.err.email_taken' });

		const hash = await hashPassword(password);
		const lang = event.locals.locale;
		const userId = tx(() => {
			const uid = createUser({ name, email, passwordHash: hash, locale: lang });
			if (res.token?.household_id) {
				addMember(res.token.household_id, uid, res.token.role ?? 'member');
				createPerson(res.token.household_id, name, 'adult', PALETTE[Math.floor(Math.random() * PALETTE.length)], uid);
			} else {
				const hh = createHousehold(name, null, uid);
				createPerson(hh, name, 'adult', '#6366f1', uid);
				const bags = starterBags(lang).map((b) => createBag(hh, b.name, b.color, b.icon));
				seedTemplate(hh, starterTemplate(lang), bags);
			}
			return uid;
		});
		if (invite && res.token) consumeToken(invite);
		createSession(event, userId);
		redirect(303, '/');
	}
};
