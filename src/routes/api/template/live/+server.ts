import { error } from '@sveltejs/kit';
import { sseResponse } from '$lib/server/realtime';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.household || !locals.user) error(404);
	const { id, name, color } = locals.user;
	return sseResponse(`tpl:${locals.household.id}`, { id, name, color });
};
