import { canEditTemplate } from '$lib/server/auth';
import { listActivity, listBags, listPersons, listTemplate, listTripItems } from '$lib/server/repo';
import { tripAccess } from '$lib/server/trips';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	const template = Object.fromEntries(
		listTemplate(hh.id).map((n) => [n.id, { name: n.name, bag_id: n.bag_id, note: n.note, needs_power: n.needs_power, consumable: n.consumable }])
	);
	return {
		trip,
		items: listTripItems(trip.id),
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		template,
		activity: listActivity(trip.id, 100),
		canEditTemplate: canEditTemplate(hh),
		canDelete: hh.role !== 'packer',
		homeCountry: hh.home_country
	};
};
