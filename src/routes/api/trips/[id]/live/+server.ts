import { error } from '@sveltejs/kit';
import { getUser, sessionAlive } from '#lib/server/auth.js';
import { sseResponse } from '#lib/server/realtime.js';
import { tripAccess, tripAccessFor } from '#lib/server/trips.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, cookies }) => {
	const { trip } = tripAccess(locals, params.id);
	if (!locals.user) error(401);
	const { id, name, color, avatar } = locals.user;
	const alive = sessionAlive(cookies);
	return sseResponse(`trip:${trip.id}`, { id, name, color, avatar }, () => alive() && !!tripAccessFor(getUser(id), trip.id));
};
