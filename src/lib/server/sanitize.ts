import { DIMENSION_MAP } from '$lib/context';
import type { Rules, TemplateNode, TripItem } from '$lib/types';

const num = (v: unknown, min: number, max: number): number | undefined => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};

export function sanitizeRules(input: unknown): Rules {
	const out: Rules = {};
	if (!input || typeof input !== 'object') return out;
	for (const [dim, chips] of Object.entries(input as Record<string, unknown>)) {
		const def = DIMENSION_MAP[dim];
		if (!def || !chips || typeof chips !== 'object') continue;
		for (const [value, state] of Object.entries(chips as Record<string, unknown>)) {
			if (!def.values.includes(value) || (state !== 1 && state !== -1)) continue;
			(out[dim] ??= {})[value] = state;
		}
	}
	return out;
}

export function sanitizeNodePatch(input: Record<string, unknown>, ids: { bags: Set<string>; persons: Set<string> }): Partial<TemplateNode> {
	const p: Partial<TemplateNode> = {};
	if (typeof input.name === 'string' && input.name.trim()) p.name = input.name.trim().slice(0, 200);
	if ('bag_id' in input) p.bag_id = typeof input.bag_id === 'string' && ids.bags.has(input.bag_id) ? input.bag_id : null;
	if ('person_id' in input) p.person_id = typeof input.person_id === 'string' && ids.persons.has(input.person_id) ? input.person_id : null;
	if ('qty' in input) p.qty = num(input.qty, 0, 999) ?? 1;
	if ('qty_mode' in input) p.qty_mode = input.qty_mode === 'per_day' || input.qty_mode === 'per_night' ? input.qty_mode : 'fixed';
	if ('qty_extra' in input) p.qty_extra = num(input.qty_extra, -99, 999) ?? 0;
	if ('qty_max' in input) p.qty_max = input.qty_max === null || input.qty_max === '' ? null : (num(input.qty_max, 0, 999) ?? null);
	if ('per_person' in input) p.per_person = !!input.per_person;
	if ('needs_power' in input) p.needs_power = !!input.needs_power;
	if ('consumable' in input) p.consumable = !!input.consumable;
	if ('note' in input) p.note = String(input.note ?? '').slice(0, 1000);
	if ('rules' in input) p.rules = sanitizeRules(input.rules);
	return p;
}

export function sanitizeItemPatch(input: Record<string, unknown>, ids: { bags: Set<string>; persons: Set<string> }): Partial<TripItem> {
	const p: Partial<TripItem> = {};
	if (typeof input.name === 'string' && input.name.trim()) p.name = input.name.trim().slice(0, 200);
	if ('bag_id' in input) p.bag_id = typeof input.bag_id === 'string' && ids.bags.has(input.bag_id) ? input.bag_id : null;
	if ('person_id' in input) p.person_id = typeof input.person_id === 'string' && ids.persons.has(input.person_id) ? input.person_id : null;
	if ('qty' in input) p.qty = num(input.qty, 0, 999) ?? 1;
	if ('note' in input) p.note = String(input.note ?? '').slice(0, 1000);
	if ('needs_power' in input) p.needs_power = !!input.needs_power;
	if ('consumable' in input) p.consumable = !!input.consumable;
	return p;
}
