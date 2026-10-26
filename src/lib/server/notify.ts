import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { config } from './config';
import { decrypt, encrypt } from './crypto';
import { all, get, getMeta, newId, now, run, setMeta } from './db';
import { sendMail, smtpEnabled } from './mail';
import { hostAllowed } from './netguard';

/**
 * Notifications go to the channels a person set up under Settings:
 * e-mail (needs SMTP), ntfy, Gotify or Web Push (this browser / installed app).
 * Channel details (addresses, tokens, push subscriptions) are stored encrypted.
 */
export type ChannelKind = 'email' | 'ntfy' | 'gotify' | 'webpush';
export const CHANNEL_KINDS: ChannelKind[] = ['email', 'ntfy', 'gotify', 'webpush'];
export const MAX_CHANNELS = 10;

export interface Channel {
	id: string;
	kind: ChannelKind;
	label: string;
	last_error: string | null;
	created_at: number;
}

type ChannelConfig =
	| { kind: 'email'; address: string }
	| { kind: 'ntfy'; server: string; topic: string; token: string }
	| { kind: 'gotify'; server: string; token: string }
	| { kind: 'webpush'; subscription: webpush.PushSubscription };

export interface Message {
	title: string;
	body: string;
	/** absolute link that opens the trip */
	url?: string;
	/** ntfy tags (emoji shortcodes) */
	tags?: string[];
}

export interface NotifyPrefs {
	/** remind this many days before departure (0 = off) */
	departureDays: number;
	/** another reminder the day before */
	dayBefore: boolean;
	/** to-dos that are due */
	todos: boolean;
	/** hour of the day (server time) from which reminders go out */
	hour: number;
}

export const DEFAULT_PREFS: NotifyPrefs = { departureDays: 3, dayBefore: true, todos: true, hour: 8 };

// ── Preferences ────────────────────────────────────────────────────────────

export function getPrefs(userId: string): NotifyPrefs {
	const raw = get<{ p: string | null }>('SELECT notify_prefs AS p FROM users WHERE id = ?', userId)?.p;
	try {
		return { ...DEFAULT_PREFS, ...(raw ? (JSON.parse(raw) as Partial<NotifyPrefs>) : {}) };
	} catch {
		return { ...DEFAULT_PREFS };
	}
}

export function setPrefs(userId: string, prefs: NotifyPrefs) {
	const clean: NotifyPrefs = {
		departureDays: Math.max(0, Math.min(30, Math.round(prefs.departureDays) || 0)),
		dayBefore: !!prefs.dayBefore,
		todos: !!prefs.todos,
		hour: Math.max(0, Math.min(23, Math.round(prefs.hour) || 0))
	};
	run('UPDATE users SET notify_prefs = ? WHERE id = ?', JSON.stringify(clean), userId);
}

// ── Channels ───────────────────────────────────────────────────────────────

export function listChannels(userId: string): Channel[] {
	return all<Channel>('SELECT id, kind, label, last_error, created_at FROM notify_channels WHERE user_id = ? ORDER BY created_at', userId);
}

const countChannels = (userId: string) => get<{ n: number }>('SELECT COUNT(*) AS n FROM notify_channels WHERE user_id = ?', userId)!.n;

function readConfig(userId: string, id: string): ChannelConfig | null {
	const row = get<{ config_enc: string }>('SELECT config_enc FROM notify_channels WHERE id = ? AND user_id = ?', id, userId);
	const plain = row && decrypt(row.config_enc);
	return plain ? (JSON.parse(plain) as ChannelConfig) : null;
}

const httpUrl = (value: string) => {
	try {
		const u = new URL(value.trim());
		return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.toString().replace(/\/+$/, '') : null;
	} catch {
		return null;
	}
};

/**
 * Check the form of a new e-mail, ntfy or Gotify channel. Returns the config or an i18n error key.
 * Servers must be reachable and must not point at the container itself (see netguard).
 */
