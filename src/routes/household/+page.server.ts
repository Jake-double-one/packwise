import { error, fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { cookieOptions, HOUSEHOLD_COOKIE, householdsFor, PALETTE, publicOrigin } from '$lib/server/auth';
import { get, run, tx } from '$lib/server/db';
import { sendMail } from '$lib/server/mail';
import { messagesFor } from '$lib/server/i18n';
import { translate } from '$lib/i18n';
import { addMember, createBag, createHousehold, listBags, listMembers, listPersons, moveInList } from '$lib/server/repo';
import { addPersonWithBags, createPersonBags, syncPersonBags } from '$lib/server/persons';
import { createToken } from '$lib/server/tokens';
import { str } from '$lib/server/util';
import { COUNTRIES } from '$lib/data/countries';
import { starterSharedBag } from '$lib/data/starter';
import type { Actions, PageServerLoad } from './$types';
import type { PersonKind, Role } from '$lib/types';

const KINDS: PersonKind[] = ['adult', 'child', 'baby', 'pet'];
const ROLES: Role[] = ['owner', 'member', 'packer'];
const color = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) return { hh: null, persons: [], bags: [], members: [], smtp: config.smtp.enabled };
	return {
		hh,
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		members: config.authMode === 'accounts' ? listMembers(hh.id) : [],
		smtp: config.smtp.enabled
	};
};

