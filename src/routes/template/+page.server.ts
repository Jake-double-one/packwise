import { redirect } from '@sveltejs/kit';
import { canEditTemplate } from '$lib/server/auth';
import { listBags, listPersons, listTemplate, listTodoTemplates } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) redirect(303, '/'); // the start page offers to create a household
	return {
		nodes: listTemplate(hh.id),
		todos: listTodoTemplates(hh.id),
		persons: listPersons(hh.id),
		bags: listBags(hh.id),
		canEdit: canEditTemplate(hh)
	};
};
