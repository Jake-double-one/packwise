import { error, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { get } from '$lib/server/db';
import { addMember } from '$lib/server/repo';
import { addPersonWithBags } from '$lib/server/persons';
import { consumeToken, readToken } from '$lib/server/tokens';
import { PALETTE } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (config.authMode !== 'accounts') redirect(303, '/');
	const token = readToken(params.token, 'invite');
	if (!token?.household_id) error(404, 'invite.invalid');
	const household = get<{ name: string }>('SELECT name FROM households WHERE id = ?', token.household_id)?.name ?? '';
	return { household, loggedIn: !!locals.user };
};

export const actions: Actions = {
	accept: async ({ params, locals }) => {
		const token = readToken(params.token, 'invite');
		if (!token?.household_id || !locals.user) error(400, 'invite.invalid');
		const already = get('SELECT 1 FROM memberships WHERE household_id = ? AND user_id = ?', token.household_id, locals.user.id);
		if (!already) {
			addMember(token.household_id, locals.user.id, token.role ?? 'member');
			addPersonWithBags(token.household_id, locals.user.name, 'adult', PALETTE[Math.floor(Math.random() * PALETTE.length)], locals.user.id, locals.locale);
		}
		consumeToken(params.token);
		redirect(303, '/');
	}
};
