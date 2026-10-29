import { avatarUrl } from './avatar';
import { all, get, newId, now, run, tx } from './db';
import type { Bag, BagKind, Person, PersonKind, Role, Rules, Section, TemplateNode, TodoTemplate, Trip, TripItem, TripPhase, TripTodo } from '#lib/types.js';
import { overallProgress, type Counts } from '#lib/progress.js';
import { parseCollapsed } from './auth';

// ── Households ───────────────────────────────────────────────────────────────

export function createHousehold(name: string, homeCountry: string | null, ownerId: string | null) {
	const id = newId();
	run('INSERT INTO households (id, name, home_country, created_at) VALUES (?, ?, ?, ?)', id, name.trim(), homeCountry, now());
	if (ownerId) addMember(id, ownerId, 'owner');
	return id;
}

export function addMember(householdId: string, userId: string, role: Role) {
	run(
		`INSERT INTO memberships (household_id, user_id, role) VALUES (?, ?, ?)
		 ON CONFLICT(household_id, user_id) DO UPDATE SET role = excluded.role`,
		householdId,
		userId,
		role
	);
}

export function listMembers(householdId: string) {
	return all<{ user_id: string; role: Role; name: string; email: string | null; color: string; avatar: string | null }>(
		`SELECT m.user_id, m.role, u.name, u.email, u.color, u.avatar FROM memberships m JOIN users u ON u.id = m.user_id
		 WHERE m.household_id = ? ORDER BY u.name`,
		householdId
	).map((m) => ({ ...m, avatar: avatarUrl(m.user_id, m.avatar) }));
}

// ── Persons & bags ───────────────────────────────────────────────────────────

/** Moves a person or bag one step up (-1) or down (+1) and renumbers the list. */
export function moveInList(table: 'persons' | 'bags', householdId: string, id: string, delta: -1 | 1) {
	tx(() => {
		const ids = all<{ id: string }>(`SELECT id FROM ${table} WHERE household_id = ? ORDER BY sort, name`, householdId).map((r) => r.id);
		const from = ids.indexOf(id);
		const to = from + delta;
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		ids.forEach((rowId, i) => run(`UPDATE ${table} SET sort = ? WHERE id = ?`, i + 1, rowId));
	});
}

export function listPersons(householdId: string): Person[] {
	return all<Person>(
		`SELECT p.id, p.name, p.kind, p.color, p.user_id, p.sort, p.emoji, u.avatar FROM persons p LEFT JOIN users u ON u.id = p.user_id
		 WHERE p.household_id = ? ORDER BY p.sort, p.name`,
		householdId
	).map((p) => ({ ...p, avatar: (p.user_id ? avatarUrl(p.user_id, p.avatar) : null) ?? p.emoji ?? null }));
}

export function createPerson(householdId: string, name: string, kind: PersonKind, color: string, userId: string | null = null) {
	const id = newId();
	const sort = (get<{ s: number | null }>('SELECT MAX(sort) AS s FROM persons WHERE household_id = ?', householdId)?.s ?? 0) + 1;
	run('INSERT INTO persons (id, household_id, name, kind, color, user_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?)', id, householdId, name.trim(), kind, color, userId, sort);
	return id;
}

export function listBags(householdId: string): Bag[] {
	return all<Bag>('SELECT id, name, color, icon, sort, person_id, kind FROM bags WHERE household_id = ? ORDER BY sort, name', householdId);
}

export function createBag(householdId: string, name: string, color: string, icon = '🧳', personId: string | null = null, kind: BagKind = 'other') {
	const id = newId();
	const sort = (get<{ s: number | null }>('SELECT MAX(sort) AS s FROM bags WHERE household_id = ?', householdId)?.s ?? 0) + 1;
	run(
		'INSERT INTO bags (id, household_id, name, color, icon, sort, person_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		id,
		householdId,
		name.trim(),
		color,
		icon,
		sort,
		personId,
		kind
	);
	return id;
}

// ── Template ─────────────────────────────────────────────────────────────────

interface TemplateRow extends Omit<TemplateNode, 'rules' | 'per_person' | 'needs_power' | 'consumable'> {
	rules: string;
	per_person: number;
	needs_power: number;
	consumable: number;
}

