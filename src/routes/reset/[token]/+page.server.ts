import { error, fail, redirect } from '@sveltejs/kit';
import { createSession, hashPassword } from '$lib/server/auth';
import { run } from '$lib/server/db';
import { consumeToken, readToken } from '$lib/server/tokens';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!readToken(params.token, 'reset')) error(404, 'reset.invalid');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const token = readToken(event.params.token, 'reset');
		if (!token?.user_id) error(404, 'reset.invalid');
		const password = String((await event.request.formData()).get('password') ?? '');
		if (password.length < 8) return fail(400, { error: 'auth.err.password_short' });
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), token.user_id);
		run('DELETE FROM sessions WHERE user_id = ?', token.user_id);
		consumeToken(event.params.token);
		createSession(event, token.user_id);
		redirect(303, '/');
	}
};
