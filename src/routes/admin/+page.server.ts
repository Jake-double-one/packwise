import { error, fail } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { createUser, hashPassword, publicOrigin } from '#lib/server/auth.js';
import { adminCount, adminHouseholds, adminUsers, mergeUsers } from '#lib/server/admin.js';
import { all, get, now, run, tx } from '#lib/server/db.js';
import { messagesFor } from '#lib/server/i18n.js';
import { sendMail, smtpEnabled, smtpView } from '#lib/server/mail.js';
import { smtpAction } from '#lib/server/smtp-actions.js';
import { createOwnHousehold } from '#lib/server/households.js';
import { createToken, revokeInvitesBy } from '#lib/server/tokens.js';
import { revokeApiTokens } from '#lib/server/apitokens.js';
import { closeUserStreams } from '#lib/server/realtime.js';
import { translate } from '#lib/i18n/index.js';
import { passwordChangedMail } from '#lib/server/security-mail.js';
import { str } from '#lib/server/util.js';
import type { Role } from '#lib/types.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * The admin area manages accounts – it never opens a household: no joining foreign
 * households, no merging active accounts into one's own, no renaming or deleting
 * households that still have members. Only orphaned households can be cleaned up.
 */
function guard(locals: App.Locals) {
	if (config.authMode !== 'accounts' || !locals.user?.is_admin) error(403, 'error.forbidden');
	return locals.user;
}

const userExists = (id: string) => !!get('SELECT 1 FROM users WHERE id = ?', id);
const householdExists = (id: string) => !!get('SELECT 1 FROM households WHERE id = ?', id);
const emailTaken = (email: string, exceptId = '') => !!get('SELECT 1 FROM users WHERE email = ? AND id != ?', email, exceptId);

/** A password link (reset, or first login for profiles without a password). */
async function passwordLink(event: RequestEvent, userId: string, mail: boolean) {
	const user = get<{ email: string | null; name: string }>('SELECT email, name FROM users WHERE id = ?', userId);
	if (!user?.email) return fail(400, { error: 'admin.err.no_email', for: userId });
	const token = createToken('reset', { user_id: userId, by_admin: 1 }, 72 * 3_600_000);
	const link = `${publicOrigin(event.request)}/reset/${token}`;
	let mailed = false;
	if (mail && smtpEnabled()) {
		const m = messagesFor(event.locals.locale);
		mailed = await sendMail(user.email, translate(m, 'mail.access.subject'), translate(m, 'mail.access.body', { name: user.name, admin: event.locals.user?.name ?? '', link }));
	}
	return { link, linkFor: userId, mailed };
}

export const load: PageServerLoad = async ({ locals }) => {
	guard(locals);
	return {
		users: adminUsers(),
		households: adminHouseholds(),
		registration: config.registration,
		smtp: smtpEnabled(),
		smtpSettings: smtpView(),
		originSet: !!config.origin
	};
};