export async function parseChannel(form: FormData): Promise<ChannelConfig | { error: string }> {
	const text = (k: string) => String(form.get(k) ?? '').trim();
	const kind = text('kind');
	if (kind === 'email') {
		const address = text('address').toLowerCase();
		if (!/^\S+@\S+\.\S+$/.test(address) || address.length > 200) return { error: 'notify.err.address' };
		return { kind, address };
	}
	if (kind === 'ntfy') {
		const server = httpUrl(text('server') || 'https://ntfy.sh');
		const topic = text('topic');
		if (!server || !(await hostAllowed(server))) return { error: 'notify.err.server' };
		if (!/^[\w-]{1,64}$/.test(topic)) return { error: 'notify.err.topic' };
		return { kind, server, topic, token: text('token') };
	}
	if (kind === 'gotify') {
		const server = httpUrl(text('server'));
		const token = text('token');
		if (!server || !(await hostAllowed(server))) return { error: 'notify.err.server' };
		if (!token) return { error: 'notify.err.token' };
		return { kind, server, token };
	}
	return { error: 'notify.err.kind' };
}

function labelOf(cfg: ChannelConfig, device = ''): string {
	switch (cfg.kind) {
		case 'email':
			return cfg.address;
		case 'ntfy':
			return `${new URL(cfg.server).host}/${cfg.topic}`;
		case 'gotify':
			return new URL(cfg.server).host;
		case 'webpush':
			return device.slice(0, 60) || 'Browser';
	}
}

const endpointHash = (cfg: ChannelConfig) => (cfg.kind === 'webpush' ? createHash('sha256').update(cfg.subscription.endpoint).digest('hex') : null);

/** Add a channel; the same browser subscribing again replaces its old subscription. */
export function addChannel(userId: string, cfg: ChannelConfig, device = ''): string | null {
	const hash = endpointHash(cfg);
	if (hash) run('DELETE FROM notify_channels WHERE endpoint_hash = ?', hash);
	if (countChannels(userId) >= MAX_CHANNELS) return null;
	const id = newId();
	run(
		'INSERT INTO notify_channels (id, user_id, kind, label, config_enc, endpoint_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		id,
		userId,
		cfg.kind,
		labelOf(cfg, device),
		encrypt(JSON.stringify(cfg)),
		hash,
		now()
	);
	return id;
}

export function deleteChannel(userId: string, id: string) {
	run('DELETE FROM notify_channels WHERE id = ? AND user_id = ?', id, userId);
}

/** Remove this browser's push subscription (e.g. when the person turns it off there). */
export function deleteWebPush(userId: string, endpoint: string) {
	run('DELETE FROM notify_channels WHERE user_id = ? AND endpoint_hash = ?', userId, createHash('sha256').update(endpoint).digest('hex'));
}

// ── Web Push (VAPID) ───────────────────────────────────────────────────────

let vapid: { publicKey: string; privateKey: string } | null = null;

/** VAPID keys are created once and kept in the database (private key encrypted). */
export function vapidKeys() {
	if (vapid) return vapid;
	const stored = getMeta('vapid');
	if (stored) {
		const { publicKey, privateKey_enc } = JSON.parse(stored) as { publicKey: string; privateKey_enc: string };
		const privateKey = decrypt(privateKey_enc);
		if (privateKey) return (vapid = { publicKey, privateKey });
	}
	const keys = webpush.generateVAPIDKeys();
	setMeta('vapid', JSON.stringify({ publicKey: keys.publicKey, privateKey_enc: encrypt(keys.privateKey) }));
	return (vapid = keys);
}

/** Push services want a contact: ORIGIN if it is https, else the project page. */
const vapidSubject = () => (config.origin.startsWith('https://') ? config.origin : 'https://github.com/jake-double-one/packwise');

// ── Sending ────────────────────────────────────────────────────────────────

const TIMEOUT = 15_000;

