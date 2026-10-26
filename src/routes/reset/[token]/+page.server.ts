import { error, fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { createSession, hashPassword, publicOrigin } from '#lib/server/auth.js';
import { passwordChangedMail } from '#lib/server/security-mail.js';
import { get, now, run } from '#lib/server/db.js';
import { revokeApiTokens } from '#lib/server/apitokens.js';
import { consumeToken, readToken } from '#lib/server/tokens.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (config.authMode !== 'accounts' || !readToken(params.token, 'reset')) error(404, 'reset.invalid');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const token = config.authMode === 'accounts' ? readToken(event.params.token, 'reset') : null;
		if (!token?.user_id) error(404, 'reset.invalid');
		const password = String((await event.request.formData()).get('password') ?? '');
		if (password.length < 8) return fail(400, { error: 'auth.err.password_short' });
		// a link from the admin area that replaces an existing password: the person will be told
		const hadPassword = !!get<{ p: string | null }>('SELECT password_hash AS p FROM users WHERE id = ?', token.user_id)?.p;
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), token.user_id);
		if (token.by_admin && hadPassword) run('UPDATE users SET admin_reset_at = ? WHERE id = ?', now(), token.user_id);
		if (hadPassword) passwordChangedMail(token.user_id, !!token.by_admin, publicOrigin(event.request));
		// what let somebody in before ends: sessions and other reset links – and, when the
		// administration replaced an existing password, the API tokens too
		run('DELETE FROM sessions WHERE user_id = ?', token.user_id);
		run("DELETE FROM tokens WHERE kind = 'reset' AND user_id = ?", token.user_id);
		if (token.by_admin && hadPassword) revokeApiTokens(token.user_id);
		consumeToken(event.params.token);
		createSession(event, token.user_id);
		redirect(303, '/');
	}
};
