import { redirect } from '@sveltejs/kit';
import { destroySession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		destroySession(cookies);
		redirect(303, '/login');
	}
};
