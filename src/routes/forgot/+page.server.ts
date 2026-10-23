import { fail, redirect } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { clientIp, rateLimit, publicOrigin } from '#lib/server/auth.js';
import { get } from '#lib/server/db.js';
import { sendMail, smtpEnabled } from '#lib/server/mail.js';
import { messagesFor } from '#lib/server/i18n.js';
import { translate } from '#lib/i18n/index.js';
import { createToken } from '#lib/server/tokens.js';
import { str } from '#lib/server/util.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (config.authMode !== 'accounts') redirect(303, '/');
	return { smtp: smtpEnabled() };
};

export const actions: Actions = {
	default: async (event) => {
		if (!smtpEnabled()) return fail(400, { error: 'auth.err.no_smtp' });
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
