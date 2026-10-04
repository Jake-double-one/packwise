import { error } from '@sveltejs/kit';
import { canEditTemplate, householdsFor, type AppHousehold, type SessionUser } from './auth';
import { newId, now, run, tx } from './db';
import { publish } from './realtime';
import {
	deleteTodoTemplate,
	deleteTripTodo,
	getTodoTemplate,
	getTripTodo,
	insertTodoTemplate,
	insertTripTodo,
	listTodoTemplates,
	listTripTodos,
	updateTodoTemplate,
	updateTripTodo,
	deleteTemplateNode,
	deleteTripItem,
	getTemplateNode,
	getTrip,
	getTripItem,
	insertTemplateNode,
	insertTripItem,
	listBags,
	listPersons,
	listTemplate,
	listTripItems,
	logActivity,
	templateDepth,
	touchTrip,
	updateTemplateNode,
	updateTripItem
} from './repo';
import { sanitizeItemPatch } from './sanitize';
import { generate, generateTodos, type GenerateInput } from '$lib/generate';
import { translate } from '$lib/i18n';
import { messagesFor } from './i18n';
import { MAX_GROUP_DEPTH, ancestors } from '$lib/tree';
import type { TemplateNode, TodoTemplate, TripItem, TripPhase, TripSettings, TripTodo, WeatherSummary } from '$lib/types';
import { DIMENSION_MAP } from '$lib/context';
import { COUNTRIES } from '$lib/data/countries';

export function tripAccess(locals: App.Locals, id: string) {
	const trip = getTrip(id);
	if (!trip) error(404, 'trip.not_found');
	const hh = householdsFor(locals.user).find((h) => h.id === trip.household_id);
	if (!hh) error(404, 'trip.not_found');
	return { trip, hh };
}

// ── Creation ─────────────────────────────────────────────────────────────────

