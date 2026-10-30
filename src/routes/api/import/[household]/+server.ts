import { error, json } from '@sveltejs/kit';
import { householdsFor } from '#lib/server/auth.js';
import { listBags, listPersons, listTemplate } from '#lib/server/repo.js';
import type { RequestHandler } from './$types';

/** The template of another household of the same user, to pick from in the importer. */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.household) error(404);
	const from = householdsFor(locals.user).find((h) => h.id === params.household && h.role !== 'guest');
	if (!from) error(404);
	const name = ({ id, name }: { id: string; name: string }) => ({ id, name });
	return json({ nodes: listTemplate(from.id), persons: listPersons(from.id).map(name), bags: listBags(from.id).map(name) });
};
