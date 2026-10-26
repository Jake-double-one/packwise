import { get, now, run } from './db';
import { randomToken, sha256 } from './auth';
import type { Role } from '#lib/types.js';

export interface TokenRow {
	kind: 'invite' | 'reset' | 'trip_invite';
	user_id: string | null;
	household_id: string | null;
	trip_id: string | null;
	email: string | null;
	role: Role | null;
	/** a reset link created in the admin area */
	by_admin: number;
	/** who made an invitation – it ends when they leave the household */
	created_by: string | null;
	expires_at: number;
}

export function createToken(kind: TokenRow['kind'], data: Partial<TokenRow>, ttlMs: number): string {
	const token = randomToken();
	run(
		'INSERT INTO tokens (id, kind, user_id, household_id, trip_id, email, role, by_admin, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		sha256(token),
		kind,
		data.user_id ?? null,
		data.household_id ?? null,
		data.trip_id ?? null,
		data.email ?? null,
		data.role ?? null,
		data.by_admin ? 1 : 0,
		data.created_by ?? null,
		now() + ttlMs,
		now()
	);
	return token;
}

export function readToken(token: string | null | undefined, kind: TokenRow['kind']): TokenRow | null {
	if (!token) return null;
	const row = get<TokenRow>('SELECT kind, user_id, household_id, trip_id, email, role, by_admin, created_by, expires_at FROM tokens WHERE id = ? AND kind = ?', sha256(token), kind);
	return row && row.expires_at > now() ? row : null;
}

/** Deletes a token; false if it was gone already (used up by someone else in the meantime). */
export function consumeToken(token: string): boolean {
	return Number(run('DELETE FROM tokens WHERE id = ?', sha256(token)).changes) > 0;
}

/** Someone leaves a household: the invitations they made to it (and to its trips) end. */
export function revokeInvitesBy(householdId: string, userId: string) {
	run(
		`DELETE FROM tokens WHERE created_by = ? AND (
			(kind = 'invite' AND household_id = ?) OR
			(kind = 'trip_invite' AND trip_id IN (SELECT id FROM trips WHERE household_id = ?)))`,
		userId,
		householdId,
		householdId
	);
}
