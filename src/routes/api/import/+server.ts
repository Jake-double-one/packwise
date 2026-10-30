import { error } from '@sveltejs/kit';
import { canEditTemplate, householdsFor, type AppHousehold } from '#lib/server/auth.js';
import { tx } from '#lib/server/db.js';
import { publish } from '#lib/server/realtime.js';
import { insertTemplateNode, listBags, listPersons, listTemplate } from '#lib/server/repo.js';
import { childrenMap, MAX_GROUP_DEPTH } from '#lib/tree.js';
import type { ImportTreeNode } from '#lib/importer.js';
import type { SessionUser } from '#lib/server/auth.js';
import type { TemplateNode } from '#lib/types.js';
import type { RequestHandler } from './$types';

const MAX_IMPORT_NODES = 20_000;
const MAX_IMPORT_NESTING = 32;

const key = (s: string) => s.trim().toLowerCase();
/** siblings by parent, kind and name – one lookup per node instead of a scan of the whole template */
const slot = (parent: string | null, kind: string, name: string) => `${parent ?? ''}\u0000${kind}\u0000${key(name)}`;
function indexOf(nodes: TemplateNode[]) {
	const index = new Map<string, TemplateNode>();
	for (const x of nodes) if (!index.has(slot(x.parent_id, x.kind, x.name))) index.set(slot(x.parent_id, x.kind, x.name), x);
	return index;
}

/**
 * Merges an import into the template: groups with equal names are reused, existing items skipped.
 * Either a tree parsed from text/JSON (`nodes`), or picked nodes of another household of the
 * same user (`from` + `ids`) – those come with all their settings.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	const body = (await request.json()) as { nodes?: ImportTreeNode[]; from?: string; ids?: unknown[] };
	if (typeof body.from === 'string') return copyFromHousehold(hh, locals.user, body.from, body.ids);
	const nodes = body.nodes;
	if (!Array.isArray(nodes)) error(400);

	const created: TemplateNode[] = [];
	let skipped = 0;
	const index = indexOf(listTemplate(hh.id));
	// far beyond any real packing list – an import file can't keep the server busy for long
	let budget = MAX_IMPORT_NODES;

	tx(() => {
		const insert = (nodes: ImportTreeNode[], parentId: string | null, depth: number, nesting: number) => {
			if (nesting > MAX_IMPORT_NESTING) return;
			for (const n of nodes.slice(0, 2000)) {
				if (--budget < 0) return;
				const name = String(n?.name ?? '').trim().slice(0, 200);
				if (!name) continue;
				const isGroup = n.kind === 'group' && depth < MAX_GROUP_DEPTH;
				const kind = isGroup ? 'group' : 'item';
				const match = index.get(slot(parentId, kind, name));
				if (isGroup) {
					const group = match ?? insertTemplateNode(hh.id, { kind: 'group', name, parent_id: parentId });
					if (!match) {
						created.push(group);
						index.set(slot(parentId, kind, name), group);
					}
					insert(Array.isArray(n.children) ? n.children : [], group.id, depth + 1, nesting + 1);
				} else {
					if (match) {
						skipped++;
					} else {
						const qty = Math.max(1, Math.min(999, Math.round(Number(n.qty) || 1)));
						const item = insertTemplateNode(hh.id, { kind: 'item', name, parent_id: parentId, qty });
						created.push(item);
						index.set(slot(parentId, kind, name), item);
					}
					// children of an over-deep group become siblings
					if (Array.isArray(n.children) && n.children.length) insert(n.children, parentId, depth, nesting + 1);
				}
			}
		};
		insert(nodes, null, 0, 0);
	});

	publish(`tpl:${hh.id}`, 'nodes', { upsert: created, removed: [], client: null });
	return Response.json({ created: created.filter((c) => c.kind === 'item').length, groups: created.filter((c) => c.kind === 'group').length, skipped });
};

/** Copies picked nodes of another household's template with all their settings; the categories above them are created or reused by name. */
function copyFromHousehold(hh: AppHousehold, user: SessionUser | null, fromId: string, rawIds: unknown) {
	const from = householdsFor(user).find((h) => h.id === fromId && h.id !== hh.id && h.role !== 'guest');
	if (!from) error(404);
	const source = listTemplate(from.id);
	const byId = new Map(source.map((n) => [n.id, n]));
	const ids = Array.isArray(rawIds) ? rawIds.filter((x): x is string => typeof x === 'string').slice(0, MAX_IMPORT_NODES) : [];
	const wanted = new Set(ids.filter((id) => byId.has(id)));
	// every category that holds something wanted is needed as its container
	const needed = new Set<string>();
	for (const id of wanted) for (let p = byId.get(id)?.parent_id; p && !needed.has(p); p = byId.get(p)?.parent_id) needed.add(p);
	// people and bags belong to the household – matched by name, otherwise the item is for everybody / without a bag
	const persons = new Map(listPersons(hh.id).map((p) => [key(p.name), p.id]));
	const bags = new Map(listBags(hh.id).map((b) => [key(b.name), b.id]));
	const srcPersons = new Map(listPersons(from.id).map((p) => [p.id, p.name]));
	const srcBags = new Map(listBags(from.id).map((b) => [b.id, b.name]));
	const children = childrenMap(source);
	const index = indexOf(listTemplate(hh.id));
	const created: TemplateNode[] = [];
	let skipped = 0;
	let unmapped = 0;

	const settings = (n: TemplateNode) => {
		const { id: _id, parent_id: _p, sort: _s, not_needed_count: _n, person_id, bag_id, ...rest } = n;
		const person = person_id ? (persons.get(key(srcPersons.get(person_id) ?? '')) ?? null) : null;
		const bag = bag_id ? (bags.get(key(srcBags.get(bag_id) ?? '')) ?? null) : null;
		if ((person_id && !person) || (bag_id && !bag)) unmapped++;
		return { ...rest, person_id: person, bag_id: bag };
	};
	tx(() => {
		const walk = (parent: string | null, targetParent: string | null, depth: number) => {
			for (const n of children.get(parent) ?? []) {
				if (n.kind === 'group') {
					if (!wanted.has(n.id) && !needed.has(n.id)) continue;
					// deeper than the template allows: its contents join the category above
					if (depth >= MAX_GROUP_DEPTH) {
						walk(n.id, targetParent, depth);
						continue;
					}
					let group = index.get(slot(targetParent, 'group', n.name));
					if (!group) {
						group = insertTemplateNode(hh.id, { ...settings(n), parent_id: targetParent });
						created.push(group);
						index.set(slot(targetParent, 'group', n.name), group);
					}
					walk(n.id, group.id, depth + 1);
				} else if (wanted.has(n.id)) {
					if (index.get(slot(targetParent, 'item', n.name))) {
						skipped++;
						continue;
					}
					const item = insertTemplateNode(hh.id, { ...settings(n), parent_id: targetParent });
					created.push(item);
					index.set(slot(targetParent, 'item', n.name), item);
				}
			}
		};
		walk(null, null, 0);
	});

	if (created.length) publish(`tpl:${hh.id}`, 'nodes', { upsert: created, removed: [], client: null });
	return Response.json({ created: created.filter((c) => c.kind === 'item').length, groups: created.filter((c) => c.kind === 'group').length, skipped, unmapped });
}
