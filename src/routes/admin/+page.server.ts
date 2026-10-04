import { error, fail } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { createUser, hashPassword, publicOrigin } from '$lib/server/auth';
import { adminCount, adminHouseholds, adminUsers, mergeUsers, ownerCount } from '$lib/server/admin';
import { get, run, tx } from '$lib/server/db';
import { messagesFor } from '$lib/server/i18n';
import { sendMail } from '$lib/server/mail';
import { addMember, createBag, createHousehold, seedTemplate, seedTodos } from '$lib/server/repo';
import { addPersonWithBags } from '$lib/server/persons';
import { createToken } from '$lib/server/tokens';
import { starterSharedBag, starterTemplate, starterTodos } from '$lib/data/starter';
import { translate } from '$lib/i18n';
import { str } from '$lib/server/util';
import type { Role } from '$lib/types';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const ROLES: Role[] = ['owner', 'member', 'packer'];
const EMAIL = /^\S+@\S+\.\S+$/;

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
	const token = createToken('reset', { user_id: userId }, 72 * 3_600_000);
	const link = `${publicOrigin(event.request)}/reset/${token}`;
	let mailed = false;
	if (mail && config.smtp.enabled) {
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
		smtp: config.smtp.enabled
	};
};

export const actions: Actions = {
	create: async (event) => {
		guard(event.locals);
		const form = await event.request.formData();
		const name = str(form, 'name');
		const email = str(form, 'email').toLowerCase();
		const password = String(form.get('password') ?? '');
		const household = str(form, 'household') || 'new';
		const role = str(form, 'role') as Role;
		if (!name) return fail(400, { error: 'admin.err.name' });
		if (!EMAIL.test(email)) return fail(400, { error: 'auth.err.email' });
		if (password && password.length < 8) return fail(400, { error: 'auth.err.password_short' });
		if (emailTaken(email)) return fail(400, { error: 'auth.err.email_taken' });
		if (household !== 'new' && (!householdExists(household) || !ROLES.includes(role))) return fail(400, { error: 'admin.err.household' });
		const hash = password ? await hashPassword(password) : null;
		const locale = event.locals.locale;
		const uid = tx(() => {
			const uid = createUser({ name, email, passwordHash: hash, locale });
			if (household === 'new') {
				const hh = createHousehold(name, null, uid);
				const own = addPersonWithBags(hh, name, 'adult', '#6366f1', uid, locale).bags;
				const shared = starterSharedBag(locale);
				const bags = [own.suitcase!, createBag(hh, shared.name, shared.color, shared.icon), own.carryon!];
				seedTemplate(hh, starterTemplate(locale), bags);
				seedTodos(hh, starterTodos(locale));
			} else {
				addMember(household, uid, role);
			}
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
		run('UPDATE users SET name = ?, email = ? WHERE id = ?', name, email || null, id);
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
		run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), id);
		// log the user out everywhere (but keep the admin's own current session)
		if (id !== me.id) run('DELETE FROM sessions WHERE user_id = ?', id);
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
		const role = str(form, 'role');
		if (!userExists(userId) || !householdExists(householdId)) return fail(404, { error: 'admin.err.not_found' });
		const current = get<{ role: Role }>('SELECT role FROM memberships WHERE household_id = ? AND user_id = ?', householdId, userId);
		if (current?.role === 'owner' && role !== 'owner' && ownerCount(householdId) < 2) {
			return fail(400, { error: 'household.err.last_owner', for: userId });
		}
		if (role === 'remove') {
			run('DELETE FROM memberships WHERE household_id = ? AND user_id = ?', householdId, userId);
			run('UPDATE persons SET user_id = NULL WHERE household_id = ? AND user_id = ?', householdId, userId);
		} else if (ROLES.includes(role as Role)) {
			addMember(householdId, userId, role as Role);
		} else return fail(400, { error: 'admin.err.household', for: userId });
		return { done: 'saved', for: userId };
	},

	merge: async ({ request, locals }) => {
		const me = guard(locals);
		const form = await request.formData();
		const from = str(form, 'id');
		const into = str(form, 'into');
		if (from === me.id || from === into) return fail(400, { error: 'admin.err.self', for: from });
		if (!userExists(from) || !userExists(into)) return fail(404, { error: 'admin.err.not_found' });
		mergeUsers(from, into);
		return { done: 'merged' };
	},

	delete: async ({ request, locals }) => {
		const me = guard(locals);
		const id = str(await request.formData(), 'id');
		if (id === me.id) return fail(400, { error: 'admin.err.self', for: id });
		const owned = get<{ name: string }>(
			`SELECT h.name FROM memberships m JOIN households h ON h.id = m.household_id
			 WHERE m.user_id = ? AND m.role = 'owner'
			   AND (SELECT COUNT(*) FROM memberships o WHERE o.household_id = m.household_id AND o.role = 'owner') = 1
			   AND (SELECT COUNT(*) FROM memberships x WHERE x.household_id = m.household_id) > 1`,
			id
		);
		if (owned) return fail(400, { error: 'admin.err.only_owner', household: owned.name, for: id });
		run('DELETE FROM users WHERE id = ?', id);
		if (adminCount() === 0) run('UPDATE users SET is_admin = 1 WHERE id = ?', me.id);
		return { done: 'deleted' };
	},

	deleteHousehold: async ({ request, locals }) => {
		guard(locals);
		const id = str(await request.formData(), 'id');
		if (!householdExists(id)) return fail(404, { error: 'admin.err.not_found' });
		run('DELETE FROM households WHERE id = ?', id);
		return { done: 'deleted' };
	},

	renameHousehold: async ({ request, locals }) => {
		guard(locals);
		const form = await request.formData();
		const id = str(form, 'id');
		const name = str(form, 'name');
		if (!householdExists(id) || !name) return fail(400, { error: 'admin.err.household' });
		run('UPDATE households SET name = ? WHERE id = ?', name.slice(0, 80), id);
		return { done: 'saved' };
	}
};
