import type { StarterItem, StarterNode } from '$lib/server/repo';

/**
 * Starter templates offered in the setup wizard. Items demonstrate the
 * optional features (chips, quantity rules, power flag) without being noisy.
 * Bag index: 0 = suitcase 1, 1 = suitcase 2, 2 = carry-on.
 */
type Lang = 'en' | 'de';

const T = (en: string, de: string) => ({ en, de });

interface Def {
	name: { en: string; de: string };
	rules?: StarterNode['rules'];
	items?: (Omit<StarterItem, 'name'> & { name: { en: string; de: string } })[];
	groups?: Def[];
}

const COLD = { climate: { cold: 1 as const, snow: 1 as const }, season: { winter: 1 as const } };

const DEFS: Def[] = [
	{
		name: T('Documents & money', 'Dokumente & Geld'),
		items: [
			{ name: T('ID card', 'Personalausweis'), rules: { region: { non_eu: -1 } }, per_person: true, bag: 2 },
			{ name: T('Passport', 'Reisepass'), rules: { region: { non_eu: 1 } }, per_person: true, bag: 2 },
			{ name: T('Driving licence', 'Führerschein'), rules: { transport: { car: 1, camper: 1 } }, bag: 2 },
			{ name: T('Health insurance card', 'Krankenversicherungskarte'), per_person: true, bag: 2 },
			{ name: T('Wallet & cards', 'Geldbeutel & Karten'), bag: 2 },
			{ name: T('Tickets / boarding passes', 'Tickets / Bordkarten'), rules: { transport: { plane: 1, train: 1, bus: 1, ship: 1 } }, bag: 2 },
			{ name: T('Booking confirmation', 'Buchungsbestätigung'), bag: 2 }
		]
	},
	{
		name: T('Clothing', 'Kleidung'),
		groups: [
			{
				name: T('Basics', 'Basics'),
				items: [
					{ name: T('Underwear', 'Unterwäsche'), qty: 1, qty_mode: 'per_day', qty_extra: 1, qty_max: 10, per_person: true, bag: 0 },
					{ name: T('Socks', 'Socken'), qty: 1, qty_mode: 'per_day', qty_extra: 1, qty_max: 10, per_person: true, bag: 0 },
					{ name: T('T-shirts', 'T-Shirts'), qty: 1, qty_mode: 'per_day', qty_max: 7, per_person: true, bag: 0 },
					{ name: T('Trousers', 'Hosen'), qty: 2, per_person: true, bag: 0 },
					{ name: T('Pyjamas', 'Schlafanzug'), per_person: true, bag: 0 },
					{ name: T('Rain jacket', 'Regenjacke'), per_person: true, bag: 1, rules: { climate: { rain: 1 } } }
				]
			},
			{
				name: T('Warm clothes', 'Warme Kleidung'),
				rules: COLD,
				items: [
					{ name: T('Winter jacket', 'Dicke Jacke'), per_person: true, bag: 1 },
					{ name: T('Hat, scarf & gloves', 'Mütze, Schal & Handschuhe'), per_person: true, bag: 1 },
					{ name: T('Thermal underwear', 'Thermounterwäsche'), per_person: true, bag: 1, rules: { climate: { snow: 1 }, activity: { ski: 1 } } }
				]
			},
			{
				name: T('Summer', 'Sommer'),
				rules: { climate: { hot: 1, warm: 1 } },
				items: [
					{ name: T('Shorts', 'Kurze Hosen'), qty: 2, per_person: true, bag: 0 },
					{ name: T('Sun hat', 'Sonnenhut'), per_person: true, bag: 0 },
					{ name: T('Sunglasses', 'Sonnenbrille'), per_person: true, bag: 2 }
				]
			}
		]
	},
	{
		name: T('Toiletries', 'Kulturbeutel'),
		items: [
			{ name: T('Toothbrush & toothpaste', 'Zahnbürste & Zahnpasta'), per_person: true, bag: 0 },
			{ name: T('Shampoo & shower gel', 'Shampoo & Duschgel'), consumable: true, bag: 0 },
			{ name: T('Deodorant', 'Deo'), consumable: true, bag: 0 },
			{ name: T('Sunscreen', 'Sonnencreme'), consumable: true, rules: { climate: { hot: 1, warm: 1, snow: 1 }, activity: { beach: 1, ski: 1, hiking: 1 } }, bag: 0 },
			{ name: T('Hair dryer', 'Föhn'), needs_power: true, rules: { stay: { hotel: -1 } }, bag: 1 },
			{ name: T('Medication', 'Medikamente'), bag: 2 }
		]
	},
	{
		name: T('Electronics', 'Elektronik'),
		items: [
			{ name: T('Phone charger', 'Handy-Ladegerät'), needs_power: true, per_person: true, bag: 2 },
			{ name: T('Power bank', 'Powerbank'), bag: 2 },
			{ name: T('Headphones', 'Kopfhörer'), per_person: true, bag: 2 },
			{ name: T('Laptop + charger', 'Laptop + Netzteil'), needs_power: true, rules: { activity: { business: 1 } }, bag: 2 }
		]
	},
	{
		name: T('Beach & swimming', 'Strand & Baden'),
		rules: { activity: { beach: 1, swim: 1 } },
		items: [
			{ name: T('Swimwear', 'Badesachen'), per_person: true, bag: 0 },
			{ name: T('Beach towel', 'Strandtuch'), per_person: true, bag: 1 },
			{ name: T('Flip-flops', 'Badelatschen'), per_person: true, bag: 1 }
		]
	},
	{
		name: T('Skiing', 'Skifahren'),
		rules: { activity: { ski: 1 } },
		items: [
			{ name: T('Ski goggles', 'Skibrille'), per_person: true, bag: 1 },
			{ name: T('Ski trousers & jacket', 'Skihose & Skijacke'), per_person: true, bag: 1 },
			{ name: T('Helmet', 'Helm'), per_person: true, bag: 1 }
		]
	},
	{
		name: T('Hiking', 'Wandern'),
		rules: { activity: { hiking: 1 } },
		items: [
			{ name: T('Hiking boots', 'Wanderschuhe'), per_person: true, bag: 1 },
			{ name: T('Daypack', 'Tagesrucksack'), bag: 1 },
			{ name: T('Water bottle', 'Trinkflasche'), per_person: true, bag: 1 }
		]
	},
	{
		name: T('Holiday home', 'Ferienwohnung'),
		rules: { stay: { rental: 1, camping: 1 } },
		items: [
			{ name: T('Coffee machine', 'Kaffeemaschine'), needs_power: true, rules: { transport: { car: 1, camper: 1, plane: -1 } }, bag: 1 },
			{ name: T('Tea towels', 'Geschirrtücher'), rules: { transport: { plane: -1 } }, bag: 1 },
			{ name: T('Dishwasher tabs', 'Spülmaschinentabs'), consumable: true, bag: 1 },
			{ name: T('Spices & basics', 'Gewürze & Grundvorrat'), consumable: true, rules: { transport: { car: 1, camper: 1 } }, bag: 1 }
		]
	},
	{
		name: T('Kids', 'Kinder'),
		rules: { travelers: { child: 1, baby: 1 } },
		items: [
			{ name: T('Cuddly toy', 'Kuscheltier'), bag: 2 },
			{ name: T('Games & books', 'Spiele & Bücher'), bag: 1 },
			{ name: T('Nappies', 'Windeln'), rules: { travelers: { baby: 1 } }, qty: 6, qty_mode: 'per_day', bag: 1, consumable: true },
			{ name: T('Pushchair', 'Kinderwagen'), rules: { travelers: { baby: 1 } } }
		]
	},
	{
		name: T('Pet', 'Haustier'),
		rules: { travelers: { pet: 1 } },
		items: [
			{ name: T('Lead & harness', 'Leine & Geschirr') },
			{ name: T('Food & bowls', 'Futter & Näpfe'), consumable: true },
			{ name: T('Pet passport', 'Heimtierausweis'), rules: { region: { domestic: -1 } } }
		]
	}
];

function build(defs: Def[], lang: Lang): StarterNode[] {
	return defs.map((d) => ({
		name: d.name[lang],
		rules: d.rules,
		items: (d.items ?? []).map((i) => ({ ...i, name: i.name[lang] })),
		groups: build(d.groups ?? [], lang)
	}));
}

export function starterTemplate(lang: string): StarterNode[] {
	return build(DEFS, lang === 'de' ? 'de' : 'en');
}

export function starterBags(lang: string) {
	return lang === 'de'
		? [
				{ name: 'Koffer 1', color: '#3b82f6', icon: '🧳' },
				{ name: 'Koffer 2', color: '#10b981', icon: '🧳' },
				{ name: 'Handgepäck', color: '#f59e0b', icon: '🎒' }
			]
		: [
				{ name: 'Suitcase 1', color: '#3b82f6', icon: '🧳' },
				{ name: 'Suitcase 2', color: '#10b981', icon: '🧳' },
				{ name: 'Carry-on', color: '#f59e0b', icon: '🎒' }
			];
}
