import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import {
	cookieOptions,
	createSession,
	createUser,
	hashPassword,
	PROFILE_COOKIE,
	setAppPassword,
	userCount
} from '$lib/server/auth';
import { tx } from '$lib/server/db';
import { createBag, createHousehold, seedTemplate, seedTodos } from '$lib/server/repo';
import { addPersonWithBags } from '$lib/server/persons';
import { starterSharedBag, starterTemplate, starterTodos } from '$lib/data/starter';
import { COUNTRIES } from '$lib/data/countries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (userCount() > 0) redirect(303, '/');
	return {
		mode: config.authMode,
		needsAppPassword: config.authMode === 'local' && !config.appPassword,
		defaultCountry: config.defaultCountry || (locals.locale === 'de' ? 'DE' : '')
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (userCount() > 0) redirect(303, '/');
		const form = await event.request.formData();
		const str = (k: string) => String(form.get(k) ?? '').trim();
		const values = {
			lang: str('lang') || event.locals.locale,
			name: str('name'),
			email: str('email'),
			household: str('household'),
			country: str('country').toUpperCase(),
			starter: str('starter') !== 'no'
		};
		const password = String(form.get('password') ?? '');
		const appPassword = String(form.get('app_password') ?? '');
		const mode = config.authMode;

		if (!values.name) return fail(400, { ...values, error: 'setup.err.name' });
		if (!values.household) return fail(400, { ...values, error: 'setup.err.household' });
		if (values.country && !COUNTRIES[values.country]) return fail(400, { ...values, error: 'setup.err.country' });
		if (mode === 'accounts') {
			if (!/^\S+@\S+\.\S+$/.test(values.email)) return fail(400, { ...values, error: 'auth.err.email' });
			if (password.length < 8) return fail(400, { ...values, error: 'auth.err.password_short' });
		}
		if (mode === 'local' && !config.appPassword && appPassword.length < 6) {
			return fail(400, { ...values, error: 'setup.err.app_password' });
		}

		const passwordHash = mode === 'accounts' ? await hashPassword(password) : null;
		if (mode === 'local' && !config.appPassword) await setAppPassword(appPassword);

		const userId = tx(() => {
			const uid = createUser({
				name: values.name,
				email: mode === 'accounts' ? values.email : null,
				passwordHash,
				isAdmin: true,
				locale: values.lang
			});
			const hh = createHousehold(values.household, values.country || null, uid);
			const { bags } = addPersonWithBags(hh, values.name, 'adult', '#6366f1', uid, values.lang);
			const shared = starterSharedBag(values.lang);
			const bagIds = [bags.suitcase!, createBag(hh, shared.name, shared.color, shared.icon), bags.carryon!];
			if (values.starter) {
				seedTemplate(hh, starterTemplate(values.lang), bagIds);
				seedTodos(hh, starterTodos(values.lang));
			}
			return uid;
		});

		if (mode === 'accounts') createSession(event, userId);
		else {
			if (mode === 'local') createSession(event, null);
			event.cookies.set(PROFILE_COOKIE, userId, cookieOptions(event, 3650));
		}
		redirect(303, '/');
	}
};
