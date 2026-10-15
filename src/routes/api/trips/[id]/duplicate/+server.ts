import { error, json } from '@sveltejs/kit';
import { duplicateTrip, tripAccess } from '$lib/server/trips';
import type { RequestHandler } from './$types';

/** Copy a trip for new dates (see duplicateTrip). */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	// the copy would land in the host's household
	if (hh.role === 'guest') error(403, 'error.forbidden');
	const id = await duplicateTrip(trip.id, hh, locals.user, await request.json(), locals.locale);
	return json({ id });
};
