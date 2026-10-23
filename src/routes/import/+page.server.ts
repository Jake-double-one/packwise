import { redirect } from '@sveltejs/kit';
import { canEditTemplate } from '#lib/server/auth.js';
import { listTemplate } from '#lib/server/repo.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household;
	if (!hh) redirect(303, '/'); // the start page offers to create a household
	return {
		existing: listTemplate(hh.id).map((n) => ({ name: n.name, kind: n.kind })),
		canEdit: canEditTemplate(hh)
	};
};
