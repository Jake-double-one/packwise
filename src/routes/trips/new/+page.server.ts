import { redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { listBags, listPersons, listTemplate, listTodoTemplates, listTrips } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) redirect(303, '/household');
	const previous = listTrips(hh.id)
		.slice(0, 8)
		.map((tr) => ({ id: tr.id, name: tr.name, settings: tr.settings }));
	return {
		nodes: listTemplate(hh.id),
		todoTemplates: listTodoTemplates(hh.id),
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		homeCountry: hh.home_country,
		previous,
		weatherEnabled: config.weatherEnabled
	};
};
