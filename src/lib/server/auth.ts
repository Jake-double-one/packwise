import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { all, get, getMeta, newId, now, run, setMeta } from './db';
import { config } from './config';
import type { Role } from '$lib/types';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_COOKIE = 'pw_session';
export const PROFILE_COOKIE = 'pw_profile';
export const HOUSEHOLD_COOKIE = 'pw_hh';

export interface SessionUser {
	id: string;
	name: string;
	email: string | null;
	is_admin: boolean;
	color: string;
	locale: string | null;
	theme: string | null;
}

export interface AppHousehold {
	id: string;
	name: string;
	home_country: string | null;
	role: Role;
}

// ── Passwords ────────────────────────────────────────────────────────────────

const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scrypt(password.normalize('NFKC'), salt, 64, { ...SCRYPT, maxmem: 64 * 1024 * 1024 });
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
	if (!stored) return false;
	const [algo, N, r, p, salt, hash] = stored.split('$');
	if (algo !== 'scrypt') return false;
	const expected = Buffer.from(hash, 'base64');
	const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
		N: +N,
		r: +r,
		p: +p,
		maxmem: 64 * 1024 * 1024
	});
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

// ── Shared app password (AUTH_MODE=local) ───────────────────────────────────

/** ENV wins; otherwise the hash chosen in the setup wizard. */
export async function checkAppPassword(password: string): Promise<boolean> {
	if (config.appPassword) {
		const a = Buffer.from(sha256(password));
		const b = Buffer.from(sha256(config.appPassword));
		return timingSafeEqual(a, b);
	}
	return verifyPassword(password, getMeta('app_password_hash'));
}

export function appPasswordConfigured(): boolean {
	return !!config.appPassword || !!getMeta('app_password_hash');
}

export async function setAppPassword(password: string) {
	setMeta('app_password_hash', await hashPassword(password));
}

// ── Sessions ─────────────────────────────────────────────────────────────────

/**
 * Node never terminates TLS itself, so HTTPS means: ORIGIN says so, or a reverse
 * proxy told us via X-Forwarded-Proto. (event.url defaults to https in adapter-node
 * and must not be trusted for this – plain-HTTP LAN access would break logins.)
 */
function isSecure(event: RequestEvent) {
	if (config.origin) return config.origin.startsWith('https://');
	return event.request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
}

/** Public base URL for links in e-mails and invites. */
export function publicOrigin(request: Request): string {
	if (config.origin) return config.origin;
	const first = (h: string | null) => h?.split(',')[0].trim() || null;
	const proto = first(request.headers.get('x-forwarded-proto')) ?? 'http';
	const host = first(request.headers.get('x-forwarded-host')) ?? request.headers.get('host') ?? 'localhost';
	return `${proto}://${host}`;
}

export function cookieOptions(event: RequestEvent, maxAgeDays = config.sessionDays) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: isSecure(event),
		maxAge: maxAgeDays * 86400
	};
}

export function createSession(event: RequestEvent, userId: string | null) {
	const token = randomToken();
	const expires = now() + config.sessionDays * 86_400_000;
	run('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha256(token), userId, expires, now());
	event.cookies.set(SESSION_COOKIE, token, cookieOptions(event));
}

export function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) run('DELETE FROM sessions WHERE id = ?', sha256(token));
	cookies.delete(SESSION_COOKIE, { path: '/' });
	cookies.delete(PROFILE_COOKIE, { path: '/' });
}

export function readSession(cookies: Cookies): { user_id: string | null } | null {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const row = get<{ user_id: string | null; expires_at: number }>(
		'SELECT user_id, expires_at FROM sessions WHERE id = ?',
		sha256(token)
	);
	if (!row) return null;
	if (row.expires_at < now()) {
		run('DELETE FROM sessions WHERE id = ?', sha256(token));
		return null;
	}
	return { user_id: row.user_id };
}

export function purgeExpiredSessions() {
	run('DELETE FROM sessions WHERE expires_at < ?', now());
	run('DELETE FROM tokens WHERE expires_at < ?', now());
}

// ── Users ────────────────────────────────────────────────────────────────────

interface UserRow {
	id: string;
	name: string;
	email: string | null;
	is_admin: number;
	color: string;
	locale: string | null;
	theme: string | null;
}

const toUser = (r: UserRow): SessionUser => ({ ...r, is_admin: !!r.is_admin });

export function getUser(id: string | null | undefined): SessionUser | null {
	if (!id) return null;
	const row = get<UserRow>('SELECT id, name, email, is_admin, color, locale, theme FROM users WHERE id = ?', id);
	return row ? toUser(row) : null;
}

export function listUsers(): SessionUser[] {
	return all<UserRow>('SELECT id, name, email, is_admin, color, locale, theme FROM users ORDER BY created_at').map(toUser);
}

export function userCount(): number {
	return get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
}

export const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e', '#0ea5e9', '#f97316', '#84cc16'];

export function createUser(data: { name: string; email?: string | null; passwordHash?: string | null; isAdmin?: boolean; color?: string; locale?: string | null }) {
	const id = newId();
	const color = data.color ?? PALETTE[userCount() % PALETTE.length];
	run(
		'INSERT INTO users (id, name, email, password_hash, is_admin, color, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		id,
		data.name.trim(),
		data.email?.trim().toLowerCase() || null,
		data.passwordHash ?? null,
		data.isAdmin ? 1 : 0,
		color,
		data.locale ?? null,
		now()
	);
	return id;
}

// ── Households ───────────────────────────────────────────────────────────────

/**
 * In AUTH_MODE none/local everybody who passed the gate may see every household
 * (it is one trusted family). In accounts mode access requires a membership.
 */
export function householdsFor(user: SessionUser | null): AppHousehold[] {
	if (config.authMode !== 'accounts') {
		return all<AppHousehold>(`SELECT id, name, home_country, 'owner' AS role FROM households ORDER BY created_at`);
	}
	if (!user) return [];
	return all<AppHousehold>(
		`SELECT h.id, h.name, h.home_country, m.role FROM households h
		 JOIN memberships m ON m.household_id = h.id AND m.user_id = ?
		 ORDER BY h.created_at`,
		user.id
	);
}

export function canEditTemplate(hh: AppHousehold | null) {
	return !!hh && (hh.role === 'owner' || hh.role === 'member');
}

// ── Brute force protection ──────────────────────────────────────────────────

const attempts = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, max = 10, windowMs = 15 * 60_000): boolean {
	const t = now();
	if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < t) attempts.delete(k);
	const entry = attempts.get(key);
	if (!entry || entry.reset < t) {
		attempts.set(key, { count: 1, reset: t + windowMs });
		return true;
	}
	entry.count++;
	return entry.count <= max;
}

export function clientIp(event: RequestEvent): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}
