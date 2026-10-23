import { error } from '@sveltejs/kit';
import { revealToken } from '#lib/server/apitokens.js';
import type { RequestHandler } from './$types';

/** Show one of your own API tokens again (the 👁 in the settings). */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401);
	const token = revealToken(locals.user.id, params.id);
	if (!token) error(404);
	return Response.json({ token }, { headers: { 'cache-control': 'no-store' } });
};
