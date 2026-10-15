import { config } from '$lib/server/config';
import { listSharedTrips, listTrips } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		trips: locals.household ? listTrips(locals.household.id) : [],
		/** no household of one's own (yet) – the page offers to create one */
		noHousehold: !locals.household,
		/** trips of other households this account was invited to */
		shared: config.authMode === 'accounts' && locals.user ? listSharedTrips(locals.user.id) : []
	};
};
