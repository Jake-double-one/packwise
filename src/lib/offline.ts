import type { TripItem, TripTodo } from './types';

/**
 * Offline support for a trip: operations are applied locally right away and,
 * when the server can't be reached, kept in a queue (localStorage) that is
 * replayed in order once the connection is back. Ops are idempotent on the
 * server (set-style checks, client-generated ids for new rows).
 */
export type Op = { op: string; [key: string]: unknown };

/** Ops that can be done without a connection. */
export const OFFLINE_OPS = new Set([
	'check',
	'return',
	'update',
	'add',
	'delete',
	'rename',
	'phase',
	'resetReturn',
	'todoCheck',
	'todoAdd',
	'todoUpdate',
	'todoDelete'
]);

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** 16-char base62 id, same format as server ids. */
export function clientRowId(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let out = '';
	for (const b of bytes) {
		if (b < 248) out += ALPHABET[b % 62];
		if (out.length === 16) break;
	}
	return out.length === 16 ? out : clientRowId();
}

const key = (tripId: string) => `pw_queue_${tripId}`;

export function loadQueue(tripId: string): Op[] {
	try {
		const raw = localStorage.getItem(key(tripId));
		return raw ? (JSON.parse(raw) as Op[]) : [];
	} catch {
		return [];
	}
}

export function saveQueue(tripId: string, queue: Op[]) {
	try {
		if (queue.length) localStorage.setItem(key(tripId), JSON.stringify(queue));
		else localStorage.removeItem(key(tripId));
	} catch {
		/* storage full / unavailable – queue stays in memory */
	}
}

export interface TripState {
	items: TripItem[];
	todos: TripTodo[];
	name: string;
	phase: 'pack' | 'return';
}

const ITEM_PATCH = ['name', 'qty', 'bag_id', 'person_id', 'note', 'needs_power', 'consumable'] as const;

/** Applies an op to the local state (optimistic update / offline replay). */
export function applyLocal(state: TripState, op: Op, userId: string | null): TripState {
	const s = { ...state };
	switch (op.op) {
		case 'check':
			s.items = s.items.map((i) => (i.id === op.id ? { ...i, checked: !!op.checked, checked_by: op.checked ? userId : null } : i));
			break;
		case 'return':
			s.items = s.items.map((i) => (i.id === op.id ? { ...i, returned: !!op.returned } : i));
			break;
		case 'resetReturn':
			s.items = s.items.map((i) => ({ ...i, returned: false }));
			break;
		case 'update': {
			const patch = (op.patch ?? {}) as Record<string, unknown>;
			const clean = Object.fromEntries(ITEM_PATCH.filter((k) => k in patch).map((k) => [k, patch[k]]));
			s.items = s.items.map((i) => (i.id === op.id ? { ...i, ...clean } : i));
			break;
		}
		case 'add': {
			if (s.items.some((i) => i.id === op.id)) break;
			const parent = (op.parent_id as string | null) ?? null;
			const sort = Math.max(0, ...s.items.filter((i) => i.parent_id === parent).map((i) => i.sort)) + 1;
			const patch = (op.patch ?? {}) as Partial<TripItem>;
			s.items = [
				...s.items,
				{
					id: String(op.id),
					parent_id: parent,
					kind: op.kind === 'group' ? 'group' : 'item',
					name: String(op.name),
					sort,
					template_id: null,
					origin: 'manual',
					reason: '',
					bag_id: patch.bag_id ?? null,
					person_id: patch.person_id ?? null,
					qty: 1,
					needs_power: false,
					consumable: false,
					note: '',
					checked: false,
					checked_by: null,
					checked_at: null,
					returned: false,
					not_needed: false
				}
			];
			break;
		}
		case 'delete': {
			const gone = new Set([String(op.id)]);
			let grew = true;
			while (grew) {
				grew = false;
				for (const i of s.items) if (i.parent_id && gone.has(i.parent_id) && !gone.has(i.id)) (gone.add(i.id), (grew = true));
			}
			s.items = s.items.filter((i) => !gone.has(i.id));
			break;
		}
		case 'rename':
			s.name = String(op.name);
			break;
		case 'phase':
			s.phase = op.phase === 'return' ? 'return' : 'pack';
			break;
		case 'todoCheck':
			s.todos = s.todos.map((t) => (t.id === op.id ? { ...t, done: !!op.done, done_by: op.done ? userId : null } : t));
			break;
		case 'todoAdd':
			if (s.todos.some((t) => t.id === op.id)) break;
			s.todos = [
				...s.todos,
				{
					id: String(op.id),
					name: String(op.name),
					days_before: Number(op.days_before) || 0,
					person_id: (op.person_id as string) ?? null,
					note: '',
					template_id: null,
					origin: 'manual',
					done: false,
					done_by: null,
					done_at: null
				}
			];
			break;
		case 'todoUpdate': {
			const patch = (op.patch ?? {}) as Partial<TripTodo>;
			s.todos = s.todos.map((t) => (t.id === op.id ? { ...t, ...patch } : t));
			break;
		}
		case 'todoDelete':
			s.todos = s.todos.filter((t) => t.id !== op.id);
			break;
	}
	return s;
}