export interface CreateTripInput {
	name: string;
	destination: string;
	country: string | null;
	lat: number | null;
	lon: number | null;
	start: string;
	end: string;
	settings: TripSettings;
	weather: WeatherSummary | null;
	forceInclude: string[];
	forceExclude: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeCreate(body: Record<string, any>, hh: AppHousehold): CreateTripInput {
	const start = String(body.start ?? '');
	const end = String(body.end ?? '');
	if (!DATE.test(start) || !DATE.test(end) || end < start) error(400, 'trip.err.dates');
	const persons = new Set(listPersons(hh.id).map((p) => p.id));
	const ctx: Record<string, string[]> = {};
	for (const [dim, values] of Object.entries((body.settings?.context ?? {}) as Record<string, unknown>)) {
		const def = DIMENSION_MAP[dim];
		if (!def || !Array.isArray(values)) continue;
		ctx[dim] = values.filter((v): v is string => typeof v === 'string' && def.values.includes(v));
	}
	const w = body.weather;
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
	const weather: WeatherSummary | null =
		w && typeof w === 'object'
			? {
					source: w.source === 'forecast' ? 'forecast' : 'climate',
					days: num(w.days),
					avgMax: num(w.avgMax),
					avgMin: num(w.avgMin),
					maxMax: num(w.maxMax),
					minMin: num(w.minMin),
					rainShare: num(w.rainShare),
					precipProb: typeof w.precipProb === 'number' ? w.precipProb : null,
					snowPerDay: num(w.snowPerDay),
					...(w.years ? { years: num(w.years) } : {})
				}
			: null;
	const country = typeof body.country === 'string' && COUNTRIES[body.country.toUpperCase()] ? body.country.toUpperCase() : null;
	const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
	return {
		name: String(body.name ?? '').trim().slice(0, 120) || String(body.destination ?? '').trim() || 'Trip',
		destination: String(body.destination ?? '').trim().slice(0, 200),
		country,
		lat: typeof body.lat === 'number' ? body.lat : null,
		lon: typeof body.lon === 'number' ? body.lon : null,
		start,
		end,
		settings: {
			persons: ids(body.settings?.persons).filter((p) => persons.has(p)),
			context: ctx,
			laundryDays: Math.max(0, Math.min(60, Math.round(Number(body.settings?.laundryDays) || 0))),
			todos: !!body.settings?.todos
		},
		weather,
		forceInclude: ids(body.forceInclude),
		forceExclude: ids(body.forceExclude)
	};
}

export function createTrip(hh: AppHousehold, user: SessionUser | null, input: CreateTripInput, locale: string) {
	const messages = messagesFor(locale);
	const genInput: GenerateInput = {
		nodes: listTemplate(hh.id),
		persons: listPersons(hh.id),
		settings: input.settings,
		startDate: input.start,
		endDate: input.end,
		homeCountry: hh.home_country,
		destCountry: input.country,
		weather: input.weather,
		forceInclude: input.forceInclude,
		forceExclude: input.forceExclude,
		locale,
		t: (k, p) => translate(messages, k, p)
	};
	const result = generate(genInput);
	const id = newId(12);
	tx(() => {
		run(
			`INSERT INTO trips (id, household_id, name, destination, country, lat, lon, start_date, end_date, settings, weather, warnings, todos_enabled, created_by, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id,
			hh.id,
			input.name,
			input.destination,
			input.country,
			input.lat,
			input.lon,
			input.start,
			input.end,
			JSON.stringify(input.settings),
			input.weather ? JSON.stringify(input.weather) : null,
			JSON.stringify(result.warnings),
			input.settings.todos ? 1 : 0,
			user?.id ?? null,
			now(),
			now()
		);
		const keyToId = new Map<string, string>();
		for (const it of result.items) {
			const itemId = newId();
			keyToId.set(it.key, itemId);
			insertTripItem(
				id,
				{
					parent_id: it.parentKey ? (keyToId.get(it.parentKey) ?? null) : null,
					kind: it.kind,
					name: it.name,
					sort: it.sort,
					template_id: it.template_id,
					origin: it.origin,
					reason: it.reason,
					bag_id: it.bag_id,
					person_id: it.person_id,
					qty: it.qty,
					needs_power: it.needs_power,
					consumable: it.consumable,
					note: it.note
				},
				itemId
			);
		}
		if (input.settings.todos) {
			for (const td of generateTodos(listTodoTemplates(hh.id), input.settings)) insertTripTodo(id, { ...td, origin: 'template' });
		}
		logActivity(id, user?.id ?? null, user?.name ?? '?', 'created', input.name);
	});
	return id;
}

// ── Live operations ─────────────────────────────────────────────────────────

export type TripOp =
	| { op: 'check'; id: string; checked: boolean }
	| { op: 'update'; id: string; patch: Record<string, unknown> }
	| { op: 'add'; id?: string; parent_id: string | null; kind?: 'group' | 'item'; name: string; patch?: Record<string, unknown> }
	| { op: 'delete'; id: string; alsoTemplate?: boolean }
	| { op: 'promote'; id: string }
	| { op: 'syncTemplate'; id: string }
	| { op: 'rename'; name: string }
	| { op: 'return'; id: string; returned: boolean }
	| { op: 'phase'; phase: TripPhase }
	| { op: 'resetReturn' }
	| { op: 'todos'; enabled: boolean }
	| { op: 'todoCheck'; id: string; done: boolean }
	| { op: 'todoAdd'; id?: string; name: string; days_before?: number; person_id?: string | null }
	| { op: 'todoUpdate'; id: string; patch: Record<string, unknown> }
	| { op: 'todoDelete'; id: string; alsoTemplate?: boolean }
	| { op: 'todoPromote'; id: string };

export interface OpResult {
	upsert: TripItem[];
	removed: string[];
	activity?: ReturnType<typeof logActivity>;
	template?: { upsert: TemplateNode[]; removed: string[] };
	trip?: { name?: string; phase?: TripPhase; todos_enabled?: boolean };
	todos?: { upsert: TripTodo[]; removed: string[] };
	todoTemplate?: { upsert: TodoTemplate[]; removed: string[] };
}

/** Client-generated ids (offline mode) must look like ours. */
const CLIENT_ID = /^[0-9A-Za-z]{16}$/;

export function applyTripOp(tripId: string, hh: AppHousehold, user: SessionUser | null, op: TripOp): OpResult {
	const actor = user?.name ?? '?';
	const uid = user?.id ?? null;
	const ids = { bags: new Set(listBags(hh.id).map((b) => b.id)), persons: new Set(listPersons(hh.id).map((p) => p.id)) };
	const item = (id: string) => {
		const it = getTripItem(tripId, id);
		if (!it) error(404, 'trip.err.item');
		return it;
	};
	const needTemplateRights = () => {
		if (!canEditTemplate(hh)) error(403, 'error.forbidden');
	};

	const result = tx((): OpResult => {
		switch (op.op) {
			case 'check': {
				const it = item(op.id);
				const updated = updateTripItem(tripId, it.id, {
					checked: !!op.checked,
					checked_by: op.checked ? uid : null,
					checked_at: op.checked ? now() : null
				})!;
				return { upsert: [updated], removed: [], activity: logActivity(tripId, uid, actor, op.checked ? 'checked' : 'unchecked', it.name) };
			}
			case 'update': {
				const it = item(op.id);
				const updated = updateTripItem(tripId, it.id, sanitizeItemPatch(op.patch ?? {}, ids))!;
				return { upsert: [updated], removed: [], activity: logActivity(tripId, uid, actor, 'edited', updated.name) };
			}
			case 'add': {
				const name = String(op.name ?? '').trim();
				if (!name) error(400, 'template.err.name');
				const wantedId = op.id && CLIENT_ID.test(op.id) ? op.id : undefined;
				// replayed offline op: already applied
				const existing = wantedId ? getTripItem(tripId, wantedId) : null;
				if (existing) return { upsert: [existing], removed: [] };
				const parent = op.parent_id ? item(op.parent_id) : null;
				if (parent && parent.kind !== 'group') error(400, 'template.err.parent');
				const created = insertTripItem(tripId, {
					...sanitizeItemPatch(op.patch ?? {}, ids),
					kind: op.kind === 'group' ? 'group' : 'item',
					name,
					parent_id: parent?.id ?? null,
					origin: 'manual'
				}, wantedId);
				return { upsert: [created], removed: [], activity: logActivity(tripId, uid, actor, 'added', name) };
			}
			case 'delete': {
				const maybe = getTripItem(tripId, op.id);
				if (!maybe) return { upsert: [], removed: [op.id] };
				const it = maybe;
				let template: OpResult['template'];
				if (op.alsoTemplate && it.template_id && getTemplateNode(hh.id, it.template_id)) {
					needTemplateRights();
					const removedNodes = [it.template_id, ...collectTemplateDescendants(hh.id, it.template_id)];
					deleteTemplateNode(hh.id, it.template_id);
					template = { upsert: [], removed: removedNodes };
				}
				const removed = deleteTripItem(tripId, it.id);
				return {
					upsert: [],
					removed,
					template,
					activity: logActivity(tripId, uid, actor, op.alsoTemplate ? 'removed_template' : 'removed', it.name)
				};
			}
			case 'promote': {
				needTemplateRights();
				const it = item(op.id);
				const all = listTripItems(tripId);
				const chain = ancestors(all, it.parent_id);
				const tplUpsert: TemplateNode[] = [];
				const tripUpsert: TripItem[] = [];
				let parentTpl: string | null = null;
				for (const g of chain) {
					const existing = g.template_id ? getTemplateNode(hh.id, g.template_id) : null;
					if (existing && existing.kind === 'group') {
						parentTpl = existing.id;
						continue;
					}
					if (templateDepth(hh.id, parentTpl) >= MAX_GROUP_DEPTH) break;
					const node = insertTemplateNode(hh.id, { kind: 'group', name: g.name, parent_id: parentTpl });
					tplUpsert.push(node);
					tripUpsert.push(updateTripItem(tripId, g.id, { template_id: node.id, origin: 'template' })!);
					parentTpl = node.id;
				}
				const node = insertTemplateNode(hh.id, {
					kind: it.kind,
					name: it.name,
					parent_id: parentTpl,
					bag_id: it.bag_id,
					person_id: it.person_id,
					qty: it.qty,
					needs_power: it.needs_power,
					consumable: it.consumable,
					note: it.note
				});
				tplUpsert.push(node);
				tripUpsert.push(updateTripItem(tripId, it.id, { template_id: node.id, origin: 'template' })!);
				return {
					upsert: tripUpsert,
					removed: [],
					template: { upsert: tplUpsert, removed: [] },
					activity: logActivity(tripId, uid, actor, 'promoted', it.name)
				};
			}
			case 'syncTemplate': {
				needTemplateRights();
				const it = item(op.id);
				if (!it.template_id) error(400, 'trip.err.not_linked');
				const node = updateTemplateNode(hh.id, it.template_id, {
					name: it.name,
					bag_id: it.bag_id,
					note: it.note,
					needs_power: it.needs_power,
					consumable: it.consumable
				});
				if (!node) error(404, 'trip.err.not_linked');
				return { upsert: [], removed: [], template: { upsert: [node], removed: [] }, activity: logActivity(tripId, uid, actor, 'synced', it.name) };
			}
			case 'rename': {
				const name = String(op.name ?? '').trim().slice(0, 120);
				if (!name) error(400, 'template.err.name');
				run('UPDATE trips SET name = ? WHERE id = ?', name, tripId);
				return { upsert: [], removed: [], trip: { name }, activity: logActivity(tripId, uid, actor, 'renamed', name) };
			}
			case 'return': {
				const it = item(op.id);
				const updated = updateTripItem(tripId, it.id, { returned: !!op.returned })!;
				return { upsert: [updated], removed: [], activity: logActivity(tripId, uid, actor, op.returned ? 'returned' : 'unreturned', it.name) };
			}
			case 'phase': {
				const phase: TripPhase = op.phase === 'return' ? 'return' : 'pack';
				run('UPDATE trips SET phase = ? WHERE id = ?', phase, tripId);
				return { upsert: [], removed: [], trip: { phase }, activity: logActivity(tripId, uid, actor, `phase_${phase}`, '') };
			}
			case 'resetReturn': {
				run('UPDATE trip_items SET returned = 0, updated_at = ? WHERE trip_id = ?', now(), tripId);
				return { upsert: listTripItems(tripId), removed: [], activity: logActivity(tripId, uid, actor, 'reset_return', '') };
			}
			case 'todos': {
				const enabled = !!op.enabled;
				run('UPDATE trips SET todos_enabled = ? WHERE id = ?', enabled ? 1 : 0, tripId);
				const upsert: TripTodo[] = [];
				if (enabled && listTripTodos(tripId).length === 0) {
					const trip = getTrip(tripId)!;
					for (const td of generateTodos(listTodoTemplates(hh.id), trip.settings)) upsert.push(insertTripTodo(tripId, { ...td, origin: 'template' }));
				}
				return { upsert: [], removed: [], trip: { todos_enabled: enabled }, todos: { upsert, removed: [] } };
			}
			case 'todoCheck': {
				const td = getTripTodo(tripId, op.id);
				if (!td) error(404, 'trip.err.item');
				const updated = updateTripTodo(tripId, td.id, { done: !!op.done, done_by: op.done ? uid : null, done_at: op.done ? now() : null })!;
				return { upsert: [], removed: [], todos: { upsert: [updated], removed: [] }, activity: logActivity(tripId, uid, actor, op.done ? 'todo_done' : 'todo_undone', td.name) };
			}
			case 'todoAdd': {
				const name = String(op.name ?? '').trim().slice(0, 200);
				if (!name) error(400, 'template.err.name');
				const wantedId = op.id && CLIENT_ID.test(op.id) ? op.id : undefined;
				const existing = wantedId ? getTripTodo(tripId, wantedId) : null;
				if (existing) return { upsert: [], removed: [], todos: { upsert: [existing], removed: [] } };
				const created = insertTripTodo(
					tripId,
					{
						name,
						days_before: clampDays(op.days_before),
						person_id: op.person_id && ids.persons.has(op.person_id) ? op.person_id : null,
						origin: 'manual'
					},
					wantedId
				);
				return { upsert: [], removed: [], todos: { upsert: [created], removed: [] }, activity: logActivity(tripId, uid, actor, 'todo_added', name) };
			}
			case 'todoUpdate': {
				const td = getTripTodo(tripId, op.id);
				if (!td) error(404, 'trip.err.item');
				const p = op.patch ?? {};
				const patch: Partial<TripTodo> = {};
				if (typeof p.name === 'string' && p.name.trim()) patch.name = p.name.trim().slice(0, 200);
				if ('days_before' in p) patch.days_before = clampDays(p.days_before);
				if ('person_id' in p) patch.person_id = typeof p.person_id === 'string' && ids.persons.has(p.person_id) ? p.person_id : null;
				if ('note' in p) patch.note = String(p.note ?? '').slice(0, 1000);
				const updated = updateTripTodo(tripId, td.id, patch)!;
				return { upsert: [], removed: [], todos: { upsert: [updated], removed: [] } };
			}
			case 'todoDelete': {
				const td = getTripTodo(tripId, op.id);
				if (!td) return { upsert: [], removed: [], todos: { upsert: [], removed: [op.id] } };
				let todoTemplate: OpResult['todoTemplate'];
				if (op.alsoTemplate && td.template_id && getTodoTemplate(hh.id, td.template_id)) {
					needTemplateRights();
					deleteTodoTemplate(hh.id, td.template_id);
					todoTemplate = { upsert: [], removed: [td.template_id] };
				}
				deleteTripTodo(tripId, td.id);
				return {
					upsert: [],
					removed: [],
					todos: { upsert: [], removed: [td.id] },
					todoTemplate,
					activity: logActivity(tripId, uid, actor, 'todo_removed', td.name)
				};
			}
			case 'todoPromote': {
				needTemplateRights();
				const td = getTripTodo(tripId, op.id);
				if (!td) error(404, 'trip.err.item');
				const tpl = insertTodoTemplate(hh.id, { name: td.name, days_before: td.days_before, person_id: td.person_id, note: td.note });
				const updated = updateTripTodo(tripId, td.id, { template_id: tpl.id, origin: 'template' })!;
				return {
					upsert: [],
					removed: [],
					todos: { upsert: [updated], removed: [] },
					todoTemplate: { upsert: [tpl], removed: [] },
					activity: logActivity(tripId, uid, actor, 'promoted', td.name)
				};
			}
			default:
				error(400, 'unknown op');
		}
	});
	touchTrip(tripId);
	return result;
}

function clampDays(v: unknown): number {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? Math.max(0, Math.min(365, n)) : 0;
}

function collectTemplateDescendants(householdId: string, id: string): string[] {
	const all = listTemplate(householdId);
	const out: string[] = [];
	const walk = (pid: string) => {
		for (const n of all.filter((x) => x.parent_id === pid)) {
			out.push(n.id);
			walk(n.id);
		}
	};
	walk(id);
	return out;
}

export function broadcastTripOp(tripId: string, hhId: string, result: OpResult, client: string | null) {
	publish(`trip:${tripId}`, 'ops', { ...result, client });
	if (result.template) publish(`tpl:${hhId}`, 'nodes', { ...result.template, client: null });
	if (result.todoTemplate) publish(`tpl:${hhId}`, 'todos', { ...result.todoTemplate, client: null });
}
