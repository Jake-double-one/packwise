import { EU_LIKE, LEFT_HAND_TRAFFIC } from './countries';

/**
 * Country-specific hints for road trips (car / camper). These are suggestions
 * without guarantee – rules change, so every item tells the user to verify.
 * Labels live in the locale files under `road.<key>.name` / `road.<key>.note`.
 */
export interface RoadRule {
	key: string;
	/** Destination countries this rule applies to. */
	appliesTo: (dest: string, home: string | null) => boolean;
	/** Only in these seasons (meteorological, hemisphere aware). */
	seasons?: string[];
	/** Optional add-ons rather than (usually) mandatory things. */
	optional?: boolean;
}

const inSet = (codes: string) => {
	const set = new Set(codes.split(' '));
	return (dest: string) => set.has(dest);
};
const abroad = (dest: string, home: string | null) => !!home && dest !== home;

export const ROAD_RULES: RoadRule[] = [
	{ key: 'documents', appliesTo: abroad },
	{ key: 'safety_kit', appliesTo: abroad },
	// Green Card is not needed within the EU/EEA and for members of the multilateral agreement (e.g. GB, RS)
	{ key: 'green_card', appliesTo: (d, h) => abroad(d, h) && !EU_LIKE.has(d) && !['GB', 'RS'].includes(d) },
	{ key: 'vignette_at', appliesTo: inSet('AT') },
	{ key: 'vignette_ch', appliesTo: inSet('CH LI') },
	{ key: 'vignette_si', appliesTo: inSet('SI') },
	{ key: 'vignette_cz', appliesTo: inSet('CZ') },
	{ key: 'vignette_sk', appliesTo: inSet('SK') },
	{ key: 'vignette_hu', appliesTo: inSet('HU') },
	{ key: 'vignette_ro', appliesTo: inSet('RO') },
	{ key: 'vignette_bg', appliesTo: inSet('BG') },
	{ key: 'critair_fr', appliesTo: inSet('FR') },
	{ key: 'umwelt_de', appliesTo: (d, h) => d === 'DE' && h !== 'DE' },
	{
		key: 'beam_deflectors',
		appliesTo: (d, h) => LEFT_HAND_TRAFFIC.has(d) && !!h && !LEFT_HAND_TRAFFIC.has(h)
	},
	{
		key: 'winter_equipment',
		appliesTo: inSet('AT CH LI DE IT FR SI CZ SK NO SE FI AD'),
		seasons: ['winter']
	},
	{ key: 'toll_badge', appliesTo: inSet('FR IT ES PT'), optional: true }
];
