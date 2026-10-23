import { translate } from '#lib/i18n/index.js';
import { config } from './config';
import { get } from './db';
import { messagesFor } from './i18n';
import { sendMail, smtpEnabled } from './mail';

/**
 * Security notice by e-mail when the password of an account changes – by the person
 * themselves (link to reset it if it wasn't them) or by the administration.
 * Sent in the background; without SMTP or an address nothing happens.
 */
export function passwordChangedMail(userId: string, byAdmin: boolean, origin: string) {
	if (config.authMode !== 'accounts' || !smtpEnabled()) return;
	const user = get<{ name: string; email: string | null; locale: string | null }>('SELECT name, email, locale FROM users WHERE id = ?', userId);
	if (!user?.email) return;
	const locale = user.locale || config.defaultLang;
	const m = messagesFor(locale);
	const date = new Date().toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
	const body = translate(m, byAdmin ? 'mail.password_changed.body_admin' : 'mail.password_changed.body', {
		name: user.name,
		date,
		link: `${origin}${byAdmin ? '/settings' : '/forgot'}`
	});
	void sendMail(user.email, translate(m, 'mail.password_changed.subject'), body);
}
