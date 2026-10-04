import { describe, expect, it } from 'vitest';
import { checkRules, computeQty, generate, type GenerateInput } from './generate';
import { analysePlugs, regionOf } from './data/countries';
import { classifyClimate, seasonOf } from './weather';
import { translate } from './i18n';
import en from './i18n/en.json';
import type { Person, TemplateNode } from './types';

const t = (k: string, p?: Record<string, string | number>) => translate(en, k, p);

let seq = 0;
function node(partial: Partial<TemplateNode> & { name: string }): TemplateNode {
	return {
		id: `n${seq++}`,
		parent_id: null,
		kind: 'item',
		sort: seq,
		bag_id: null,
		person_id: null,
		qty: 1,
		qty_mode: 'fixed',
		qty_extra: 0,
		qty_max: null,
		per_person: false,
		rules: {},
		needs_power: false,
		consumable: false,
		note: '',
		not_needed_count: 0,
		...partial
	};
}

const persons: Person[] = [
	{ id: 'p1', name: 'Dennis', kind: 'adult', color: '#000', user_id: null, sort: 1 },
	{ id: 'p2', name: 'Melissa', kind: 'adult', color: '#111', user_id: null, sort: 2 },
	{ id: 'p3', name: 'Kid', kind: 'child', color: '#222', user_id: null, sort: 3 }
];

function input(nodes: TemplateNode[], over: Partial<GenerateInput> = {}): GenerateInput {
	return {
		nodes,
		persons,
		settings: { persons: ['p1', 'p2'], context: {}, laundryDays: 0 },
		startDate: '2026-07-01',
		endDate: '2026-07-08',
		homeCountry: 'DE',
		destCountry: 'DE',
		weather: null,
		locale: 'en',
		t,
		...over
	};
}

describe('checkRules', () => {
	it('includes items without rules', () => {
		expect(checkRules({}, {}).ok).toBe(true);
	});
	it('never wins over only', () => {
		const r = checkRules({ transport: { car: 1, plane: -1 } }, { transport: ['car', 'plane'] });
		expect(r.ok).toBe(false);
		expect(r.failed?.type).toBe('never');
	});
	it('OR within a dimension, AND across dimensions', () => {
		const rules = { transport: { car: 1 as const, camper: 1 as const }, stay: { rental: 1 as const } };
		expect(checkRules(rules, { transport: ['camper'], stay: ['rental'] }).ok).toBe(true);
		expect(checkRules(rules, { transport: ['camper'], stay: ['hotel'] }).ok).toBe(false);
	});
	it('ignores climate rules when the climate is unknown', () => {
		expect(checkRules({ climate: { cold: 1 } }, { climate: [] }).ok).toBe(true);
		expect(checkRules({ climate: { cold: 1 } }, { climate: ['warm'] }).ok).toBe(false);
	});
	it('treats empty activities as "none selected"', () => {
		expect(checkRules({ activity: { ski: 1 } }, { activity: [] }).ok).toBe(false);
	});
});

describe('computeQty', () => {
	const base = { qty: 1, qty_mode: 'per_day' as const, qty_extra: 1, qty_max: 10 };
	it('per day plus extra', () => expect(computeQty(base, 7, 6, 0)).toBe(8));
	it('respects the maximum', () => expect(computeQty(base, 14, 13, 0)).toBe(10));
	it('caps at laundry days', () => expect(computeQty(base, 14, 13, 5)).toBe(6));
	it('per night', () => expect(computeQty({ ...base, qty_mode: 'per_night', qty_extra: 0, qty_max: null }, 7, 6, 0)).toBe(6));
	it('never below one', () => expect(computeQty({ qty: 1, qty_mode: 'per_night', qty_extra: 0, qty_max: null }, 1, 0, 0)).toBe(1));
});

