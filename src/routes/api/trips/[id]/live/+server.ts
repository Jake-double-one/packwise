import { error } from '@sveltejs/kit';
import { sseResponse } from '$lib/server/realtime';
import { tripAccess } from '$lib/server/trips';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip } = tripAccess(locals, params.id);
	if (!locals.user) error(401);
	const { id, name, color } = locals.user;
	return sseResponse(`trip:${trip.id}`, { id, name, color });
};
