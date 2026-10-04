import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { cookieOptions, createUser, getUser, listUsers, PROFILE_COOKIE } from '$lib/server/auth';
import { createPerson } from '$lib/server/repo';
import { safeNext, str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (config.authMode === 'accounts') redirect(303, '/');
	return { profiles: listUsers().map(({ id, name, color }) => ({ id, name, color })) };
};

export const actions: Actions = {
	choose: async (event) => {
		const form = await event.request.formData();
		const user = getUser(str(form, 'id'));
		if (!user) return fail(404, { error: 'profiles.err.not_found' });
		event.cookies.set(PROFILE_COOKIE, user.id, cookieOptions(event, 3650));
		redirect(303, safeNext(event.url.searchParams.get('next')));
	},
	create: async (event) => {
		if (config.authMode === 'accounts') return fail(403);
		const form = await event.request.formData();
		const name = str(form, 'name');
		if (!name) return fail(400, { error: 'setup.err.name' });
		const id = createUser({ name, locale: event.locals.locale });
		// a new profile also packs: add it as a person to the current household
		const user = getUser(id)!;
		if (event.locals.household) createPerson(event.locals.household.id, name, 'adult', user.color, id);
		event.cookies.set(PROFILE_COOKIE, id, cookieOptions(event, 3650));
		redirect(303, safeNext(event.url.searchParams.get('next')));
	}
};
