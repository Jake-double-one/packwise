import { error } from '@sveltejs/kit';
import { getUser, householdsFor, sessionAlive } from '#lib/server/auth.js';
import { sseResponse } from '#lib/server/realtime.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.household || !locals.user) error(404);
	const { id, name, color, avatar } = locals.user;
	const hhId = locals.household.id;
	const alive = sessionAlive(cookies);
	return sseResponse(`tpl:${hhId}`, { id, name, color, avatar }, () => alive() && householdsFor(getUser(id)).some((h) => h.id === hhId));
};
