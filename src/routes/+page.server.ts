import { redirect } from '@sveltejs/kit';
import { listTrips } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.household) redirect(303, '/household');
	return { trips: listTrips(locals.household.id) };
};
