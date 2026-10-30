import { redirect } from '@sveltejs/kit';
import { canEditTemplate, householdsFor } from '#lib/server/auth.js';
import { listTemplate } from '#lib/server/repo.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) redirect(303, '/'); // the start page offers to create a household
	return {
		existing: listTemplate(hh.id).map((n) => ({ name: n.name, kind: n.kind })),
		canEdit: canEditTemplate(hh),
		/** the user's other households – their templates can be copied from (never a trip guest's) */
		households: householdsFor(locals.user)
			.filter((h) => h.id !== hh.id && h.role !== 'guest')
			.map((h) => ({ id: h.id, name: h.name }))
	};
};