describe('generate', () => {
	it('keeps the coffee machine for a car trip to a holiday home and drops it for flights', () => {
		const group = node({ name: 'Holiday home', kind: 'group', rules: { stay: { rental: 1 } } });
		const coffee = node({ name: 'Coffee machine', parent_id: group.id, rules: { transport: { car: 1, plane: -1 } } });
		const byCar = generate(input([group, coffee], { settings: { persons: ['p1'], context: { transport: ['car'], stay: ['rental'] }, laundryDays: 0 } }));
		expect(byCar.items.map((i) => i.name)).toContain('Coffee machine');
		const byPlane = generate(input([group, coffee], { settings: { persons: ['p1'], context: { transport: ['plane'], stay: ['rental'] }, laundryDays: 0 } }));
		expect(byPlane.items.map((i) => i.name)).not.toContain('Coffee machine');
		expect(byPlane.excluded[0].reason).toContain('Plane');
		// empty groups are dropped
		expect(byPlane.items.find((i) => i.name === 'Holiday home')).toBeUndefined();
	});

	it('excludes a whole group when the group rule fails', () => {
		const ski = node({ name: 'Skiing', kind: 'group', rules: { activity: { ski: 1 } } });
		const goggles = node({ name: 'Goggles', parent_id: ski.id });
		const res = generate(input([ski, goggles], { settings: { persons: ['p1'], context: { activity: ['beach'] }, laundryDays: 0 } }));
		expect(res.items).toHaveLength(0);
		expect(res.excluded.map((e) => e.name)).toEqual(['Goggles']);
	});

	it('expands per-person items for travelling humans only and skips absent personal items', () => {
		const brush = node({ name: 'Toothbrush', per_person: true });
		const glasses = node({ name: 'Glasses', person_id: 'p3' });
		const res = generate(input([brush, glasses]));
		expect(res.items.filter((i) => i.name === 'Toothbrush').map((i) => i.person_id)).toEqual(['p1', 'p2']);
		expect(res.excluded.find((e) => e.name === 'Glasses')?.reason).toContain('Kid');
	});

	it('respects forced includes and excludes', () => {
		const a = node({ name: 'A', rules: { activity: { ski: 1 } } });
		const b = node({ name: 'B' });
		const res = generate(input([a, b], { forceInclude: [a.id], forceExclude: [b.id] }));
		expect(res.items.map((i) => i.name)).toEqual(['A']);
	});

	it('suggests a type G adapter and cash for the UK and counts devices', () => {
		const dryer = node({ name: 'Hair dryer', needs_power: true });
		const res = generate(input([dryer], { destCountry: 'GB' }));
		const names = res.items.map((i) => i.name);
		expect(names).toContain('Travel adapter type G');
		expect(names.some((n) => n.includes('GBP'))).toBe(true);
		expect(res.warnings.some((w) => w.key === 'warn.adapter')).toBe(true);
	});

	it('warns about voltage for the US', () => {
		const res = generate(input([node({ name: 'Hair straightener', needs_power: true })], { destCountry: 'US' }));
		const w = res.warnings.find((x) => x.key === 'warn.voltage');
		expect(w?.params?.devices).toContain('Hair straightener');
	});

	it('adds road hints only for car / camper trips', () => {
		const ctx = (transport: string[]) => ({ settings: { persons: ['p1'], context: { transport, season: ['winter'] }, laundryDays: 0 }, destCountry: 'AT' });
		const car = generate(input([], ctx(['car'])));
		expect(car.items.map((i) => i.name)).toContain('Austrian motorway vignette');
		expect(car.items.map((i) => i.name)).toContain('Winter tyres / snow chains');
		const plane = generate(input([], ctx(['plane'])));
		expect(plane.items.map((i) => i.name)).not.toContain('Austrian motorway vignette');
	});

	it('flags implausible ski trips', () => {
		const w = { source: 'climate' as const, days: 7, avgMax: 22, avgMin: 12, maxMax: 26, minMin: 9, rainShare: 0.1, precipProb: null, snowPerDay: 0 };
		const res = generate(input([], { weather: w, settings: { persons: [], context: { activity: ['ski'] }, laundryDays: 0 } }));
		expect(res.warnings.some((x) => x.key === 'warn.ski_warm')).toBe(true);
	});
});

describe('plugs & regions', () => {
	it('DE → IT needs no adapter', () => expect(analysePlugs('DE', 'IT')?.status).toBe('none'));
	it('DE → CH is partial (Schuko does not fit type J)', () => {
		const a = analysePlugs('DE', 'CH')!;
		expect(a.status).toBe('partial');
		expect(a.adapterTypes).toEqual(['J']);
	});
	it('DE → GB needs type G', () => expect(analysePlugs('DE', 'GB')?.adapterTypes).toEqual(['G']));
	it('DE → US has a voltage mismatch', () => expect(analysePlugs('DE', 'US')?.voltageMismatch).toBe(true));
	it('same country → null', () => expect(analysePlugs('DE', 'DE')).toBeNull());
	it('regions', () => {
		expect(regionOf('DE', 'DE')).toBe('domestic');
		expect(regionOf('DE', 'ES')).toBe('eu');
		expect(regionOf('DE', 'CH')).toBe('eu');
		expect(regionOf('DE', 'TH')).toBe('non_eu');
	});
});

describe('weather helpers', () => {
	it('flips seasons on the southern hemisphere', () => {
		expect(seasonOf('2026-12-20', '2026-12-30', 50)).toBe('winter');
		expect(seasonOf('2026-12-20', '2026-12-30', -33)).toBe('summer');
	});
	it('classifies climate', () => {
		const w = { source: 'climate' as const, days: 7, avgMax: 31, avgMin: 22, maxMax: 35, minMin: 19, rainShare: 0.05, precipProb: null, snowPerDay: 0 };
		expect(classifyClimate(w)).toEqual(['hot']);
		expect(classifyClimate({ ...w, avgMax: 1, avgMin: -6, snowPerDay: 2 })).toEqual(['cold', 'snow']);
	});
});
