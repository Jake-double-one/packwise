/** Shared domain types used on both server and client. */

export type PersonKind = 'adult' | 'child' | 'baby' | 'pet';
export type Role = 'owner' | 'member' | 'packer';
export type QtyMode = 'fixed' | 'per_day' | 'per_night';

/** Tri-state chip rules: dimension → value → 1 (only with) | -1 (never with). */
export type Rules = Record<string, Record<string, 1 | -1>>;

export interface Person {
	id: string;
	name: string;
	kind: PersonKind;
	color: string;
	user_id: string | null;
	sort: number;
}

export interface Bag {
	id: string;
	name: string;
	color: string;
	icon: string;
	sort: number;
}

export interface TemplateNode {
	id: string;
	parent_id: string | null;
	kind: 'group' | 'item';
	name: string;
	sort: number;
	bag_id: string | null;
	person_id: string | null;
	qty: number;
	qty_mode: QtyMode;
	qty_extra: number;
	qty_max: number | null;
	per_person: boolean;
	rules: Rules;
	needs_power: boolean;
	consumable: boolean;
	note: string;
	not_needed_count: number;
}

export interface TripItem {
	id: string;
	parent_id: string | null;
	kind: 'group' | 'item';
	name: string;
	sort: number;
	template_id: string | null;
	origin: 'template' | 'manual' | 'auto';
	reason: string;
	bag_id: string | null;
	person_id: string | null;
	qty: number;
	needs_power: boolean;
	consumable: boolean;
	note: string;
	checked: boolean;
	checked_by: string | null;
	checked_at: number | null;
	returned: boolean;
	not_needed: boolean;
}

/** Selected context values per dimension, e.g. { transport: ['car'], climate: ['warm'] }. */
export type TripContext = Record<string, string[]>;

export interface TripSettings {
	persons: string[];
	context: TripContext;
	/** Cap clothing quantities at this many days when laundry is available (0 = no laundry). */
	laundryDays: number;
}

export interface WeatherSummary {
	source: 'forecast' | 'climate';
	days: number;
	avgMax: number;
	avgMin: number;
	maxMax: number;
	minMin: number;
	/** share of days with ≥ 1 mm precipitation (0..1) */
	rainShare: number;
	/** average precipitation probability in % (forecast only) */
	precipProb: number | null;
	/** average snowfall per day in cm */
	snowPerDay: number;
	years?: number;
}

export interface Warning {
	kind: 'adapter' | 'voltage' | 'plausibility' | 'road' | 'info';
	key: string;
	params?: Record<string, string | number>;
}

export interface Trip {
	id: string;
	name: string;
	destination: string;
	country: string | null;
	lat: number | null;
	lon: number | null;
	start_date: string;
	end_date: string;
	settings: TripSettings;
	weather: WeatherSummary | null;
	warnings: Warning[];
	created_at: number;
	updated_at: number;
}
