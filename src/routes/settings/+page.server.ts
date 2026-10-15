import { fail } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { hashPassword, verifyPassword } from '$lib/server/auth';
import { get, run } from '$lib/server/db';
import { AVATAR_DATA_URL, MAX_AVATAR_CHARS } from '$lib/server/avatar';
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
	/** Profile picture: an emoji, an uploaded (already resized) picture, or back to initials. */
	avatar: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		const emoji = str(form, 'emoji');
		const image = String(form.get('image') ?? '');
		if (form.get('clear')) {
			run('UPDATE users SET avatar = NULL, avatar_img = NULL WHERE id = ?', locals.user.id);
		} else if (image) {
			if (image.length > MAX_AVATAR_CHARS || !AVATAR_DATA_URL.test(image)) return fail(400, { avatarError: 'settings.avatar_invalid' });
			run('UPDATE users SET avatar = ?, avatar_img = ? WHERE id = ?', `img:${Date.now().toString(36)}`, image, locals.user.id);
		} else if (emoji && [...emoji].length <= 4 && emoji.length <= 16 && !/[\w\s<>"'&]/.test(emoji)) {
			run('UPDATE users SET avatar = ?, avatar_img = NULL WHERE id = ?', emoji, locals.user.id);
		} else return fail(400, { avatarError: 'settings.avatar_invalid' });
		return { saved: 'avatar' };
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
