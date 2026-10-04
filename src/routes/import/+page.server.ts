import { canEditTemplate } from '$lib/server/auth';
import { listTemplate } from '$lib/server/repo';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const hh = locals.household!;
	return {
		existing: listTemplate(hh.id).map((n) => ({ name: n.name, kind: n.kind })),
		canEdit: canEditTemplate(hh)
	};
};
