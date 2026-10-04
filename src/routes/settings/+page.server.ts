import { fail } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { hashPassword, verifyPassword } from '$lib/server/auth';
import { get, run } from '$lib/server/db';
import { str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ smtp: config.smtp.enabled });

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		const name = str(form, 'name');
		const color = str(form, 'color');
		if (!name) return fail(400, { error: 'setup.err.name' });
		run('UPDATE users SET name = ?, color = ? WHERE id = ?', name, /^#[0-9a-f]{6}$/i.test(color) ? color : locals.user.color, locals.user.id);
		return { saved: 'profile' };
	},
	password: async ({ request, locals }) => {
		if (!locals.user || config.authMode !== 'accounts') return fail(403);
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', locals.user.id);
		if (!(await verifyPassword(current, row?.password_hash))) return fail(400, { pwError: 'auth.err.wrong_password' });
		if (next.length < 8) return fail(400, { pwError: 'auth.err.password_short' });
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(next), locals.user.id);
		return { saved: 'password' };
	}
};
