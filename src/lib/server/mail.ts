import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';
import { decrypt, encrypt } from './crypto';
import { getMeta, setMeta, run } from './db';
import { hostnameAllowed } from './netguard';

/**
 * Outgoing e-mail. SMTP comes from the environment (SMTP_HOST …) if set – that always
 * wins – or else from the settings page, stored in the database with the password encrypted.
 */
export type SmtpSecurity = 'starttls' | 'ssl' | 'none';

export interface SmtpConfig {
	host: string;
	port: number;
	security: SmtpSecurity;
	user: string;
	pass: string;
	from: string;
}

/** What the settings page may show – never the password itself. */
export interface SmtpView {
	source: 'env' | 'db' | 'none';
	host: string;
	port: number;
	security: SmtpSecurity;
	user: string;
	from: string;
	hasPassword: boolean;
}

interface Stored {
	host: string;
	port: number;
	security: SmtpSecurity;
	user: string;
	pass_enc: string | null;
	from: string;
}

const META_KEY = 'smtp';
const SECURITIES: SmtpSecurity[] = ['starttls', 'ssl', 'none'];

function stored(): Stored | null {
	try {
		const raw = getMeta(META_KEY);
		return raw ? (JSON.parse(raw) as Stored) : null;
	} catch {
		return null;
	}
}

/** The SMTP settings in effect, or null when no e-mail can be sent. */
export function smtpConfig(): SmtpConfig | null {
	if (config.smtp.enabled) {
		const s = config.smtp;
		return { host: s.host, port: s.port, security: s.secure ? 'ssl' : 'starttls', user: s.user, pass: s.pass, from: s.from };
	}
	const db = stored();
	if (!db?.host) return null;
	return { host: db.host, port: db.port, security: db.security, user: db.user, pass: db.pass_enc ? (decrypt(db.pass_enc) ?? '') : '', from: db.from || db.user };
}

export const smtpEnabled = () => !!smtpConfig();

export function smtpView(): SmtpView {
	if (config.smtp.enabled) {
		const s = config.smtp;
		return { source: 'env', host: s.host, port: s.port, security: s.secure ? 'ssl' : 'starttls', user: s.user, from: s.from, hasPassword: !!s.pass };
	}
	const db = stored();
	if (!db?.host) return { source: 'none', host: '', port: 587, security: 'starttls', user: '', from: '', hasPassword: false };
	return { source: 'db', host: db.host, port: db.port, security: db.security, user: db.user, from: db.from, hasPassword: !!db.pass_enc };
}

/**
 * Read and check the form of the settings page. An empty password keeps the stored one.
 * Returns the config to use, or an i18n error key.
 */
export async function parseSmtpForm(form: FormData): Promise<{ cfg: SmtpConfig; keepPass: boolean } | { error: string }> {
	const text = (k: string) => String(form.get(k) ?? '').trim();
	const host = text('host');
	const port = Number(text('port')) || 0;
	const security = SECURITIES.includes(text('security') as SmtpSecurity) ? (text('security') as SmtpSecurity) : 'starttls';
	const from = text('from');
	if (!/^[a-z0-9.-]+$/i.test(host) || !(await hostnameAllowed(host))) return { error: 'smtp.err.host' };
	if (port < 1 || port > 65535) return { error: 'smtp.err.port' };
	if (from && !/^(.+<\S+@\S+\.\S+>|\S+@\S+\.\S+)$/.test(from)) return { error: 'smtp.err.from' };
	const pass = String(form.get('pass') ?? '');
	const keepPass = !pass && !form.get('clear_pass');
	// the stored password only goes back to the server and account it was entered for, and never unencrypted if it wasn't before
	const prev = stored();
	const user = text('user');
	const moved = prev?.pass_enc && (prev.host.toLowerCase() !== host.toLowerCase() || prev.user !== user || (security === 'none' && prev.security !== 'none'));
	if (keepPass && moved) return { error: 'smtp.err.pass_required' };
	return { cfg: { host, port, security, user, pass: keepPass ? (smtpConfig()?.pass ?? '') : pass, from }, keepPass };
}

export function saveSmtp(cfg: SmtpConfig, keepPass: boolean) {
	const prev = stored();
	const pass_enc = keepPass ? (prev?.pass_enc ?? null) : cfg.pass ? encrypt(cfg.pass) : null;
	const value: Stored = { host: cfg.host, port: cfg.port, security: cfg.security, user: cfg.user, pass_enc, from: cfg.from };
	setMeta(META_KEY, JSON.stringify(value));
	transport = null;
}

export function clearSmtp() {
	run('DELETE FROM meta WHERE key = ?', META_KEY);
	transport = null;
}

function createTransport(cfg: SmtpConfig): Transporter {
	return nodemailer.createTransport({
		host: cfg.host,
		port: cfg.port,
		secure: cfg.security === 'ssl',
		requireTLS: cfg.security === 'starttls',
		ignoreTLS: cfg.security === 'none',
		auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
		connectionTimeout: 15_000,
		greetingTimeout: 15_000
	});
}

let transport: Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
	const cfg = smtpConfig();
	if (!cfg) return false;
	transport ??= createTransport(cfg);
	try {
		await transport.sendMail({ from: cfg.from || cfg.user, to, subject, text });
		return true;
	} catch (err) {
		console.error('[mail] failed to send:', (err as Error).message);
		return false;
	}
}

/** Send a test mail with the given settings (not yet saved) – returns the error text on failure. */
export async function testMail(cfg: SmtpConfig, to: string, subject: string, text: string): Promise<string | null> {
	try {
		const t = createTransport(cfg);
		await t.sendMail({ from: cfg.from || cfg.user, to, subject, text });
		t.close();
		return null;
	} catch (err) {
		return (err as Error).message.slice(0, 300);
	}
}
