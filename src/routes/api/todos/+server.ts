import { error, json } from '@sveltejs/kit';
import { canEditTemplate } from '$lib/server/auth';
import { publish } from '$lib/server/realtime';
import { deleteTodoTemplate, insertTodoTemplate, listPersons, listTodoTemplates, updateTodoTemplate } from '$lib/server/repo';
import { sanitizeRules } from '$lib/server/sanitize';
import type { TodoTemplate } from '$lib/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.household) error(404);
	return json({ todos: listTodoTemplates(locals.household.id) });
};

/** To-do template operations: add | update | delete. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const hh = locals.household;
	if (!hh) error(404);
	if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	const body = (await request.json()) as { op: string; id?: string; name?: string; patch?: Record<string, unknown>; client?: string };
	const persons = new Set(listPersons(hh.id).map((p) => p.id));

	const clean = (p: Record<string, unknown>): Partial<TodoTemplate> => {
		const out: Partial<TodoTemplate> = {};
		if (typeof p.name === 'string' && p.name.trim()) out.name = p.name.trim().slice(0, 200);
		if ('days_before' in p) {
			const n = Math.round(Number(p.days_before));
			out.days_before = Number.isFinite(n) ? Math.max(0, Math.min(365, n)) : 0;
		}
		if ('person_id' in p) out.person_id = typeof p.person_id === 'string' && persons.has(p.person_id) ? p.person_id : null;
		if ('note' in p) out.note = String(p.note ?? '').slice(0, 1000);
		if ('rules' in p) out.rules = sanitizeRules(p.rules);
		return out;
	};

	let upsert: TodoTemplate[] = [];
	let removed: string[] = [];
	if (body.op === 'add') {
		const patch = clean(body.patch ?? {});
		const name = String(body.name ?? '').trim();
		if (!name) error(400, 'template.err.name');
		upsert = [insertTodoTemplate(hh.id, { ...patch, name })];
	} else if (body.op === 'update' && body.id) {
		const t = updateTodoTemplate(hh.id, body.id, clean(body.patch ?? {}));
		if (!t) error(404);
		upsert = [t];
	} else if (body.op === 'delete' && body.id) {
		deleteTodoTemplate(hh.id, body.id);
		removed = [body.id];
	} else error(400, 'unknown op');

	publish(`tpl:${hh.id}`, 'todos', { upsert, removed, client: body.client ?? null });
	return json({ upsert, removed });
};
