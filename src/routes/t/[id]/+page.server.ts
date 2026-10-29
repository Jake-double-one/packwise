import { config } from '#lib/server/config.js';
import { canEditTemplate } from '#lib/server/auth.js';
import { listActivity, listBags, listPersons, listTemplate, listTodoTemplates, listTripGuests, listTripItems, listTripTodos } from '#lib/server/repo.js';
import { tripAccess } from '#lib/server/trips.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	const member = hh.role !== 'guest';
	// guests see the trip, not the household's template
	const template = member
		? Object.fromEntries(
				listTemplate(hh.id).map((n) => [n.id, { name: n.name, bag_id: n.bag_id, note: n.note, needs_power: n.needs_power, consumable: n.consumable }])
			)
		: {};
	return {
		trip,
		items: listTripItems(trip.id),
		todos: listTripTodos(trip.id),
		/** which to-do templates exist and for which list – to offer adding ones made after the trip */
		todoTemplates: member ? listTodoTemplates(hh.id).map((t) => ({ id: t.id, phase: t.phase })) : [],
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		template,
		activity: listActivity(trip.id, 100),
		canEditTemplate: canEditTemplate(hh),
		/** household members may delete and duplicate the trip and invite guests */
		canDelete: member,
		isGuest: !member,
		hostHousehold: hh.name,
		guests: config.authMode === 'accounts' ? listTripGuests(trip.id) : null,
		homeCountry: hh.home_country,
		homePlace: hh.home_place,
		/** sections the household folded away (shared, see Section) */
		collapsed: hh.collapsed
	};
};
