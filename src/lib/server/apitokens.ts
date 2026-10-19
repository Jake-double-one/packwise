import { createHash, randomBytes } from 'node:crypto';
import { getUser, type SessionUser } from './auth';
import { decrypt, encrypt } from './crypto';
import { all, get, newId, now, run } from './db';

/**
 * Personal API tokens (used by the MCP endpoint). Each user has up to five,
 * each with a name and a scope. A token is found by its SHA-256 hash and
 * additionally stored AES-256-GCM encrypted, so its owner can reveal it again.
 */
export const MAX_TOKENS = 5;
export type TokenScope = 'read' | 'write';

export interface ApiToken {
	id: string;
	name: string;
	scope: TokenScope;
	created_at: number;
	last_used_at: number | null;
	/** first characters, to tell tokens apart without revealing them */
	preview: string;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generate(): string {
	let out = 'pw_';
	// rejection sampling: 228 = 4 × 57, so every character is equally likely
	while (out.length < 43) for (const b of randomBytes(48)) if (b < 228 && out.length < 43) out += ALPHABET[b % ALPHABET.length];
	return out;
}

interface Row {
	id: string;
	name: string;
	scope: TokenScope;
	created_at: number;
	last_used_at: number | null;
	token_enc: string;
}

export function listTokens(userId: string): ApiToken[] {
	return all<Row>('SELECT id, name, scope, created_at, last_used_at, token_enc FROM api_tokens WHERE user_id = ? ORDER BY created_at', userId).map(
		({ token_enc, ...r }) => ({ ...r, preview: (decrypt(token_enc) ?? 'pw_').slice(0, 7) + '…' })
	);
}

export function createApiToken(userId: string, name: string, scope: TokenScope): { id: string; token: string } | null {
	const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM api_tokens WHERE user_id = ?', userId)!.n;
	if (count >= MAX_TOKENS) return null;
	const token = generate();
	const id = newId();
	run(
		'INSERT INTO api_tokens (id, user_id, name, token_hash, token_enc, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
		id,
		userId,
		name.trim().slice(0, 60) || 'Token',
		hash(token),
		encrypt(token),
		scope === 'write' ? 'write' : 'read',
		now()
	);
	return { id, token };
}

export function revealToken(userId: string, id: string): string | null {
	const row = get<{ token_enc: string }>('SELECT token_enc FROM api_tokens WHERE id = ? AND user_id = ?', id, userId);
	return row ? decrypt(row.token_enc) : null;
}

export function deleteToken(userId: string, id: string) {
	run('DELETE FROM api_tokens WHERE id = ? AND user_id = ?', id, userId);
}

export function renameToken(userId: string, id: string, name: string) {
	if (name.trim()) run('UPDATE api_tokens SET name = ? WHERE id = ? AND user_id = ?', name.trim().slice(0, 60), id, userId);
}

/** The user (and scope) behind a token – or null. */
export function authenticateToken(token: string): { user: SessionUser; scope: TokenScope; tokenName: string } | null {
	if (!/^pw_[A-Za-z0-9]{20,80}$/.test(token)) return null;
	const row = get<{ id: string; user_id: string; scope: TokenScope; name: string; last_used_at: number | null }>(
		'SELECT id, user_id, scope, name, last_used_at FROM api_tokens WHERE token_hash = ?',
		hash(token)
	);
	if (!row) return null;
	const user = getUser(row.user_id);
	if (!user) return null;
	// don't write on every call
	if (!row.last_used_at || now() - row.last_used_at > 60_000) run('UPDATE api_tokens SET last_used_at = ? WHERE id = ?', now(), row.id);
	return { user, scope: row.scope, tokenName: row.name };
}
