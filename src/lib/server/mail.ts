import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';

let transport: Transporter | null = null;

function getTransport(): Transporter | null {
	if (!config.smtp.enabled) return null;
	transport ??= nodemailer.createTransport({
		host: config.smtp.host,
		port: config.smtp.port,
		secure: config.smtp.secure,
		auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
	});
	return transport;
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
	const t = getTransport();
	if (!t) return false;
	try {
		await t.sendMail({ from: config.smtp.from, to, subject, text });
		return true;
	} catch (err) {
		console.error('[mail] failed to send:', (err as Error).message);
		return false;
	}
}
