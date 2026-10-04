import { DIMENSION_MAP, ROAD_TRANSPORT } from './context';
import { analysePlugs, COUNTRIES, countryName, currencyName } from './data/countries';
import { ROAD_RULES } from './data/road-rules';
import type { Person, Rules, TemplateNode, TodoTemplate, TripContext, TripSettings, Warning, WeatherSummary } from './types';
import { tripLength } from './weather';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Dimensions where an empty selection means "unknown" (rules are skipped) instead of "none". */
const UNKNOWN_IF_EMPTY = new Set(['climate', 'region']);

export interface RuleCheck {
	ok: boolean;
	/** dimension/value pairs that matched an "only with" chip */
	matched: [string, string][];
	/** first failing rule */
	failed?: { type: 'never' | 'only'; dim: string; values: string[] };
}

export function checkRules(rules: Rules | undefined, ctx: TripContext): RuleCheck {
	const matched: [string, string][] = [];
	if (!rules) return { ok: true, matched };
	for (const [dim, chips] of Object.entries(rules)) {
		const entries = Object.entries(chips ?? {});
		if (!entries.length) continue;
		const selected = ctx[dim];
		if (!selected || (selected.length === 0 && UNKNOWN_IF_EMPTY.has(dim))) continue;
		const never = entries.filter(([v, s]) => s === -1 && selected.includes(v)).map(([v]) => v);
		if (never.length) return { ok: false, matched, failed: { type: 'never', dim, values: never } };
		const only = entries.filter(([, s]) => s === 1).map(([v]) => v);
		if (only.length) {
			const hit = only.filter((v) => selected.includes(v));
			if (!hit.length) return { ok: false, matched, failed: { type: 'only', dim, values: only } };
			hit.forEach((v) => matched.push([dim, v]));
		}
	}
	return { ok: true, matched };
}

export function chipLabel(t: Translate, dim: string, value: string) {
	return `${DIMENSION_MAP[dim]?.icon ?? ''} ${t(`ctx.${dim}.${value}`)}`.trim();
}

export function describeCheck(t: Translate, check: RuleCheck): string {
	if (check.failed) {
		const labels = check.failed.values.map((v) => t(`ctx.${check.failed!.dim}.${v}`)).join(', ');
		return t(check.failed.type === 'never' ? 'reason.never' : 'reason.only', { values: labels });
	}
	if (check.matched.length) {
		return t('reason.because', { values: check.matched.map(([d, v]) => t(`ctx.${d}.${v}`)).join(' + ') });
	}
	return '';
}

export interface GenerateInput {
	nodes: TemplateNode[];
	persons: Person[];
	settings: TripSettings;
	startDate: string;
	endDate: string;
	homeCountry: string | null;
	destCountry: string | null;
	weather: WeatherSummary | null;
	/** template node ids forced in / out by the user in the preview */
	forceInclude?: string[];
	forceExclude?: string[];
	locale: string;
	t: Translate;
}

export interface GeneratedItem {
	key: string;
	parentKey: string | null;
	kind: 'group' | 'item';
	name: string;
	sort: number;
	template_id: string | null;
	origin: 'template' | 'auto';
	reason: string;
	bag_id: string | null;
	person_id: string | null;
	qty: number;
	needs_power: boolean;
	consumable: boolean;
	note: string;
}

export interface ExcludedItem {
	template_id: string;
	name: string;
	path: string;
	reason: string;
}

export interface GenerateResult {
	items: GeneratedItem[];
	excluded: ExcludedItem[];
	warnings: Warning[];
	days: number;
	nights: number;
}

export function computeQty(node: Pick<TemplateNode, 'qty' | 'qty_mode' | 'qty_extra' | 'qty_max'>, days: number, nights: number, laundryDays: number): number {
	const cap = (n: number) => (laundryDays > 0 ? Math.min(n, laundryDays) : n);
	let q: number;
	if (node.qty_mode === 'per_day') q = node.qty * cap(days) + node.qty_extra;
	else if (node.qty_mode === 'per_night') q = node.qty * cap(nights) + node.qty_extra;
	else q = node.qty;
	q = Math.ceil(q - 1e-9);
	if (node.qty_max != null && node.qty_max > 0) q = Math.min(q, node.qty_max);
	return Math.max(1, q);
}

