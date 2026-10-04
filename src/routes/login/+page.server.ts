import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { checkAppPassword, clientIp, createSession, rateLimit, userCount, verifyPassword } from '$lib/server/auth';
import { needsClaim } from '$lib/server/admin';
import { get } from '$lib/server/db';
import { safeNext, str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (userCount() === 0 || needsClaim()) redirect(303, '/setup');
	if (config.authMode === 'none' || locals.unlocked) redirect(303, safeNext(url.searchParams.get('next')));
	return {
		mode: config.authMode,
		registration: config.registration,
		smtp: config.smtp.enabled
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const next = safeNext(event.url.searchParams.get('next'));
		const password = String(form.get('password') ?? '');
		const ip = clientIp(event);

		if (config.authMode === 'local') {
			if (!rateLimit(`login:${ip}`, 20)) return fail(429, { email: '', error: 'auth.err.rate_limited' });
			if (!(await checkAppPassword(password))) return fail(400, { email: '', error: 'auth.err.wrong_password' });
			createSession(event, null);
			redirect(303, next);
		}

		if (config.authMode === 'accounts') {
			const email = str(form, 'email').toLowerCase();
			if (!rateLimit(`login:${ip}`, 30) || !rateLimit(`login:${email}`, 10)) {
				return fail(429, { email, error: 'auth.err.rate_limited' });
			}
			const user = get<{ id: string; password_hash: string | null }>('SELECT id, password_hash FROM users WHERE email = ?', email);
			if (!user || !(await verifyPassword(password, user.password_hash))) {
				return fail(400, { email, error: 'auth.err.wrong_credentials' });
			}
			createSession(event, user.id);
			redirect(303, next);
		}
		redirect(303, next);
	}
};
