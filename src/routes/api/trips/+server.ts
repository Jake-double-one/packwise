import { error } from '@sveltejs/kit';
import { createTrip, sanitizeCreate } from '#lib/server/trips.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	const input = sanitizeCreate(await request.json(), hh);
	const id = createTrip(hh, locals.user, input, locals.locale);
	return Response.json({ id });
};
