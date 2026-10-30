import { describe, expect, it } from 'vitest';
import { exportFileName, tripMarkdown } from './export';
import type { TripItem, TripTodo } from './types';

const t = (key: string) => ({ 'todo.title': 'Before departure', 'todo.title_return': 'Before heading home', 'trip.list_title': 'Packing list', 'trip.phase_return': 'Heading home', 'trip.used_up': 'used up' })[key] ?? key;

function item(over: Partial<TripItem> & { id: string; name: string }): TripItem {
	return {
		parent_id: null, kind: 'item', sort: 0, template_id: null, origin: 'manual', reason: '', bag_id: null, person_id: null, qty: 1,
		needs_power: false, consumable: false, note: '', checked: false, checked_by: null, checked_at: null, returned: false, not_needed: false,
		...over
	};
}
const todo = (over: Partial<TripTodo> & { id: string; name: string }): TripTodo => ({
	days_before: 1, phase: 'pack', person_id: null, note: '', template_id: null, origin: 'manual', done: false, done_by: null, done_at: null, ...over
});

const trip = { name: 'Sardinia', destination: 'Chia', country: 'IT', start_date: '2026-10-05', end_date: '2026-10-30', phase: 'pack' as const, todos_enabled: true };
const persons = [{ id: 'p1', name: 'Anna' }];
const items = [
	item({ id: 'g1', kind: 'group', name: 'Documents', sort: 1 }),
	item({ id: 'i1', name: 'Passport', parent_id: 'g1', checked: true, person_id: 'p1' }),
	item({ id: 'g2', kind: 'group', name: 'Clothes', sort: 2 }),
	item({ id: 'g3', kind: 'group', name: 'Basics', parent_id: 'g2' }),
	item({ id: 'i2', name: 'Socks', parent_id: 'g3', qty: 8, note: 'warm ones' }),
	item({ id: 'i3', name: 'Sunscreen', parent_id: 'g2', consumable: true, returned: false }),
	item({ id: 'i4', name: 'Hair dryer', parent_id: 'g2', needs_power: true, not_needed: true }),
	item({ id: 'i5', name: 'Snacks', sort: 0 }),
	item({ id: 'g4', kind: 'group', name: 'Empty', sort: 3 })
];
const todos = [todo({ id: 't1', name: 'Check in', days_before: 1 }), todo({ id: 't2', name: 'Keys', phase: 'return', days_before: 0, done: true })];

describe('tripMarkdown', () => {
	const md = tripMarkdown({ trip, items, todos, persons, locale: 'en-GB', t });

	it('starts with flag, name and dates', () => {
		expect(md.startsWith('# 🇮🇹 Sardinia\nChia · ')).toBe(true);
		expect(md).toContain('2026');
	});

	it('lists the to-dos of the phase with their due date', () => {
		expect(md).toContain('## ✅ Before departure');
		expect(md).toMatch(/- \[ \] Check in · \w+,? 4 Oct/);
		expect(md).not.toContain('Keys');
	});

	it('writes categories as headings, items as ticks with quantity, person and note', () => {
		expect(md).toContain('## 🧳 Packing list\n- [ ] Snacks\n\n### Documents\n- [x] Passport · Anna');
		expect(md).toContain('### Clothes\n- [ ] Sunscreen\n\n#### Basics\n- [ ] 8x Socks – warm ones');
	});

	it('skips items marked not needed and empty categories', () => {
		expect(md).not.toContain('Hair dryer');
		expect(md).not.toContain('Empty');
	});

	it('on the way home shows returned ticks and used-up consumables', () => {
		const back = tripMarkdown({ trip: { ...trip, phase: 'return' }, items, todos, persons, locale: 'en-GB', t });
		expect(back).toContain('## 🏠 Before heading home\n- [x] Keys');
		expect(back).toContain('## 🏠 Heading home');
		expect(back).toContain('- 🧴 Sunscreen · used up');
		expect(back).toContain('- [ ] Passport · Anna'); // packed, not yet back
	});

	it('leaves the to-dos out when the trip has none', () => {
		expect(tripMarkdown({ trip: { ...trip, todos_enabled: false }, items, todos, persons, locale: 'en-GB', t })).not.toContain('Before departure');
	});
});

describe('exportFileName', () => {
	it('makes a safe file name', () => {
		expect(exportFileName('Chia – Elternzeit 2026!', 'md')).toBe('Chia-Elternzeit-2026.md');
		expect(exportFileName('🇮🇹', 'md')).toBe('packwise.md');
	});
});
