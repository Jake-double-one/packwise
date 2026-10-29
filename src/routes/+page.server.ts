import { adminResetAt } from '#lib/server/admin.js';
import { config } from '#lib/server/config.js';
import { listSharedTrips, listTrips } from '#lib/server/repo.js';
import type { PageServerLoad } from './$types';

/** how long the start page points out a password set by the administration */
const RESET_NOTICE_DAYS = 14;

export const load: PageServerLoad = async ({ locals }) => {
	const reset = adminResetAt(locals.user?.id);
	return {
		/** the administration replaced the password recently – the person should know */
		adminReset: reset && Date.now() - reset < RESET_NOTICE_DAYS * 86_400_000 ? reset : null,
		trips: locals.household ? listTrips(locals.household.id, locals.household.collapsed) : [],
		/** no household of one's own (yet) – the page offers to create one */
		noHousehold: !locals.household,
		/** trips of other households this account was invited to */
		shared: config.authMode === 'accounts' && locals.user ? listSharedTrips(locals.user.id) : []
	};
};