const TEMPLATE_COLS =
	'id, parent_id, kind, name, sort, bag_id, person_id, qty, qty_mode, qty_extra, qty_max, per_person, rules, needs_power, consumable, note, not_needed_count';

function toNode(r: TemplateRow): TemplateNode {
	let rules: Rules = {};
	try {
		rules = JSON.parse(r.rules || '{}');
	} catch {
		/* ignore */
	}
	return { ...r, rules, per_person: !!r.per_person, needs_power: !!r.needs_power, consumable: !!r.consumable };
}

export function listTemplate(householdId: string): TemplateNode[] {
	return all<TemplateRow>(`SELECT ${TEMPLATE_COLS} FROM template_nodes WHERE household_id = ? ORDER BY sort`, householdId).map(toNode);
}

export function getTemplateNode(householdId: string, id: string): TemplateNode | null {
	const r = get<TemplateRow>(`SELECT ${TEMPLATE_COLS} FROM template_nodes WHERE household_id = ? AND id = ?`, householdId, id);
	return r ? toNode(r) : null;
}

export type NodeInput = Partial<Omit<TemplateNode, 'id'>> & { name: string; kind: 'group' | 'item' };

export function insertTemplateNode(householdId: string, input: NodeInput): TemplateNode {
	const id = newId();
	const sort =
		input.sort ??
		(get<{ s: number | null }>(
			'SELECT MAX(sort) AS s FROM template_nodes WHERE household_id = ? AND parent_id IS ?',
			householdId,
			input.parent_id ?? null
		)?.s ?? 0) + 1;
	run(
		`INSERT INTO template_nodes (id, household_id, parent_id, kind, name, sort, bag_id, person_id, qty, qty_mode, qty_extra, qty_max,
		 per_person, rules, needs_power, consumable, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		householdId,
		input.parent_id ?? null,
		input.kind,
		input.name.trim(),
		sort,
		input.bag_id ?? null,
		input.person_id ?? null,
		input.qty ?? 1,
		input.qty_mode ?? 'fixed',
		input.qty_extra ?? 0,
		input.qty_max ?? null,
		input.per_person ? 1 : 0,
		JSON.stringify(input.rules ?? {}),
		input.needs_power ? 1 : 0,
		input.consumable ? 1 : 0,
		input.note ?? '',
		now()
	);
	return getTemplateNode(householdId, id)!;
}

const NODE_FIELDS = [
	'parent_id',
	'name',
	'sort',
	'bag_id',
	'person_id',
	'qty',
	'qty_mode',
	'qty_extra',
	'qty_max',
	'per_person',
	'rules',
	'needs_power',
	'consumable',
	'note',
	'not_needed_count'
] as const;

export function updateTemplateNode(householdId: string, id: string, patch: Partial<TemplateNode>): TemplateNode | null {
	const sets: string[] = [];
	const values: (string | number | null)[] = [];
	for (const key of NODE_FIELDS) {
		if (!(key in patch)) continue;
		let v = patch[key] as unknown;
		if (key === 'rules') v = JSON.stringify(v ?? {});
		else if (typeof v === 'boolean') v = v ? 1 : 0;
		else if (typeof v === 'string' && key === 'name') v = v.trim();
		sets.push(`${key} = ?`);
		values.push((v ?? null) as string | number | null);
	}
	if (!sets.length) return getTemplateNode(householdId, id);
	run(`UPDATE template_nodes SET ${sets.join(', ')}, updated_at = ? WHERE household_id = ? AND id = ?`, ...values, now(), householdId, id);
	return getTemplateNode(householdId, id);
}

export function deleteTemplateNode(householdId: string, id: string) {
	run('DELETE FROM template_nodes WHERE household_id = ? AND id = ?', householdId, id);
}

/** Depth of a node (1 = top level). */
export function templateDepth(householdId: string, id: string | null): number {
	let depth = 0;
	let cur = id;
	while (cur) {
		depth++;
		cur = get<{ parent_id: string | null }>('SELECT parent_id FROM template_nodes WHERE household_id = ? AND id = ?', householdId, cur)?.parent_id ?? null;
		if (depth > 10) break;
	}
	return depth;
}

export interface StarterNode {
	name: string;
	items?: (string | StarterItem)[];
	groups?: StarterNode[];
	rules?: Rules;
}
export interface StarterItem extends Partial<Omit<TemplateNode, 'id' | 'name' | 'kind' | 'parent_id' | 'bag_id' | 'person_id'>> {
	name: string;
	bag?: number;
}

export function seedTemplate(householdId: string, groups: StarterNode[], bagIds: string[] = []) {
	tx(() => {
		const insertGroup = (g: StarterNode, parent: string | null, sort: number) => {
			const node = insertTemplateNode(householdId, { kind: 'group', name: g.name, parent_id: parent, rules: g.rules, sort });
			let s = 1;
			for (const it of g.items ?? []) {
				const item: StarterItem = typeof it === 'string' ? { name: it } : it;
				const { bag, ...rest } = item;
				insertTemplateNode(householdId, {
					...rest,
					kind: 'item',
					parent_id: node.id,
					sort: s++,
					bag_id: bag !== undefined ? (bagIds[bag] ?? null) : null
				});
			}
			for (const sub of g.groups ?? []) insertGroup(sub, node.id, s++);
		};
		groups.forEach((g, i) => insertGroup(g, null, i + 1));
	});
}

// ── Trips ────────────────────────────────────────────────────────────────────

interface TripRow {
	id: string;
	household_id: string;
	name: string;
	destination: string;
	country: string | null;
	lat: number | null;
	lon: number | null;
	start_date: string;
	end_date: string;
	settings: string;
	weather: string | null;
	warnings: string;
	phase: string;
	todos_enabled: number;
	notes: string;
	weather_at: number | null;
	created_at: number;
	updated_at: number;
}

const parse = <T>(s: string | null, fallback: T): T => {
	if (!s) return fallback;
	try {
		return JSON.parse(s) as T;
	} catch {
		return fallback;
	}
};

function toTrip(r: TripRow): Trip & { household_id: string } {
	return {
		...r,
		settings: parse(r.settings, { persons: [], context: {}, laundryDays: 0 }),
		weather: parse(r.weather, null),
		warnings: parse(r.warnings, []),
		phase: (r.phase === 'return' ? 'return' : 'pack') as TripPhase,
		todos_enabled: !!r.todos_enabled,
		notes: parse(r.notes, [])
	};
}

export function getTrip(id: string) {
	const r = get<TripRow>('SELECT * FROM trips WHERE id = ?', id);
	return r ? toTrip(r) : null;
}

/** Counts behind the progress ring: items packed / back in the bag, to-dos of both lists. */
const COUNT_COLS = `
	(SELECT COUNT(*) FROM trip_items i WHERE i.trip_id = t.id AND i.kind = 'item') AS items_total,
	(SELECT COUNT(*) FROM trip_items i WHERE i.trip_id = t.id AND i.kind = 'item' AND i.checked = 1) AS items_done,
	(SELECT COUNT(*) FROM trip_items i WHERE i.trip_id = t.id AND i.kind = 'item' AND i.consumable = 0) AS return_total,
	(SELECT COUNT(*) FROM trip_items i WHERE i.trip_id = t.id AND i.kind = 'item' AND i.consumable = 0 AND i.returned = 1) AS return_done,
	(SELECT COUNT(*) FROM trip_todos d WHERE d.trip_id = t.id AND d.phase = 'pack') AS pack_todos_total,
	(SELECT COUNT(*) FROM trip_todos d WHERE d.trip_id = t.id AND d.phase = 'pack' AND d.done = 1) AS pack_todos_done,
	(SELECT COUNT(*) FROM trip_todos d WHERE d.trip_id = t.id AND d.phase = 'return') AS return_todos_total,
	(SELECT COUNT(*) FROM trip_todos d WHERE d.trip_id = t.id AND d.phase = 'return' AND d.done = 1) AS return_todos_done`;

interface CountRow {
	items_total: number;
	items_done: number;
	return_total: number;
	return_done: number;
	pack_todos_total: number;
	pack_todos_done: number;
	return_todos_total: number;
	return_todos_done: number;
}

const toCounts = (r: CountRow): Counts => ({
	items: { done: r.items_done, total: r.items_total },
	returnItems: { done: r.return_done, total: r.return_total },
	packTodos: { done: r.pack_todos_done, total: r.pack_todos_total },
	returnTodos: { done: r.return_todos_done, total: r.return_todos_total }
});

export function listTrips(householdId: string, collapsed: Section[] = []) {
	const rows = all<TripRow & CountRow>(`SELECT t.*, ${COUNT_COLS} FROM trips t WHERE t.household_id = ? ORDER BY t.start_date DESC`, householdId);
	return rows.map((r) => {
		const trip = toTrip(r);
		return { ...trip, ...overallProgress(trip.phase, trip.todos_enabled, collapsed, toCounts(r)) };
	});
}

// ── Trip guests (accounts invited to a single trip) ─────────────────────────

export function isTripGuest(tripId: string, userId: string): boolean {
	return !!get('SELECT 1 FROM trip_guests WHERE trip_id = ? AND user_id = ?', tripId, userId);
}

export function addTripGuest(tripId: string, userId: string, addedBy: string | null) {
	run('INSERT OR IGNORE INTO trip_guests (trip_id, user_id, added_by, created_at) VALUES (?, ?, ?, ?)', tripId, userId, addedBy, now());
}

export function removeTripGuest(tripId: string, userId: string) {
	run('DELETE FROM trip_guests WHERE trip_id = ? AND user_id = ?', tripId, userId);
}

export function listTripGuests(tripId: string) {
	return all<{ user_id: string; name: string; email: string | null; color: string; avatar: string | null }>(
		`SELECT g.user_id, u.name, u.email, u.color, u.avatar FROM trip_guests g JOIN users u ON u.id = g.user_id
		 WHERE g.trip_id = ? ORDER BY g.created_at`,
		tripId
	).map((g) => ({ ...g, avatar: avatarUrl(g.user_id, g.avatar) }));
}

/** Trips of other households that this account was invited to. */
export function listSharedTrips(userId: string) {
	const rows = all<TripRow & CountRow & { household_name: string; collapsed: string }>(
		`SELECT t.*, h.name AS household_name, h.collapsed, ${COUNT_COLS}
		 FROM trip_guests g JOIN trips t ON t.id = g.trip_id JOIN households h ON h.id = t.household_id
		 WHERE g.user_id = ?
		   AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.household_id = t.household_id AND m.user_id = g.user_id)
		 ORDER BY t.start_date`,
		userId
	);
	return rows.map((r) => {
		const trip = toTrip(r);
		return { ...trip, ...overallProgress(trip.phase, trip.todos_enabled, parseCollapsed(r.collapsed), toCounts(r)), household_name: r.household_name };
	});
}

interface TripItemRow extends Omit<TripItem, 'needs_power' | 'consumable' | 'checked' | 'returned' | 'not_needed'> {
	needs_power: number;
	consumable: number;
	checked: number;
	returned: number;
	not_needed: number;
}

const ITEM_COLS =
	'id, parent_id, kind, name, sort, template_id, origin, reason, bag_id, person_id, qty, needs_power, consumable, note, checked, checked_by, checked_at, returned, not_needed';

const toItem = (r: TripItemRow): TripItem => ({
	...r,
	needs_power: !!r.needs_power,
	consumable: !!r.consumable,
	checked: !!r.checked,
	returned: !!r.returned,
	not_needed: !!r.not_needed
});

export function listTripItems(tripId: string): TripItem[] {
	return all<TripItemRow>(`SELECT ${ITEM_COLS} FROM trip_items WHERE trip_id = ? ORDER BY sort`, tripId).map(toItem);
}

export function getTripItem(tripId: string, id: string): TripItem | null {
	const r = get<TripItemRow>(`SELECT ${ITEM_COLS} FROM trip_items WHERE trip_id = ? AND id = ?`, tripId, id);
	return r ? toItem(r) : null;
}

export type TripItemInput = Partial<Omit<TripItem, 'id'>> & { name: string; kind: 'group' | 'item' };

export function insertTripItem(tripId: string, input: TripItemInput, id = newId()): TripItem {
	const sort =
		input.sort ??
		(get<{ s: number | null }>('SELECT MAX(sort) AS s FROM trip_items WHERE trip_id = ? AND parent_id IS ?', tripId, input.parent_id ?? null)?.s ?? 0) + 1;
	run(
		`INSERT INTO trip_items (id, trip_id, parent_id, kind, name, sort, template_id, origin, reason, bag_id, person_id, qty,
		 needs_power, consumable, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id,
		tripId,
		input.parent_id ?? null,
		input.kind,
		input.name.trim(),
		sort,
		input.template_id ?? null,
		input.origin ?? 'manual',
		input.reason ?? '',
		input.bag_id ?? null,
		input.person_id ?? null,
		input.qty ?? 1,
		input.needs_power ? 1 : 0,
		input.consumable ? 1 : 0,
		input.note ?? '',
		now()
	);
	return getTripItem(tripId, id)!;
}