function requireRole(locals: App.Locals, roles: Role[]) {
	const hh = locals.household;
	if (!hh || !roles.includes(hh.role)) error(403, 'error.forbidden');
	return hh;
}

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner']);
		const form = await request.formData();
		const name = str(form, 'name');
		const country = str(form, 'country').toUpperCase();
		if (!name) return fail(400, { error: 'setup.err.household' });
		run('UPDATE households SET name = ?, home_country = ? WHERE id = ?', name, COUNTRIES[country] ? country : null, hh.id);
		return { saved: 'household' };
	},
	addPerson: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		const name = str(form, 'name');
		const kind = str(form, 'kind') as PersonKind;
		if (!name) return fail(400, { error: 'setup.err.name' });
		const n = listPersons(hh.id).length;
		addPersonWithBags(hh.id, name, KINDS.includes(kind) ? kind : 'adult', color(str(form, 'color'), PALETTE[n % PALETTE.length]), null, locals.locale);
		return { saved: 'person' };
	},
	updatePerson: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		const kind = str(form, 'kind') as PersonKind;
		const id = str(form, 'id');
		const oldName = get<{ name: string }>('SELECT name FROM persons WHERE id = ? AND household_id = ?', id, hh.id)?.name ?? '';
		run(
			'UPDATE persons SET name = ?, kind = ?, color = ? WHERE id = ? AND household_id = ?',
			str(form, 'name') || '?',
			KINDS.includes(kind) ? kind : 'adult',
			color(str(form, 'color'), '#6366f1'),
			id,
			hh.id
		);
		syncPersonBags(hh.id, id, oldName, locals.locale);
		return { saved: 'person' };
	},
	createBags: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		createPersonBags(hh.id, str(await request.formData(), 'id'), locals.locale);
		return { saved: 'bag' };
	},
	movePerson: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		moveInList('persons', hh.id, str(form, 'id'), str(form, 'dir') === 'up' ? -1 : 1);
		return { saved: 'person' };
	},
	moveBag: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		moveInList('bags', hh.id, str(form, 'id'), str(form, 'dir') === 'up' ? -1 : 1);
		return { saved: 'bag' };
	},
	deletePerson: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		run('DELETE FROM persons WHERE id = ? AND household_id = ?', str(await request.formData(), 'id'), hh.id);
		return { saved: 'person' };
	},
	addBag: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		const name = str(form, 'name');
		if (!name) return fail(400, { error: 'household.err.bag_name' });
		createBag(hh.id, name, color(str(form, 'color'), '#3b82f6'), str(form, 'icon') || '🧳');
		return { saved: 'bag' };
	},
	updateBag: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		const form = await request.formData();
		run(
			'UPDATE bags SET name = ?, color = ?, icon = ? WHERE id = ? AND household_id = ?',
			str(form, 'name') || '?',
			color(str(form, 'color'), '#3b82f6'),
			str(form, 'icon') || '🧳',
			str(form, 'id'),
			hh.id
		);
		return { saved: 'bag' };
	},
	deleteBag: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner', 'member']);
		run('DELETE FROM bags WHERE id = ? AND household_id = ?', str(await request.formData(), 'id'), hh.id);
		return { saved: 'bag' };
	},
	switch: async (event) => {
		const id = str(await event.request.formData(), 'id');
		if (!householdsFor(event.locals.user).some((h) => h.id === id)) error(403, 'error.forbidden');
		event.cookies.set(HOUSEHOLD_COOKIE, id, cookieOptions(event, 3650));
		redirect(303, '/');
	},
	create: async (event) => {
		const form = await event.request.formData();
		const name = str(form, 'name');
		if (!name) return fail(400, { error: 'setup.err.household' });
		const user = event.locals.user;
		const id = tx(() => {
			const hh = createHousehold(name, event.locals.household?.home_country ?? null, config.authMode === 'accounts' ? user!.id : null);
			if (user) addPersonWithBags(hh, user.name, 'adult', user.color, user.id, event.locals.locale);
			const shared = starterSharedBag(event.locals.locale);
			createBag(hh, shared.name, shared.color, shared.icon);
			return hh;
		});
		event.cookies.set(HOUSEHOLD_COOKIE, id, cookieOptions(event, 3650));
		redirect(303, '/household');
	},
	delete: async (event) => {
		const hh = requireRole(event.locals, ['owner']);
		if (householdsFor(event.locals.user).length < 2) return fail(400, { error: 'household.err.last' });
		run('DELETE FROM households WHERE id = ?', hh.id);
		event.cookies.delete(HOUSEHOLD_COOKIE, { path: '/' });
		redirect(303, '/');
	},
	invite: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner']);
		const form = await request.formData();
		const role = (ROLES.includes(str(form, 'role') as Role) ? str(form, 'role') : 'member') as Role;
		const email = str(form, 'email').toLowerCase();
		const token = createToken('invite', { household_id: hh.id, role, email: email || null }, 7 * 86_400_000);
		const link = `${publicOrigin(request)}/invite/${token}`;
		let mailed = false;
		if (email && config.smtp.enabled) {
			const m = messagesFor(locals.locale);
			mailed = await sendMail(
				email,
				translate(m, 'mail.invite.subject', { household: hh.name }),
				translate(m, 'mail.invite.body', { name: locals.user?.name ?? '', household: hh.name, link })
			);
		}
		return { inviteLink: link, mailed };
	},
	role: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner']);
		const form = await request.formData();
		const role = str(form, 'role') as Role;
		const userId = str(form, 'user_id');
		if (!ROLES.includes(role)) return fail(400);
		if (userId === locals.user?.id && role !== 'owner') {
			const owners = get<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE household_id = ? AND role = 'owner'", hh.id)!.n;
			if (owners < 2) return fail(400, { error: 'household.err.last_owner' });
		}
		addMember(hh.id, userId, role);
		return { saved: 'member' };
	},
	removeMember: async ({ request, locals }) => {
		const hh = requireRole(locals, ['owner']);
		const userId = str(await request.formData(), 'user_id');
		if (userId === locals.user?.id) return fail(400, { error: 'household.err.last_owner' });
		run('DELETE FROM memberships WHERE household_id = ? AND user_id = ?', hh.id, userId);
		run('UPDATE persons SET user_id = NULL WHERE household_id = ? AND user_id = ?', hh.id, userId);
		return { saved: 'member' };
	}
};
