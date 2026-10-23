import { fail } from '@sveltejs/kit';
import { translate } from '#lib/i18n/index.js';
import { messagesFor } from './i18n';
import { clearSmtp, parseSmtpForm, saveSmtp, smtpView, testMail } from './mail';

/**
 * The form actions behind the SMTP card – used by Settings (none/local) and by the
 * admin area (accounts). Settings from the environment can't be changed here.
 */
export async function smtpAction(kind: 'save' | 'test' | 'clear', request: Request, locale: string) {
	if (smtpView().source === 'env') return fail(400, { smtpError: 'smtp.err.env' });
	const form = await request.formData();
	if (kind === 'clear') {
		clearSmtp();
		return { smtpSaved: 'cleared' };
	}
	const parsed = await parseSmtpForm(form);
	if ('error' in parsed) return fail(400, { smtpError: parsed.error });
	if (kind === 'save') {
		saveSmtp(parsed.cfg, parsed.keepPass);
		return { smtpSaved: 'saved' };
	}
	const to = String(form.get('test_to') ?? '').trim();
	if (!/^\S+@\S+\.\S+$/.test(to)) return fail(400, { smtpError: 'smtp.err.test_to' });
	const m = messagesFor(locale);
	const err = await testMail(parsed.cfg, to, translate(m, 'smtp.test_subject'), translate(m, 'smtp.test_body'));
	return err ? fail(400, { smtpError: 'smtp.err.test', smtpDetail: err }) : { smtpSaved: 'tested' };
}
