import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { clientIp, rateLimit, publicOrigin } from '$lib/server/auth';
import { get } from '$lib/server/db';
import { sendMail } from '$lib/server/mail';
import { messagesFor } from '$lib/server/i18n';
import { translate } from '$lib/i18n';
import { createToken } from '$lib/server/tokens';
import { str } from '$lib/server/util';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (config.authMode !== 'accounts') redirect(303, '/');
	return { smtp: config.smtp.enabled };
};

export const actions: Actions = {
	default: async (event) => {
		if (!config.smtp.enabled) return fail(400, { error: 'auth.err.no_smtp' });
		if (!rateLimit(`forgot:${clientIp(event)}`, 5, 3_600_000)) return fail(429, { error: 'auth.err.rate_limited' });
		const email = str(await event.request.formData(), 'email').toLowerCase();
		const user = get<{ id: string; locale: string | null }>('SELECT id, locale FROM users WHERE email = ?', email);
		if (user) {
			const token = createToken('reset', { user_id: user.id }, 3_600_000);
			const m = messagesFor(user.locale ?? event.locals.locale);
			const link = `${publicOrigin(event.request)}/reset/${token}`;
			await sendMail(email, translate(m, 'mail.reset.subject'), translate(m, 'mail.reset.body', { link }));
		}
		return { sent: true };
	}
};