const ITEM_FIELDS = [
	'parent_id',
	'name',
	'sort',
	'template_id',
	'origin',
	'bag_id',
	'person_id',
	'qty',
	'needs_power',
	'consumable',
	'note',
	'checked',
	'checked_by',
	'checked_at',
	'returned',
	'not_needed'
] as const;

export function updateTripItem(tripId: string, id: string, patch: Partial<TripItem>): TripItem | null {
	const sets: string[] = [];
	const values: (string | number | null)[] = [];
	for (const key of ITEM_FIELDS) {
		if (!(key in patch)) continue;
		let v = patch[key] as unknown;
		if (typeof v === 'boolean') v = v ? 1 : 0;
		if (key === 'name' && typeof v === 'string') v = v.trim();
		sets.push(`${key} = ?`);
		values.push((v ?? null) as string | number | null);
	}
	if (sets.length) {
		run(`UPDATE trip_items SET ${sets.join(', ')}, updated_at = ? WHERE trip_id = ? AND id = ?`, ...values, now(), tripId, id);
	}
	return getTripItem(tripId, id);
}

/** Deletes an item (and its descendants via FK cascade); returns all removed ids. */
export function deleteTripItem(tripId: string, id: string): string[] {
	const ids: string[] = [];
	const collect = (pid: string) => {
		ids.push(pid);
		for (const c of all<{ id: string }>('SELECT id FROM trip_items WHERE trip_id = ? AND parent_id = ?', tripId, pid)) collect(c.id);
	};
	collect(id);
	run('DELETE FROM trip_items WHERE trip_id = ? AND id = ?', tripId, id);
	return ids;
}

