import { error, fail } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { createUser, hashPassword, listUsers, publicOrigin } from '$lib/server/auth';
import { get, run, tx } from '$lib/server/db';
import { createBag, createHousehold, createPerson, seedTemplate, seedTodos } from '$lib/server/repo';
import { createToken } from '$lib/server/tokens';
import { starterBags, starterTemplate, starterTodos } from '$lib/data/starter';
import { str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

function guard(locals: App.Locals) {
	if (config.authMode !== 'accounts' || !locals.user?.is_admin) error(403, 'error.forbidden');
}

export const load: PageServerLoad = async ({ locals }) => {
	guard(locals);
	return {
		users: listUsers(),
		registration: config.registration,
		smtp: config.smtp.enabled
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const name = str(form, 'name');
		const email = str(form, 'email').toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail(400, { error: 'auth.err.email' });
		if (password.length < 8) return fail(400, { error: 'auth.err.password_short' });
		if (get('SELECT 1 FROM users WHERE email = ?', email)) return fail(400, { error: 'auth.err.email_taken' });
		const hash = await hashPassword(password);
		tx(() => {
			const uid = createUser({ name, email, passwordHash: hash, locale: locals.locale });
			const hh = createHousehold(name, null, uid);
			createPerson(hh, name, 'adult', '#6366f1', uid);
			const bags = starterBags(locals.locale).map((b) => createBag(hh, b.name, b.color, b.icon));
			seedTemplate(hh, starterTemplate(locals.locale), bags);
			seedTodos(hh, starterTodos(locals.locale));
		});
		return { done: 'created' };
	},
	reset: async ({ request, locals }) => {
		guard(locals);
		const id = str(await request.formData(), 'id');
		const token = createToken('reset', { user_id: id }, 24 * 3_600_000);
		return { resetLink: `${publicOrigin(request)}/reset/${token}`, resetFor: id };
	},
	admin: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const id = str(form, 'id');
		if (id === locals.user!.id) return fail(400, { error: 'admin.err.self' });
		run('UPDATE users SET is_admin = 1 - is_admin WHERE id = ?', id);
		return { done: 'saved' };
	},
	delete: async ({ request, locals }) => {
		guard(locals);
		const id = str(await request.formData(), 'id');
		if (id === locals.user!.id) return fail(400, { error: 'admin.err.self' });
		run('DELETE FROM users WHERE id = ?', id);
		return { done: 'deleted' };
	}
};
