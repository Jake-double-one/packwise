import { error, json } from '@sveltejs/kit';
import { canEditTemplate } from '$lib/server/auth';
import { tx } from '$lib/server/db';
import { publish } from '$lib/server/realtime';
import { insertTemplateNode, listTemplate } from '$lib/server/repo';
import { MAX_GROUP_DEPTH } from '$lib/tree';
import type { ImportTreeNode } from '$lib/importer';
import type { TemplateNode } from '$lib/types';
import type { RequestHandler } from './$types';

/** Merges an import tree into the template: groups with equal names are reused, existing items skipped. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	const body = (await request.json()) as { nodes: ImportTreeNode[] };
	if (!Array.isArray(body.nodes)) error(400);

	const existing = listTemplate(hh.id);
	const created: TemplateNode[] = [];
	let skipped = 0;
	const key = (s: string) => s.trim().toLowerCase();

	tx(() => {
		const insert = (nodes: ImportTreeNode[], parentId: string | null, depth: number) => {
			for (const n of nodes.slice(0, 2000)) {
				const name = String(n?.name ?? '').trim().slice(0, 200);
				if (!name) continue;
				const siblings = [...existing, ...created].filter((x) => x.parent_id === parentId);
				const isGroup = n.kind === 'group' && depth < MAX_GROUP_DEPTH;
				const match = siblings.find((x) => x.kind === (isGroup ? 'group' : 'item') && key(x.name) === key(name));
				if (isGroup) {
					const group = match ?? insertTemplateNode(hh.id, { kind: 'group', name, parent_id: parentId });
					if (!match) created.push(group);
					insert(Array.isArray(n.children) ? n.children : [], group.id, depth + 1);
				} else {
					if (match) {
						skipped++;
					} else {
						const qty = Math.max(1, Math.min(999, Math.round(Number(n.qty) || 1)));
						created.push(insertTemplateNode(hh.id, { kind: 'item', name, parent_id: parentId, qty }));
					}
					// children of an over-deep group become siblings
					if (Array.isArray(n.children) && n.children.length) insert(n.children, parentId, depth);
				}
			}
		};
		insert(body.nodes, null, 0);
	});

	publish(`tpl:${hh.id}`, 'nodes', { upsert: created, removed: [], client: null });
	return json({ created: created.filter((c) => c.kind === 'item').length, groups: created.filter((c) => c.kind === 'group').length, skipped });
};