export function touchTrip(id: string) {
	run('UPDATE trips SET updated_at = ? WHERE id = ?', now(), id);
}

export function logActivity(tripId: string, userId: string | null, actor: string, action: string, subject: string) {
	run('INSERT INTO activity (trip_id, user_id, actor, action, subject, at) VALUES (?, ?, ?, ?, ?, ?)', tripId, userId, actor, action, subject, now());
	return { actor, action, subject, at: now(), user_id: userId };
}

export function listActivity(tripId: string, limit = 100) {
	return all<{ actor: string; action: string; subject: string; at: number; user_id: string | null }>(
		'SELECT actor, action, subject, at, user_id FROM activity WHERE trip_id = ? ORDER BY at DESC, id DESC LIMIT ?',
		tripId,
		limit
	);
}

// ── To-dos ───────────────────────────────────────────────────────────────────

interface TodoTemplateRow extends Omit<TodoTemplate, 'rules' | 'phase'> {
	rules: string;
	phase: string;
}

export const asPhase = (v: unknown): TripPhase => (v === 'return' ? 'return' : 'pack');
const toTodoTemplate = (r: TodoTemplateRow): TodoTemplate => ({ ...r, rules: parse(r.rules, {}), phase: asPhase(r.phase) });
const TPL_COLS = 'id, name, days_before, phase, person_id, rules, note';

