import { fail } from '@sveltejs/kit';
import { adminResetAt } from '$lib/server/admin';
import { config } from '$lib/server/config';
import { smtpEnabled, smtpView } from '$lib/server/mail';
import { smtpAction } from '$lib/server/smtp-actions';
import { addChannel, deleteChannel, getPrefs, listChannels, MAX_CHANNELS, parseChannel, rememberOrigin, sendToChannel, setPrefs } from '$lib/server/notify';
import { messagesFor } from '$lib/server/i18n';
import { translate } from '$lib/i18n';
import { hashPassword, SESSION_COOKIE, sha256, verifyPassword } from '$lib/server/auth';
import { get, run } from '$lib/server/db';
import { AVATAR_DATA_URL, MAX_AVATAR_CHARS } from '$lib/server/avatar';
import { createApiToken, deleteToken, listTokens, MAX_TOKENS, renameToken } from '$lib/server/apitokens';
import { publicOrigin } from '$lib/server/auth';
import { passwordChangedMail } from '$lib/server/security-mail';
import { str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => ({
	smtp: smtpEnabled(),
	adminReset: adminResetAt(locals.user?.id),
	/** none/local: e-mail settings live here (with accounts in the admin area) */
	smtpSettings: config.authMode !== 'accounts' ? smtpView() : null,
	notify: locals.user
		? { channels: listChannels(locals.user.id), prefs: getPrefs(locals.user.id), max: MAX_CHANNELS, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }
		: null,
	mcp: config.mcpEnabled && locals.user ? { tokens: listTokens(locals.user.id), max: MAX_TOKENS, url: `${publicOrigin(request)}/mcp` } : null
});

/** SMTP can be set up here only without accounts – with accounts it's the admin's job. */
const smtpGuard = (locals: App.Locals) => config.authMode !== 'accounts' && locals.unlocked;

export const actions: Actions = {
	/** Notifications: add an e-mail, ntfy or Gotify channel (Web Push goes through /api/notify/webpush). */
	notifyAdd: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const cfg = await parseChannel(await request.formData());
		if ('error' in cfg) return fail(400, { notifyError: cfg.error });
		if (!addChannel(locals.user.id, cfg)) return fail(400, { notifyError: 'notify.err.max' });
		rememberOrigin(publicOrigin(request));
		return { notifySaved: 'added' };
	},
	notifyDelete: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		deleteChannel(locals.user.id, str(await request.formData(), 'id'));
		return { notifySaved: 'deleted' };
	},
	notifyTest: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const id = str(await request.formData(), 'id');
		const m = messagesFor(locals.locale);
		rememberOrigin(publicOrigin(request));
		const err = await sendToChannel(locals.user.id, id, {
			title: translate(m, 'notify.test_title'),
			body: translate(m, 'notify.test_body'),
			url: publicOrigin(request) + '/settings',
			tags: ['white_check_mark']
		});
		if (err === 'gone') return fail(400, { notifyError: 'notify.err.gone' });
		if (err === 'SMTP') return fail(400, { notifyError: 'notify.err.smtp', notifyFor: id });
		return err ? fail(400, { notifyError: 'notify.err.send', notifyDetail: err, notifyFor: id }) : { notifySaved: 'tested', notifyFor: id };
	},
	notifyPrefs: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		setPrefs(locals.user.id, {
			departureDays: form.get('departure') === 'on' ? Number(form.get('days')) || 3 : 0,
			dayBefore: form.get('day_before') === 'on',
			todos: form.get('todos') === 'on',
			hour: Number(form.get('hour'))
		});
		rememberOrigin(publicOrigin(request));
		return { notifySaved: 'prefs' };
	},
	smtpSave: async ({ request, locals }) => (smtpGuard(locals) ? smtpAction('save', request, locals.locale) : fail(403)),
	smtpTest: async ({ request, locals }) => (smtpGuard(locals) ? smtpAction('test', request, locals.locale) : fail(403)),
	smtpClear: async ({ request, locals }) => (smtpGuard(locals) ? smtpAction('clear', request, locals.locale) : fail(403)),
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
		if (!locals.user || config.authMode !== 'accounts') return fail(403);
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
	tokenCreate: async ({ request, locals }) => {
		if (!locals.user || !config.mcpEnabled) return fail(403);
		const form = await request.formData();
		const created = createApiToken(locals.user.id, str(form, 'name'), str(form, 'scope') === 'write' ? 'write' : 'read');
		if (!created) return fail(400, { tokenError: 'tokens.err.max' });
		return { createdToken: created };
	},
	tokenRename: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const form = await request.formData();
		renameToken(locals.user.id, str(form, 'id'), str(form, 'name'));
		return { saved: 'token' };
	},
	tokenDelete: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		deleteToken(locals.user.id, str(await request.formData(), 'id'));
		return { saved: 'token' };
	},
	password: async ({ request, locals, cookies }) => {
		if (!locals.user || config.authMode !== 'accounts') return fail(403);
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('password') ?? '');
		const row = get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', locals.user.id);
		if (!(await verifyPassword(current, row?.password_hash))) return fail(400, { pwError: 'auth.err.wrong_password' });
		if (next.length < 8) return fail(400, { pwError: 'auth.err.password_short' });
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(next), locals.user.id);
		// everybody else who knew the old password is logged out; this device stays
		run('DELETE FROM sessions WHERE user_id = ? AND id != ?', locals.user.id, sha256(cookies.get(SESSION_COOKIE) ?? ''));
		passwordChangedMail(locals.user.id, false, publicOrigin(request));
		return { saved: 'password' };
	}
};
