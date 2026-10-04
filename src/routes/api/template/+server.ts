import { error, json } from '@sveltejs/kit';
import { canEditTemplate } from '$lib/server/auth';
import { tx } from '$lib/server/db';
import { publish } from '$lib/server/realtime';
import {
	deleteTemplateNode,
	getTemplateNode,
	insertTemplateNode,
	listBags,
	listPersons,
	listTemplate,
	templateDepth,
	updateTemplateNode
} from '$lib/server/repo';
import { sanitizeNodePatch } from '$lib/server/sanitize';
import { MAX_GROUP_DEPTH } from '$lib/tree';
import type { TemplateNode } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.household) error(404);
	return json({ nodes: listTemplate(locals.household.id) });
};

type Op =
	| { op: 'add'; parent_id: string | null; kind: 'group' | 'item'; name: string; patch?: Record<string, unknown> }
	| { op: 'update'; id: string; patch: Record<string, unknown> }
	| { op: 'delete'; id: string }
	| { op: 'move'; id: string; parent_id: string | null; index: number };

export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	const body = (await request.json()) as Op & { client?: string };
	const ids = { bags: new Set(listBags(hh.id).map((b) => b.id)), persons: new Set(listPersons(hh.id).map((p) => p.id)) };

	const checkParent = (parentId: string | null, kind: 'group' | 'item') => {
		if (!parentId) return;
		const parent = getTemplateNode(hh.id, parentId);
		if (!parent || parent.kind !== 'group') error(400, 'template.err.parent');
		if (kind === 'group' && templateDepth(hh.id, parentId) >= MAX_GROUP_DEPTH) error(400, 'template.err.depth');
	};

	const result = tx(() => {
		const upsert: TemplateNode[] = [];
		const removed: string[] = [];
		switch (body.op) {
			case 'add': {
				const name = String(body.name ?? '').trim();
				if (!name) error(400, 'template.err.name');
				const kind = body.kind === 'group' ? 'group' : 'item';
				checkParent(body.parent_id ?? null, kind);
				const patch = body.patch ? sanitizeNodePatch(body.patch, ids) : {};
				upsert.push(insertTemplateNode(hh.id, { ...patch, kind, name, parent_id: body.parent_id ?? null }));
				break;
			}
			case 'update': {
				const node = updateTemplateNode(hh.id, body.id, sanitizeNodePatch(body.patch ?? {}, ids));
				if (!node) error(404);
				upsert.push(node);
				break;
			}
			case 'delete': {
				const all = listTemplate(hh.id);
				const collect = (id: string) => {
					removed.push(id);
					all.filter((n) => n.parent_id === id).forEach((n) => collect(n.id));
				};
				collect(body.id);
				deleteTemplateNode(hh.id, body.id);
				break;
			}
			case 'move': {
				const node = getTemplateNode(hh.id, body.id);
				if (!node) error(404);
				const parentId = body.parent_id ?? null;
				// no cycles
				for (let cur: string | null = parentId; cur; cur = getTemplateNode(hh.id, cur)?.parent_id ?? null) {
					if (cur === node.id) error(400, 'template.err.cycle');
				}
				checkParent(parentId, node.kind);
				if (node.kind === 'group' && parentId) {
					// the moved group's subtree must still fit
					const all = listTemplate(hh.id);
					const height = (id: string): number =>
						1 + Math.max(0, ...all.filter((n) => n.parent_id === id && n.kind === 'group').map((n) => height(n.id)));
					if (templateDepth(hh.id, parentId) + height(node.id) > MAX_GROUP_DEPTH) error(400, 'template.err.depth');
				}
				const siblings = listTemplate(hh.id)
					.filter((n) => n.parent_id === parentId && n.id !== node.id)
					.sort((a, b) => a.sort - b.sort);
				const index = Math.max(0, Math.min(siblings.length, Math.floor(body.index)));
				siblings.splice(index, 0, node);
				siblings.forEach((s, i) => {
					const updated = updateTemplateNode(hh.id, s.id, s.id === node.id ? { parent_id: parentId, sort: i + 1 } : { sort: i + 1 });
					if (updated) upsert.push(updated);
				});
				break;
			}
			default:
				error(400, 'unknown op');
		}
		return { upsert, removed };
	});

	publish(`tpl:${hh.id}`, 'nodes', { ...result, client: body.client ?? null });
	return json(result);
};
