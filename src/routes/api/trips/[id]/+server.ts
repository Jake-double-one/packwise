import { error } from '@sveltejs/kit';
import { run } from '#lib/server/db.js';
import { publish } from '#lib/server/realtime.js';
import { listActivity, listTripItems, listTripTodos } from '#lib/server/repo.js';
import { applyTripOp, broadcastTripOp, editTrip, tripAccess, type EditTripInput, type TripOp } from '#lib/server/trips.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip } = tripAccess(locals, params.id);
	return Response.json({ trip, items: listTripItems(trip.id), todos: listTripTodos(trip.id), activity: listActivity(trip.id, 100) });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	const body = (await request.json()) as (TripOp | ({ op: 'editTrip' } & EditTripInput)) & { client?: string };
	let result;
	if (body.op === 'editTrip') {
		result = await editTrip(trip.id, hh, locals.user, body, locals.locale);
	} else result = applyTripOp(trip.id, hh, locals.user, body);
	broadcastTripOp(trip.id, hh.id, result, body.client ?? null);
	return Response.json(result);
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	// a trip belongs to its household – guests can't delete it
	if (hh.role === 'guest') error(403, 'error.forbidden');
	run('DELETE FROM trips WHERE id = ?', trip.id);
	publish(`trip:${trip.id}`, 'deleted', {});
	return Response.json({ ok: true });
};