async function post(url: string, init: RequestInit): Promise<string | null> {
	// checked again on every send – a name could point somewhere else by now
	if (!(await hostAllowed(url))) return 'blocked host';
	try {
		const res = await fetch(url, { ...init, method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
		return res.ok ? null : `HTTP ${res.status}`;
	} catch (err) {
		return (err as Error).message.slice(0, 200);
	}
}

/** Send one message to one channel. Returns null on success or an error text. */
async function deliver(cfg: ChannelConfig, msg: Message): Promise<string | null> {
	const text = msg.url ? `${msg.body}\n\n${msg.url}` : msg.body;
	switch (cfg.kind) {
		case 'email':
			if (!smtpEnabled()) return 'SMTP';
			return (await sendMail(cfg.address, msg.title, text)) ? null : 'SMTP';
		case 'ntfy':
			// JSON publishing keeps umlauts and emoji in the title intact
			return post(cfg.server, {
				headers: { 'content-type': 'application/json', ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
				body: JSON.stringify({ topic: cfg.topic, title: msg.title, message: msg.body, click: msg.url, tags: msg.tags ?? [] })
			});
		case 'gotify':
			return post(`${cfg.server}/message`, {
				headers: { 'content-type': 'application/json', 'x-gotify-key': cfg.token },
				body: JSON.stringify({
					title: msg.title,
					message: text,
					priority: 5,
					extras: msg.url ? { 'client::notification': { click: { url: msg.url } } } : undefined
				})
			});
		case 'webpush': {
			if (!(await hostAllowed(cfg.subscription.endpoint))) return 'blocked host';
			const keys = vapidKeys();
			try {
				await webpush.sendNotification(cfg.subscription, JSON.stringify({ title: msg.title, body: msg.body, url: msg.url }), {
					vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
					TTL: 24 * 3600,
					timeout: TIMEOUT
				});
				return null;
			} catch (err) {
				const status = (err as { statusCode?: number }).statusCode;
				return status === 404 || status === 410 ? 'gone' : (status ? `HTTP ${status}` : (err as Error).message).slice(0, 200);
			}
		}
	}
}

/** Send to one channel of a person and remember the outcome (an expired push subscription is removed). */
export async function sendToChannel(userId: string, id: string, msg: Message): Promise<string | null> {
	const cfg = readConfig(userId, id);
	if (!cfg) return 'config';
	const err = await deliver(cfg, msg);
	if (err === 'gone') {
		deleteChannel(userId, id);
		return err;
	}
	run('UPDATE notify_channels SET last_error = ? WHERE id = ?', err, id);
	return err;
}

/** Send to all channels of a person. Returns how many channels got the message. */
export async function notifyUser(userId: string, msg: Message): Promise<number> {
	let ok = 0;
	for (const ch of listChannels(userId)) if (!(await sendToChannel(userId, ch.id, msg))) ok++;
	return ok;
}

/** Remember that something was sent; false if it already was (so reminders go out once). */
export function markSent(userId: string, key: string): boolean {
	const res = run('INSERT OR IGNORE INTO notify_log (user_id, key, sent_at) VALUES (?, ?, ?)', userId, key, now());
	return Number(res.changes) > 0;
}

/**
 * The address links in notifications point to: ORIGIN, else the address this person last
 * used the app under (per person, so nobody can redirect the links of others with a forged
 * Host header). The old app-wide value is only a fallback for people who haven't been back.
 */
export function linkOrigin(userId: string): string {
	if (config.origin) return config.origin;
	return get<{ o: string | null }>('SELECT notify_origin AS o FROM users WHERE id = ?', userId)?.o || getMeta('notify_origin') || '';
}

export function rememberOrigin(userId: string, origin: string) {
	if (!config.origin && origin) run('UPDATE users SET notify_origin = ? WHERE id = ? AND notify_origin IS NOT ?', origin, userId, origin);
}
