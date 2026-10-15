import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { listSharedTrips, listTrips } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.household) redirect(303, '/household');
	return {
		trips: listTrips(locals.household.id),
		/** trips of other households this account was invited to */
		shared: config.authMode === 'accounts' && locals.user ? listSharedTrips(locals.user.id) : []
	};
};
