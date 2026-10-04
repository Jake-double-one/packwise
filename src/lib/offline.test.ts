import { describe, expect, it } from 'vitest';
import { applyLocal, clientRowId, type TripState } from './offline';
import { generateTodos, todoDue } from './generate';
import type { TodoTemplate, TripItem } from './types';

const item = (id: string, parent: string | null = null, kind: 'group' | 'item' = 'item'): TripItem => ({
	id,
	parent_id: parent,
	kind,
	name: id,
	sort: 1,
	template_id: null,
	origin: 'template',
	reason: '',
	bag_id: null,
	person_id: null,
	qty: 1,
	needs_power: false,
	consumable: false,
	note: '',
	checked: false,
	checked_by: null,
	checked_at: null,
	returned: false,
	not_needed: false
});

const base: TripState = { items: [item('g', null, 'group'), item('a', 'g'), item('b', 'g')], todos: [], name: 'Trip', phase: 'pack', notes: [] };

describe('applyLocal', () => {
	it('checks and returns items', () => {
		let s = applyLocal(base, { op: 'check', id: 'a', checked: true }, 'u1');
		expect(s.items.find((i) => i.id === 'a')).toMatchObject({ checked: true, checked_by: 'u1' });
		s = applyLocal(s, { op: 'return', id: 'a', returned: true }, 'u1');
		expect(s.items.find((i) => i.id === 'a')?.returned).toBe(true);
		s = applyLocal(s, { op: 'resetReturn' }, 'u1');
		expect(s.items.every((i) => !i.returned)).toBe(true);
	});

	it('adds items idempotently with client ids', () => {
		const op = { op: 'add', id: 'NEWITEM000000001', parent_id: 'g', name: 'Scarf' };
		const s = applyLocal(applyLocal(base, op, null), op, null);
		expect(s.items.filter((i) => i.id === 'NEWITEM000000001')).toHaveLength(1);
		expect(s.items.find((i) => i.id === 'NEWITEM000000001')?.origin).toBe('manual');
	});

	it('deletes groups with their children', () => {
		const s = applyLocal(base, { op: 'delete', id: 'g' }, null);
		expect(s.items).toHaveLength(0);
	});

	it('handles to-dos and the phase', () => {
		let s = applyLocal(base, { op: 'todoAdd', id: 'T1', name: 'Plants', days_before: 3 }, null);
		s = applyLocal(s, { op: 'todoCheck', id: 'T1', done: true }, 'u');
		expect(s.todos[0]).toMatchObject({ name: 'Plants', days_before: 3, done: true });
		s = applyLocal(s, { op: 'phase', phase: 'return' }, null);
		expect(s.phase).toBe('return');
		s = applyLocal(s, { op: 'todoDelete', id: 'T1' }, null);
		expect(s.todos).toHaveLength(0);
	});

	it('moves items into another group', () => {
		const st = { ...base, items: [...base.items, item('h', null, 'group')] };
		const s = applyLocal(st, { op: 'move', id: 'a', parent_id: 'h' }, null);
		expect(s.items.find((i) => i.id === 'a')?.parent_id).toBe('h');
	});

	it('adds, edits and removes notes', () => {
		let s = applyLocal(base, { op: 'noteAdd', id: 'N1', kind: 'secret', label: 'WLAN', value: 'abc' }, null);
		s = applyLocal(s, { op: 'noteUpdate', id: 'N1', patch: { value: 'xyz' } }, null);
		expect(s.notes).toEqual([{ id: 'N1', kind: 'secret', label: 'WLAN', value: 'xyz' }]);
		expect(applyLocal(s, { op: 'noteDelete', id: 'N1' }, null).notes).toEqual([]);
	});

	it('only patches known item fields', () => {
		const s = applyLocal(base, { op: 'update', id: 'a', patch: { name: 'New', checked: true, qty: 3 } }, null);
		expect(s.items.find((i) => i.id === 'a')).toMatchObject({ name: 'New', qty: 3, checked: false });
	});

	it('generates server-compatible ids', () => {
		expect(clientRowId()).toMatch(/^[0-9A-Za-z]{16}$/);
	});
});

describe('to-dos', () => {
	const tpl = (name: string, rules = {}, person_id: string | null = null): TodoTemplate => ({ id: name, name, days_before: 1, person_id, rules, note: '' });

	it('uses chip rules and travelling persons', () => {
		const list = [tpl('Check-in', { transport: { plane: 1 } }), tpl('Plants'), tpl('Kid stuff', {}, 'p2')];
		const byCar = generateTodos(list, { persons: ['p1'], context: { transport: ['car'] }, laundryDays: 0 });
		expect(byCar.map((x) => x.name)).toEqual(['Plants']);
		const byPlane = generateTodos(list, { persons: ['p1', 'p2'], context: { transport: ['plane'] }, laundryDays: 0 });
		expect(byPlane.map((x) => x.name)).toEqual(['Check-in', 'Plants', 'Kid stuff']);
	});

	it('computes due dates', () => {
		expect(todoDue('2026-07-10', 3)).toBe('2026-07-07');
		expect(todoDue('2026-03-01', 1)).toBe('2026-02-28');
	});
});
