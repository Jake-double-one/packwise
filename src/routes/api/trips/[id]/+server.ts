import { error, json } from '@sveltejs/kit';
import { run } from '$lib/server/db';
import { publish } from '$lib/server/realtime';
import { listActivity, listTripItems, listTripTodos } from '$lib/server/repo';
import { applyTripOp, broadcastTripOp, tripAccess, type TripOp } from '$lib/server/trips';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip } = tripAccess(locals, params.id);
	return json({ trip, items: listTripItems(trip.id), todos: listTripTodos(trip.id), activity: listActivity(trip.id, 100) });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	const body = (await request.json()) as TripOp & { client?: string };
	const result = applyTripOp(trip.id, hh, locals.user, body);
	broadcastTripOp(trip.id, hh.id, result, body.client ?? null);
	return json(result);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	if (hh.role === 'packer') error(403, 'error.forbidden');
	run('DELETE FROM trips WHERE id = ?', trip.id);
	publish(`trip:${trip.id}`, 'deleted', {});
	return json({ ok: true });
};