export const actions: Actions = {
	smtpSave: async ({ request, locals }) => (guard(locals), smtpAction('save', request, locals.locale)),
	smtpTest: async ({ request, locals }) => (guard(locals), smtpAction('test', request, locals.locale)),
	smtpClear: async ({ request, locals }) => (guard(locals), smtpAction('clear', request, locals.locale)),
	create: async (event) => {
		guard(event.locals);
		const form = await event.request.formData();
		const name = str(form, 'name');
		const email = str(form, 'email').toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!name) return fail(400, { error: 'admin.err.name' });
		if (!EMAIL.test(email)) return fail(400, { error: 'auth.err.email' });
		if (password && password.length < 8) return fail(400, { error: 'auth.err.password_short' });
		if (emailTaken(email)) return fail(400, { error: 'auth.err.email_taken' });
		const hash = password ? await hashPassword(password) : null;
		const locale = event.locals.locale;
		const uid = tx(() => {
			// always a household of their own – others invite them into theirs
			const uid = createUser({ name, email, passwordHash: hash, locale });
			createOwnHousehold(name, null, { id: uid, name, color: '#6366f1' }, locale, true);
			return uid;
		});
		// without a password the new user sets one via link
		if (!password) return { done: 'created', ...(await passwordLink(event, uid, form.get('mail') === 'on')) };
		return { done: 'created' };
	},

	update: async ({ request, locals }) => {
		const me = guard(locals);
		const form = await request.formData();
		const id = str(form, 'id');
		const name = str(form, 'name');
		const email = str(form, 'email').toLowerCase();
		if (!userExists(id)) return fail(404, { error: 'admin.err.not_found' });
		if (!name) return fail(400, { error: 'admin.err.name', for: id });
		if (email && !EMAIL.test(email)) return fail(400, { error: 'auth.err.email', for: id });
		if (!email && id === me.id) return fail(400, { error: 'admin.err.self', for: id });
		if (email && emailTaken(email, id)) return fail(400, { error: 'auth.err.email_taken', for: id });
		const before = get<{ email: string | null }>('SELECT email FROM users WHERE id = ?', id)?.email ?? null;
		run('UPDATE users SET name = ?, email = ? WHERE id = ?', name, email || null, id);
		// reset links went to the old address
		if ((email || null) !== before) run("DELETE FROM tokens WHERE kind = 'reset' AND user_id = ? AND by_admin = 0", id);
		// a profile without e-mail cannot log in any more
		if (!email) run('DELETE FROM sessions WHERE user_id = ?', id);
		return { done: 'saved', for: id };
	},

	password: async (event) => {
		const me = guard(event.locals);
		const form = await event.request.formData();
		const id = str(form, 'id');
		const password = String(form.get('password') ?? '');
		if (!userExists(id)) return fail(404, { error: 'admin.err.not_found' });
		if (password.length < 8) return fail(400, { error: 'auth.err.password_short', for: id });
		// replacing someone's existing password is shown to them (Settings and start page)
		const hadPassword = !!get<{ p: string | null }>('SELECT password_hash AS p FROM users WHERE id = ?', id)?.p;
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), id);
		if (hadPassword && id !== me.id) run('UPDATE users SET admin_reset_at = ? WHERE id = ?', now(), id);
		if (hadPassword) passwordChangedMail(id, id !== me.id, publicOrigin(event.request));
		// log the user out everywhere (but keep the admin's own current session); their API tokens end too
		if (id !== me.id) {
			run('DELETE FROM sessions WHERE user_id = ?', id);
			if (hadPassword) revokeApiTokens(id);
			closeUserStreams(id);
		}
		return { done: 'password_set', for: id };
	},

	link: async (event) => {
		guard(event.locals);
		const form = await event.request.formData();
		const id = str(form, 'id');
		if (!userExists(id)) return fail(404, { error: 'admin.err.not_found' });
		return passwordLink(event, id, form.get('mail') === 'on');
	},

	logout: async ({ request, locals }) => {
		const me = guard(locals);
		const id = str(await request.formData(), 'id');
		if (id === me.id) return fail(400, { error: 'admin.err.self', for: id });
		run('DELETE FROM sessions WHERE user_id = ?', id);
		closeUserStreams(id);
		return { done: 'logged_out', for: id };
	},

	admin: async ({ request, locals }) => {
		const me = guard(locals);
		const id = str(await request.formData(), 'id');
		if (id === me.id) return fail(400, { error: 'admin.err.self', for: id });
		const target = get<{ is_admin: number; email: string | null }>('SELECT is_admin, email FROM users WHERE id = ?', id);
		if (!target) return fail(404, { error: 'admin.err.not_found' });
		if (!target.is_admin && !target.email) return fail(400, { error: 'admin.err.no_email', for: id });
		run('UPDATE users SET is_admin = ? WHERE id = ?', target.is_admin ? 0 : 1, id);
		return { done: 'saved', for: id };
	},

	member: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const userId = str(form, 'user_id');
		const householdId = str(form, 'household_id');
		if (!userExists(userId) || !householdExists(householdId)) return fail(404, { error: 'admin.err.not_found' });
		// only removing: joining a household happens by invitation from its members, never from here
		const current = get<{ role: Role }>('SELECT role FROM memberships WHERE household_id = ? AND user_id = ?', householdId, userId);
		if (!current) return { done: 'saved', for: userId };
		const next = get<{ user_id: string }>(
			'SELECT user_id FROM memberships WHERE household_id = ? AND user_id != ? ORDER BY rowid LIMIT 1',
			householdId,
			userId
		);
		// the creator leaves: the longest-standing member takes over deleting rights; the last one can't leave
		if (current.role === 'owner' && !next) return fail(400, { error: 'household.err.last_owner', for: userId });
		tx(() => {
			run('DELETE FROM memberships WHERE household_id = ? AND user_id = ?', householdId, userId);
			run('UPDATE persons SET user_id = NULL WHERE household_id = ? AND user_id = ?', householdId, userId);
			if (current.role === 'owner') run("UPDATE memberships SET role = 'owner' WHERE household_id = ? AND user_id = ?", householdId, next!.user_id);
			revokeInvitesBy(householdId, userId);
		});
		closeUserStreams(userId, `tpl:${householdId}`);
		return { done: 'saved', for: userId };
	},

	merge: async ({ request, locals }) => {
		const me = guard(locals);
		const form = await request.formData();
		const from = str(form, 'id');
		const into = str(form, 'into');
		if (from === me.id || from === into) return fail(400, { error: 'admin.err.self', for: from });
		if (!userExists(from) || !userExists(into)) return fail(404, { error: 'admin.err.not_found' });
		// only profiles nobody logs in with (left over from none/local) – an active account's
		// households must not be handed to somebody else
		if (get<{ p: string | null }>('SELECT password_hash AS p FROM users WHERE id = ?', from)?.p) return fail(400, { error: 'admin.err.merge_active', for: from });
		mergeUsers(from, into);
		return { done: 'merged' };
	},

	delete: async ({ request, locals }) => {
		const me = guard(locals);
		const id = str(await request.formData(), 'id');
		if (id === me.id) return fail(400, { error: 'admin.err.self', for: id });
		if (!userExists(id)) return fail(404, { error: 'admin.err.not_found' });
		tx(() => {
			// households they created and share with others: the longest member takes over;
			// households they were alone in stay behind as orphans (see below)
			const created = all<{ household_id: string }>("SELECT household_id FROM memberships WHERE user_id = ? AND role = 'owner'", id);
			for (const { household_id } of created) {
				const next = get<{ user_id: string }>(
					'SELECT user_id FROM memberships WHERE household_id = ? AND user_id != ? ORDER BY rowid LIMIT 1',
					household_id,
					id
				);
				if (next) run("UPDATE memberships SET role = 'owner' WHERE household_id = ? AND user_id = ?", household_id, next.user_id);
			}
			run('DELETE FROM users WHERE id = ?', id);
		});
		if (adminCount() === 0) run('UPDATE users SET is_admin = 1 WHERE id = ?', me.id);
		return { done: 'deleted' };
	},

	deleteHousehold: async ({ request, locals }) => {
		guard(locals);
		const id = str(await request.formData(), 'id');
		if (!householdExists(id)) return fail(404, { error: 'admin.err.not_found' });
		// households with members belong to them – their creator deletes them
		if (get<{ n: number }>('SELECT COUNT(*) AS n FROM memberships WHERE household_id = ?', id)!.n) return fail(400, { error: 'admin.err.not_orphaned' });
		run('DELETE FROM households WHERE id = ?', id);
		return { done: 'deleted' };
	}
};
