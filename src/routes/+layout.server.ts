import { config } from '#lib/server/config.js';
import { householdsFor } from '#lib/server/auth.js';
import { availableLocales, messagesFor } from '#lib/server/i18n.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		household: locals.household,
		households: locals.unlocked ? householdsFor(locals.user) : [],
		locale: locals.locale,
		messages: messagesFor(locals.locale),
		locales: availableLocales(),
		theme: locals.theme,
		authMode: config.authMode
	};
};
