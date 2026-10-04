/**
 * Driving rules per destination country for the "By car" card in the trip info.
 * Compiled by hand from automobile club overviews (ADAC, ÖAMTC, TCS) – status 2026.
 * These are general limits for cars without trailer; signs on the spot always win.
 * Note texts live in the locale files under `drive.note.<key>`.
 */
export interface DrivingInfo {
	/** Speed limits as displayed (ranges allowed). `motorway: 'none'` = no general limit. */
	urban: string;
	rural: string;
	expressway?: string;
	motorway: string;
	unit?: 'mph';
	/** Blood alcohol limit in per mille, and the stricter one for novice drivers. */
	bac: number;
	bacNovice?: number;
	/** Child seat required below this height (cm) and/or age (years). */
	childSeat?: { height?: number; age?: number };
	notes: string[];
}

export const DRIVING: Record<string, DrivingInfo> = {
	DE: { urban: '50', rural: '100', motorway: 'none', bac: 0.5, bacNovice: 0, childSeat: { height: 150, age: 12 }, notes: ['de_advisory', 'rescue_lane', 'radar_apps'] },
	AT: { urban: '50', rural: '100', expressway: '100', motorway: '130', bac: 0.5, bacNovice: 0.1, childSeat: { height: 135, age: 14 }, notes: ['at_vest', 'rescue_lane', 'at_igl', 'at_winter'] },
	CH: { urban: '50', rural: '80', expressway: '100', motorway: '120', bac: 0.5, bacNovice: 0.1, childSeat: { height: 150, age: 12 }, notes: ['ch_radar', 'ch_fines', 'lights_day', 'rescue_lane'] },
	LI: { urban: '50', rural: '80', motorway: '–', bac: 0.8, notes: ['ch_radar'] },
	IT: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0.5, bacNovice: 0, childSeat: { height: 150 }, notes: ['it_vest', 'it_child_alarm', 'it_ztl', 'it_bike_rack', 'it_lights', 'it_rain', 'it_novice'] },
	FR: { urban: '50', rural: '80', expressway: '110', motorway: '130', bac: 0.5, bacNovice: 0.2, childSeat: { age: 10 }, notes: ['fr_rain', 'fr_rural90', 'fr_vest', 'fr_radar', 'fr_headphones', 'fr_novice'] },
	ES: { urban: '50', rural: '90', motorway: '120', bac: 0.5, bacNovice: 0.3, childSeat: { height: 135 }, notes: ['es_urban30', 'es_v16', 'es_rear_seat', 'es_bike_rack'] },
	PT: { urban: '50', rural: '90', expressway: '100', motorway: '120', bac: 0.5, bacNovice: 0.2, childSeat: { height: 135, age: 12 }, notes: ['pt_toll', 'es_bike_rack'] },
	NL: { urban: '50', rural: '80', expressway: '100', motorway: '100 / 130', bac: 0.5, bacNovice: 0.2, childSeat: { height: 135 }, notes: ['nl_motorway', 'nl_bikes', 'nl_milieu'] },
	BE: { urban: '50', rural: '70 / 90', motorway: '120', bac: 0.5, childSeat: { height: 135 }, notes: ['be_rural', 'be_lez', 'be_right', 'be_brussels'] },
	LU: { urban: '50', rural: '90', motorway: '130', bac: 0.5, bacNovice: 0.2, notes: ['lu_rain'] },
	DK: { urban: '50', rural: '80', motorway: '130', bac: 0.5, childSeat: { height: 135 }, notes: ['lights_day', 'dk_signs'] },
	SE: { urban: '50', rural: '70', motorway: '110–120', bac: 0.2, childSeat: { height: 135 }, notes: ['lights_day', 'nordic_signs', 'nordic_winter'] },
	NO: { urban: '50', rural: '80', motorway: '90–110', bac: 0.2, childSeat: { height: 135 }, notes: ['lights_day', 'no_fines', 'no_toll', 'nordic_winter'] },
	FI: { urban: '50', rural: '80', motorway: '120', bac: 0.5, childSeat: { height: 135 }, notes: ['lights_day', 'fi_winter', 'nordic_winter'] },
	PL: { urban: '50', rural: '90', expressway: '120', motorway: '140', bac: 0.2, childSeat: { height: 150 }, notes: ['lights_day', 'pl_toll'] },
	CZ: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0, childSeat: { height: 150 }, notes: ['zero_alcohol', 'lights_day', 'rescue_lane', 'cz_winter'] },
	SK: { urban: '50', rural: '90', motorway: '130', bac: 0, childSeat: { height: 150, age: 12 }, notes: ['zero_alcohol', 'lights_day'] },
	HU: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0, notes: ['zero_alcohol', 'hu_lights'] },
	SI: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0.5, bacNovice: 0, childSeat: { height: 150 }, notes: ['lights_day', 'rescue_lane', 'si_winter'] },
	HR: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0.5, bacNovice: 0, notes: ['hr_lights', 'hr_bulbs', 'hr_vest'] },
	RO: { urban: '50', rural: '90', expressway: '100', motorway: '130', bac: 0, notes: ['zero_alcohol'] },
	BG: { urban: '50', rural: '90', expressway: '120', motorway: '140', bac: 0.5, notes: [] },
	GR: { urban: '50', rural: '90', expressway: '110', motorway: '130', bac: 0.5, bacNovice: 0.2, notes: [] },
	GB: { unit: 'mph', urban: '30', rural: '60', expressway: '70', motorway: '70', bac: 0.8, childSeat: { height: 135, age: 12 }, notes: ['gb_scotland', 'gb_london'] },
	IE: { urban: '50', rural: '80', expressway: '100', motorway: '120', bac: 0.5, bacNovice: 0.2, childSeat: { height: 150 }, notes: ['ie_local', 'ie_toll'] },
	US: { unit: 'mph', urban: '25–35', rural: '55', motorway: '65–75', bac: 0.8, notes: ['us_state', 'us_schoolbus', 'us_right_on_red'] }
};

/** Keys of all notes, for the translation test. */
export const DRIVING_NOTES = [...new Set(Object.values(DRIVING).flatMap((d) => d.notes))];
