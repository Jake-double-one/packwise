import { config } from './config';
import { all, get, run, tx } from './db';
import type { Role } from '$lib/types';

export interface AdminUser {
	id: string;
	name: string;
	email: string | null;
	is_admin: number;
	color: string;
	has_password: number;
	created_at: number;
	last_login: number | null;
	memberships: { household_id: string; name: string; role: Role }[];
}

export interface AdminHousehold {
	id: string;
	name: string;
	home_country: string | null;
	members: number;
	trips: number;
	created_at: number;
}

export function adminUsers(): AdminUser[] {
	const users = all<Omit<AdminUser, 'memberships'>>(
		`SELECT u.id, u.name, u.email, u.is_admin, u.color, u.created_at,
		        (u.password_hash IS NOT NULL) AS has_password,
		        (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
		 FROM users u ORDER BY u.created_at`
	);
	const members = all<{ user_id: string; household_id: string; name: string; role: Role }>(
		`SELECT m.user_id, m.household_id, h.name, m.role FROM memberships m JOIN households h ON h.id = m.household_id ORDER BY h.created_at`
	);
	return users.map((u) => ({
		...u,
		memberships: members.filter((m) => m.user_id === u.id).map(({ household_id, name, role }) => ({ household_id, name, role }))
	}));
}

export function adminHouseholds(): AdminHousehold[] {
	return all<AdminHousehold>(
		`SELECT h.id, h.name, h.home_country, h.created_at,
		        (SELECT COUNT(*) FROM memberships m WHERE m.household_id = h.id) AS members,
		        (SELECT COUNT(*) FROM trips t WHERE t.household_id = h.id) AS trips
		 FROM households h ORDER BY h.created_at`
	);
}

export function adminCount(): number {
	return get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND email IS NOT NULL AND password_hash IS NOT NULL')!.n;
}

export function ownerCount(householdId: string): number {
	return get<{ n: number }>("SELECT COUNT(*) AS n FROM memberships WHERE household_id = ? AND role = 'owner'", householdId)!.n;
}

/**
 * Accounts mode on an install that was set up with `none`/`local`: profiles exist,
 * but nobody can log in yet. The setup page then lets one profile be claimed.
 */
export function needsClaim(): boolean {
	if (config.authMode !== 'accounts') return false;
	const row = get<{ total: number; loginable: number }>(
		`SELECT COUNT(*) AS total, SUM(email IS NOT NULL AND password_hash IS NOT NULL) AS loginable FROM users`
	)!;
	return row.total > 0 && !row.loginable;
}

/**
 * Turn an existing profile into the first admin account. In none/local mode every
 * profile could see every household, so all profiles keep that access as members
 * (the admin can narrow it down afterwards); the claiming profile becomes owner.
 */
export function claimAccount(userId: string, email: string, passwordHash: string) {
	tx(() => {
		run('UPDATE users SET email = ?, password_hash = ?, is_admin = 1 WHERE id = ?', email, passwordHash, userId);
		run(
			`INSERT OR IGNORE INTO memberships (household_id, user_id, role)
			 SELECT h.id, u.id, 'member' FROM households h CROSS JOIN users u`
		);
		run("UPDATE memberships SET role = 'owner' WHERE user_id = ?", userId);
	});
}

const RANK: Record<Role, number> = { packer: 0, member: 1, owner: 2 };

/**
 * Move everything of one profile/account into another and delete the source:
 * household memberships (the higher role wins), linked travellers, trips created,
 * checkmarks, to-dos and activity.
 */
export function mergeUsers(fromId: string, intoId: string) {
	tx(() => {
		const from = all<{ household_id: string; role: Role }>('SELECT household_id, role FROM memberships WHERE user_id = ?', fromId);
		for (const m of from) {
			const existing = get<{ role: Role }>('SELECT role FROM memberships WHERE household_id = ? AND user_id = ?', m.household_id, intoId);
			if (!existing) run('INSERT INTO memberships (household_id, user_id, role) VALUES (?, ?, ?)', m.household_id, intoId, m.role);
			else if (RANK[m.role] > RANK[existing.role]) run('UPDATE memberships SET role = ? WHERE household_id = ? AND user_id = ?', m.role, m.household_id, intoId);
		}
		run('UPDATE persons SET user_id = ? WHERE user_id = ?', intoId, fromId);
		run('UPDATE trips SET created_by = ? WHERE created_by = ?', intoId, fromId);
		run('UPDATE trip_items SET checked_by = ? WHERE checked_by = ?', intoId, fromId);
		run('UPDATE trip_todos SET done_by = ? WHERE done_by = ?', intoId, fromId);
		run('UPDATE activity SET user_id = ? WHERE user_id = ?', intoId, fromId);
		const src = get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', fromId);
		if (src?.is_admin) run('UPDATE users SET is_admin = 1 WHERE id = ?', intoId);
		run('DELETE FROM users WHERE id = ?', fromId);
	});
}
