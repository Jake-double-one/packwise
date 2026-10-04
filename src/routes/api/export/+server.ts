import { error } from '@sveltejs/kit';
import { listBags, listPersons, listTemplate, listTripItems, listTrips } from '$lib/server/repo';
import { childrenMap } from '$lib/tree';
import type { TemplateNode } from '$lib/types';
import type { RequestHandler } from './$types';

/** Full JSON backup of the current household (template as a tree). */
export const GET: RequestHandler = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) error(404);
	const nodes = listTemplate(hh.id);
	const map = childrenMap(nodes);
	const toTree = (parent: string | null): unknown[] =>
		(map.get(parent) ?? []).map((n: TemplateNode) => {
			const { id: _id, parent_id: _p, sort: _s, ...rest } = n;
			return { ...rest, children: toTree(n.id) };
		});
	const payload = {
		packwise: 1,
		exported_at: new Date().toISOString(),
		household: { name: hh.name, home_country: hh.home_country },
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		template: toTree(null),
		trips: listTrips(hh.id).map((tr) => ({ ...tr, items: listTripItems(tr.id) }))
	};
	const file = `packwise-${hh.name.replace(/[^\w-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
	return new Response(JSON.stringify(payload, null, 2), {
		headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${file}"` }
	});
};