export function listTodoTemplates(householdId: string): TodoTemplate[] {
	return all<TodoTemplateRow>(`SELECT ${TPL_COLS} FROM todo_templates WHERE household_id = ? ORDER BY days_before DESC, name`, householdId).map(toTodoTemplate);
}

export function getTodoTemplate(householdId: string, id: string): TodoTemplate | null {
	const r = get<TodoTemplateRow>(`SELECT ${TPL_COLS} FROM todo_templates WHERE household_id = ? AND id = ?`, householdId, id);
	return r ? toTodoTemplate(r) : null;
}

export function insertTodoTemplate(householdId: string, input: Partial<Omit<TodoTemplate, 'id'>> & { name: string }): TodoTemplate {
	const id = newId();
	run(
		'INSERT INTO todo_templates (id, household_id, name, days_before, phase, person_id, rules, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		id,
		householdId,
		input.name.trim(),
		input.days_before ?? 0,
		asPhase(input.phase),
		input.person_id ?? null,
		JSON.stringify(input.rules ?? {}),
		input.note ?? '',
		now()
	);
	return getTodoTemplate(householdId, id)!;
}

export function updateTodoTemplate(householdId: string, id: string, patch: Partial<TodoTemplate>): TodoTemplate | null {
	const sets: string[] = [];
	const values: (string | number | null)[] = [];
	for (const key of ['name', 'days_before', 'phase', 'person_id', 'rules', 'note'] as const) {
		if (!(key in patch)) continue;
		sets.push(`${key} = ?`);
		const v = patch[key];
		values.push(key === 'rules' ? JSON.stringify(v ?? {}) : ((v ?? null) as string | number | null));
	}
	if (sets.length) run(`UPDATE todo_templates SET ${sets.join(', ')}, updated_at = ? WHERE household_id = ? AND id = ?`, ...values, now(), householdId, id);
	return getTodoTemplate(householdId, id);
}

