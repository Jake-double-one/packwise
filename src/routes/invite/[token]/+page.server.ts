import { error, redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { get } from '#lib/server/db.js';
import { addMember, addTripGuest } from '#lib/server/repo.js';
import { addPersonWithBags } from '#lib/server/persons.js';
import { consumeToken, readToken } from '#lib/server/tokens.js';
import { PALETTE, householdsFor } from '#lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

/** An invitation link is either for a whole household or for a single trip. */
function readInvite(token: string) {
	const household = readToken(token, 'invite');
	if (household?.household_id) return { kind: 'household' as const, token: household };
	const trip = readToken(token, 'trip_invite');
	if (trip?.trip_id) return { kind: 'trip' as const, token: trip };
	return null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (config.authMode !== 'accounts') redirect(303, '/');
	const invite = readInvite(params.token);
	if (!invite) error(404, 'invite.invalid');
	if (invite.kind === 'household') {
		const household = get<{ name: string }>('SELECT name FROM households WHERE id = ?', invite.token.household_id)?.name ?? '';
		return { kind: invite.kind, household, trip: null, loggedIn: !!locals.user };
	}
	const trip = get<{ name: string; start_date: string; end_date: string; household: string }>(
		'SELECT t.name, t.start_date, t.end_date, h.name AS household FROM trips t JOIN households h ON h.id = t.household_id WHERE t.id = ?',
		invite.token.trip_id
	);
	if (!trip) error(404, 'invite.invalid');
	return { kind: invite.kind, household: trip.household, trip, loggedIn: !!locals.user };
};

export const actions: Actions = {
	accept: async ({ params, locals }) => {
		const invite = readInvite(params.token);
		if (!invite || !locals.user) error(400, 'invite.invalid');
		const user = locals.user;
		if (invite.kind === 'trip') {
			const tripId = invite.token.trip_id!;
			const trip = get<{ household_id: string }>('SELECT household_id FROM trips WHERE id = ?', tripId);
			if (!trip) error(404, 'invite.invalid');
			// members of the household have access anyway
			if (!householdsFor(user).some((h) => h.id === trip.household_id)) addTripGuest(tripId, user.id, null);
			consumeToken(params.token);
			redirect(303, `/t/${tripId}`);
		}
		const householdId = invite.token.household_id!;
		const already = get('SELECT 1 FROM memberships WHERE household_id = ? AND user_id = ?', householdId, user.id);
		if (!already) {
			addMember(householdId, user.id, 'member');
			addPersonWithBags(householdId, user.name, 'adult', PALETTE[Math.floor(Math.random() * PALETTE.length)], user.id, locals.locale);
		}
		consumeToken(params.token);
		redirect(303, '/');
	}
};
