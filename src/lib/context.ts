/**
 * Trip context dimensions. Items in the template can carry tri-state chips
 * per dimension value (only with / never with). Labels live in the locale
 * files under `ctx.<dimension>.<value>`.
 */
export interface Dimension {
	key: string;
	icon: string;
	values: string[];
	/** filled automatically (weather, dates, countries, persons) but still editable */
	auto: boolean;
}

export const DIMENSIONS: Dimension[] = [
	{ key: 'transport', icon: '🚗', auto: false, values: ['car', 'camper', 'plane', 'train', 'bus', 'bike', 'ship'] },
	{ key: 'stay', icon: '🏠', auto: false, values: ['hotel', 'rental', 'camping', 'friends', 'hostel'] },
	{
		key: 'activity',
		icon: '🎯',
		auto: false,
		values: ['beach', 'swim', 'hiking', 'ski', 'city', 'business', 'formal', 'sport', 'nightlife']
	},
	{ key: 'climate', icon: '🌡️', auto: true, values: ['hot', 'warm', 'mild', 'cold', 'snow', 'rain'] },
	{ key: 'season', icon: '🍂', auto: true, values: ['spring', 'summer', 'autumn', 'winter'] },
	{ key: 'region', icon: '🌍', auto: true, values: ['domestic', 'eu', 'non_eu'] },
	{ key: 'travelers', icon: '👶', auto: true, values: ['baby', 'child', 'pet'] }
];

export const DIMENSION_MAP = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d]));

export const ROAD_TRANSPORT = ['car', 'camper'];
