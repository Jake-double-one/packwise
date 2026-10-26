import { error } from '@sveltejs/kit';
import { canEditTemplate } from '#lib/server/auth.js';
import { tx } from '#lib/server/db.js';
import { publish } from '#lib/server/realtime.js';
import { insertTemplateNode, listTemplate } from '#lib/server/repo.js';
import { MAX_GROUP_DEPTH } from '#lib/tree.js';
import type { ImportTreeNode } from '#lib/importer.js';
import type { TemplateNode } from '#lib/types.js';
import type { RequestHandler } from './$types';

const MAX_IMPORT_NODES = 20_000;
const MAX_IMPORT_NESTING = 32;

/** Merges an import tree into the template: groups with equal names are reused, existing items skipped. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	const body = (await request.json()) as { nodes: ImportTreeNode[] };
	if (!Array.isArray(body.nodes)) error(400);

	const created: TemplateNode[] = [];
	let skipped = 0;
	const key = (s: string) => s.trim().toLowerCase();
	// siblings by parent, kind and name – one lookup per node instead of a scan of the whole template
	const index = new Map<string, TemplateNode>();
	const slot = (parent: string | null, kind: string, name: string) => `${parent ?? ''}\u0000${kind}\u0000${key(name)}`;
	for (const x of listTemplate(hh.id)) if (!index.has(slot(x.parent_id, x.kind, x.name))) index.set(slot(x.parent_id, x.kind, x.name), x);
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
		insert(body.nodes, null, 0, 0);
	});

	publish(`tpl:${hh.id}`, 'nodes', { upsert: created, removed: [], client: null });
	return Response.json({ created: created.filter((c) => c.kind === 'item').length, groups: created.filter((c) => c.kind === 'group').length, skipped });
};