export function deleteTodoTemplate(householdId: string, id: string) {
	run('DELETE FROM todo_templates WHERE household_id = ? AND id = ?', householdId, id);
}

interface TripTodoRow extends Omit<TripTodo, 'done' | 'phase'> {
	done: number;
	phase: string;
}

const TODO_COLS = 'id, name, days_before, phase, person_id, note, template_id, origin, done, done_by, done_at';
const toTodo = (r: TripTodoRow): TripTodo => ({ ...r, done: !!r.done, phase: asPhase(r.phase) });

export function listTripTodos(tripId: string): TripTodo[] {
	return all<TripTodoRow>(`SELECT ${TODO_COLS} FROM trip_todos WHERE trip_id = ? ORDER BY days_before DESC, name`, tripId).map(toTodo);
}

export function getTripTodo(tripId: string, id: string): TripTodo | null {
	const r = get<TripTodoRow>(`SELECT ${TODO_COLS} FROM trip_todos WHERE trip_id = ? AND id = ?`, tripId, id);
	return r ? toTodo(r) : null;
}

export function insertTripTodo(tripId: string, input: Partial<Omit<TripTodo, 'id'>> & { name: string }, id = newId()): TripTodo {
	run(
		'INSERT INTO trip_todos (id, trip_id, name, days_before, phase, person_id, note, template_id, origin, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		id,
		tripId,
		input.name.trim(),
		input.days_before ?? 0,
		asPhase(input.phase),
		input.person_id ?? null,
		input.note ?? '',
		input.template_id ?? null,
		input.origin ?? 'manual',
		now()
	);
	return getTripTodo(tripId, id)!;
}

export function updateTripTodo(tripId: string, id: string, patch: Partial<TripTodo>): TripTodo | null {
	const sets: string[] = [];
	const values: (string | number | null)[] = [];
	for (const key of ['name', 'days_before', 'phase', 'person_id', 'note', 'template_id', 'origin', 'done', 'done_by', 'done_at'] as const) {
		if (!(key in patch)) continue;
		let v = patch[key] as unknown;
		if (typeof v === 'boolean') v = v ? 1 : 0;
		sets.push(`${key} = ?`);
		values.push((v ?? null) as string | number | null);
	}
	if (sets.length) run(`UPDATE trip_todos SET ${sets.join(', ')}, updated_at = ? WHERE trip_id = ? AND id = ?`, ...values, now(), tripId, id);
	return getTripTodo(tripId, id);
}

export function deleteTripTodo(tripId: string, id: string) {
	run('DELETE FROM trip_todos WHERE trip_id = ? AND id = ?', tripId, id);
}

export function seedTodos(householdId: string, todos: (Partial<TodoTemplate> & { name: string })[]) {
	tx(() => todos.forEach((t) => insertTodoTemplate(householdId, t)));
}