export function generate(input: GenerateInput): GenerateResult {
	const { t, settings } = input;
	const ctx = settings.context;
	const { days, nights } = tripLength(input.startDate, input.endDate);
	const travelling = input.persons.filter((p) => settings.persons.includes(p.id));
	const personName = new Map(input.persons.map((p) => [p.id, p.name]));
	const forceIn = new Set(input.forceInclude ?? []);
	const forceOut = new Set(input.forceExclude ?? []);

	const children = new Map<string | null, TemplateNode[]>();
	for (const n of input.nodes) {
		const list = children.get(n.parent_id) ?? [];
		list.push(n);
		children.set(n.parent_id, list);
	}
	for (const list of children.values()) list.sort((a, b) => a.sort - b.sort);

	const items: GeneratedItem[] = [];
	const excluded: ExcludedItem[] = [];
	const includedNodes: TemplateNode[] = [];
	let seq = 0;

	/** Returns true if anything below was included. */
	const walk = (parentId: string | null, parentKey: string | null, path: string[], blocked: string | null): boolean => {
		let any = false;
		for (const node of children.get(parentId) ?? []) {
			const check = checkRules(node.rules, ctx);
			let reason = describeCheck(t, check);
			let blockedHere = blocked;
			if (!blockedHere && !check.ok) blockedHere = reason;

			if (node.kind === 'group') {
				const key = `g${seq++}`;
				const groupItem: GeneratedItem = {
					key,
					parentKey,
					kind: 'group',
					name: node.name,
					sort: node.sort,
					template_id: node.id,
					origin: 'template',
					reason: check.ok ? reason : '',
					bag_id: node.bag_id,
					person_id: null,
					qty: 1,
					needs_power: false,
					consumable: false,
					note: node.note
				};
				const index = items.length;
				items.push(groupItem);
				const has = walk(node.id, key, [...path, node.name], blockedHere);
				if (has) any = true;
				else items.splice(index, 1);
				continue;
			}

			let exclusion: string | null = blockedHere;
			if (!exclusion && node.person_id && !settings.persons.includes(node.person_id)) {
				exclusion = t('reason.person_absent', { name: personName.get(node.person_id) ?? '?' });
			}
			if (forceOut.has(node.id)) exclusion = t('reason.removed_by_you');
			if (exclusion && forceIn.has(node.id)) {
				exclusion = null;
				reason = t('reason.added_by_you');
			}
			if (exclusion) {
				excluded.push({ template_id: node.id, name: node.name, path: path.join(' › '), reason: exclusion });
				continue;
			}

			includedNodes.push(node);
			const qty = computeQty(node, days, nights, settings.laundryDays);
			const base = {
				parentKey,
				kind: 'item' as const,
				sort: node.sort,
				template_id: node.id,
				origin: 'template' as const,
				reason,
				bag_id: node.bag_id,
				qty,
				needs_power: node.needs_power,
				consumable: node.consumable,
				note: node.note
			};
			const owners = node.per_person && !node.person_id ? travelling.filter((p) => p.kind !== 'pet') : [];
			if (owners.length) {
				owners.forEach((p, i) =>
					items.push({ ...base, key: `i${seq++}`, name: node.name, person_id: p.id, sort: node.sort + i / 1000 })
				);
			} else {
				items.push({ ...base, key: `i${seq++}`, name: node.name, person_id: node.person_id });
			}
			any = true;
		}
		return any;
	};
	walk(null, null, [], null);

	const warnings: Warning[] = [];
	let sort = (items.reduce((m, i) => (i.parentKey === null ? Math.max(m, i.sort) : m), 0) || 0) + 1;
	const autoGroup = (name: string) => {
		const key = `g${seq++}`;
		items.push({
			key,
			parentKey: null,
			kind: 'group',
			name,
			sort: sort++,
			template_id: null,
			origin: 'auto',
			reason: '',
			bag_id: null,
			person_id: null,
			qty: 1,
			needs_power: false,
			consumable: false,
			note: ''
		});
		return key;
	};
	const autoItem = (parentKey: string, name: string, reason: string, note = '', qty = 1) =>
		items.push({
			key: `i${seq++}`,
			parentKey,
			kind: 'item',
			name,
			sort: seq,
			template_id: null,
			origin: 'auto',
			reason,
			bag_id: null,
			person_id: null,
			qty,
			needs_power: false,
			consumable: false,
			note
		});

	// ── Travel essentials: power adapters & currency ─────────────────────────
	const dest = input.destCountry;
	const home = input.homeCountry;
	const country = dest ? countryName(dest, input.locale) : '';
	let essentials: string | null = null;
	const ensureEssentials = () => (essentials ??= autoGroup(t('auto.group.essentials')));
	const devices = items.filter((i) => i.kind === 'item' && i.needs_power);

	const plugs = analysePlugs(home, dest);
	if (plugs && plugs.status !== 'none') {
		const types = plugs.adapterTypes.join('/');
		const qty = Math.min(3, Math.max(1, Math.ceil(devices.length / 3)));
		autoItem(
			ensureEssentials(),
			t('auto.adapter', { types }),
			t(plugs.status === 'needed' ? 'reason.adapter' : 'reason.adapter_partial', { country, unfit: plugs.unfit.join('/') }),
			devices.length ? t('auto.adapter_note', { count: devices.length }) : '',
			qty
		);
		warnings.push({
			kind: 'adapter',
			key: plugs.status === 'needed' ? 'warn.adapter' : 'warn.adapter_partial',
			params: { types, country, unfit: plugs.unfit.join('/') }
		});
	}
	if (plugs?.voltageMismatch) {
		warnings.push({
			kind: 'voltage',
			key: 'warn.voltage',
			params: {
				country,
				home: plugs.homeVoltage,
				dest: plugs.destVoltage,
				devices: devices.map((d) => d.name).slice(0, 6).join(', ') || '—'
			}
		});
	}
	if (home && dest && COUNTRIES[home] && COUNTRIES[dest] && COUNTRIES[home].currency !== COUNTRIES[dest].currency) {
		const cur = COUNTRIES[dest].currency;
		autoItem(
			ensureEssentials(),
			t('auto.cash', { currency: `${currencyName(cur, input.locale)} (${cur})` }),
			t('reason.currency', { country })
		);
	}

	// ── Road trip hints (car / camper only) ──────────────────────────────────
	const byRoad = (ctx.transport ?? []).some((v) => ROAD_TRANSPORT.includes(v));
	if (byRoad && dest) {
		const season = ctx.season?.[0];
		const rules = ROAD_RULES.filter(
			(r) => r.appliesTo(dest, home) && (!r.seasons || (season && r.seasons.includes(season)))
		);
		if (rules.length) {
			const group = autoGroup(t('auto.group.road', { country }));
			for (const r of rules) {
				autoItem(group, t(`road.${r.key}.name`), t(r.optional ? 'reason.road_optional' : 'reason.road', { country }), t(`road.${r.key}.note`));
			}
		}
	}

	// ── Plausibility checks against the weather ──────────────────────────────
	const w = input.weather;
	const activity = ctx.activity ?? [];
	const climate = ctx.climate ?? [];
	const tagged = (dim: string, values: string[]) =>
		includedNodes.some((n) => values.some((v) => n.rules?.[dim]?.[v] === 1));
	if (w) {
		const temp = Math.round(w.avgMax);
		if (activity.includes('ski') && w.avgMax > 8 && w.snowPerDay < 0.2) {
			warnings.push({ kind: 'plausibility', key: 'warn.ski_warm', params: { temp } });
		}
		if ((activity.includes('beach') || activity.includes('swim')) && w.avgMax < 20) {
			warnings.push({ kind: 'plausibility', key: 'warn.beach_cold', params: { temp } });
		}
	}
	if (climate.includes('rain') && !tagged('climate', ['rain'])) {
		warnings.push({ kind: 'plausibility', key: 'warn.no_rain_gear' });
	}
	if ((climate.includes('cold') || climate.includes('snow')) && !tagged('climate', ['cold', 'snow'])) {
		warnings.push({ kind: 'plausibility', key: 'warn.no_cold_gear' });
	}
	if (climate.includes('hot') && !tagged('climate', ['hot', 'warm'])) {
		warnings.push({ kind: 'plausibility', key: 'warn.no_sun_gear' });
	}

	return { items, excluded, warnings, days, nights };
}

export interface GeneratedTodo {
	template_id: string;
	name: string;
	days_before: number;
	person_id: string | null;
	note: string;
}

/** Picks the to-dos for a trip using the same chip rules as items. */
export function generateTodos(templates: TodoTemplate[], settings: TripSettings): GeneratedTodo[] {
	return templates
		.filter((t) => checkRules(t.rules, settings.context).ok)
		.filter((t) => !t.person_id || settings.persons.includes(t.person_id))
		.map((t) => ({ template_id: t.id, name: t.name, days_before: t.days_before, person_id: t.person_id, note: t.note }));
}

/** Due date of a to-do as ISO date. */
export function todoDue(startDate: string, daysBefore: number): string {
	const d = new Date(Date.parse(`${startDate}T00:00:00Z`) - daysBefore * 86_400_000);
	return d.toISOString().slice(0, 10);
}
