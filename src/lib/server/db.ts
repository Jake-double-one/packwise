import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from './config';

/**
 * Schema migrations. Append only – never edit a migration that has shipped.
 */
const MIGRATIONS: string[] = [
	/* 1 – initial schema */ `
	CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

	CREATE TABLE users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT UNIQUE COLLATE NOCASE,
		password_hash TEXT,
		is_admin INTEGER NOT NULL DEFAULT 0,
		color TEXT NOT NULL DEFAULT '#6366f1',
		locale TEXT,
		theme TEXT,
		totp_secret TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE sessions (
		id TEXT PRIMARY KEY,            -- sha256 of the cookie token
		user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE tokens (
		id TEXT PRIMARY KEY,            -- sha256 of the token
		kind TEXT NOT NULL,             -- invite | reset
		user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
		household_id TEXT REFERENCES households(id) ON DELETE CASCADE,
		email TEXT,
		role TEXT,
		expires_at INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE households (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		home_country TEXT,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE memberships (
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role TEXT NOT NULL DEFAULT 'member', -- owner | member | packer
		PRIMARY KEY (household_id, user_id)
	);

	CREATE TABLE persons (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		kind TEXT NOT NULL DEFAULT 'adult', -- adult | child | baby | pet
		color TEXT NOT NULL,
		user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
		sort REAL NOT NULL DEFAULT 0
	);

	CREATE TABLE bags (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		color TEXT NOT NULL,
		icon TEXT NOT NULL DEFAULT '🧳',
		sort REAL NOT NULL DEFAULT 0
	);

	CREATE TABLE template_nodes (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		parent_id TEXT REFERENCES template_nodes(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,             -- group | item
		name TEXT NOT NULL,
		sort REAL NOT NULL DEFAULT 0,
		bag_id TEXT REFERENCES bags(id) ON DELETE SET NULL,
		person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
		qty REAL NOT NULL DEFAULT 1,
		qty_mode TEXT NOT NULL DEFAULT 'fixed', -- fixed | per_day | per_night
		qty_extra REAL NOT NULL DEFAULT 0,
		qty_max REAL,
		per_person INTEGER NOT NULL DEFAULT 0,
		rules TEXT NOT NULL DEFAULT '{}',
		needs_power INTEGER NOT NULL DEFAULT 0,
		consumable INTEGER NOT NULL DEFAULT 0,
		note TEXT NOT NULL DEFAULT '',
		not_needed_count INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX idx_template_household ON template_nodes(household_id);

	CREATE TABLE trips (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		destination TEXT NOT NULL DEFAULT '',
		country TEXT,
		lat REAL,
		lon REAL,
		start_date TEXT NOT NULL,
		end_date TEXT NOT NULL,
		settings TEXT NOT NULL DEFAULT '{}',   -- persons, context chips, laundry …
		weather TEXT,                          -- weather summary JSON
		warnings TEXT NOT NULL DEFAULT '[]',
		notes TEXT NOT NULL DEFAULT '[]',
		created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX idx_trips_household ON trips(household_id);

	CREATE TABLE trip_items (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		parent_id TEXT REFERENCES trip_items(id) ON DELETE CASCADE,
		kind TEXT NOT NULL,
		name TEXT NOT NULL,
		sort REAL NOT NULL DEFAULT 0,
		template_id TEXT,              -- template node this came from (no FK: template may change)
		origin TEXT NOT NULL DEFAULT 'template', -- template | manual | auto
		reason TEXT NOT NULL DEFAULT '',
		bag_id TEXT,
		person_id TEXT,
		qty REAL NOT NULL DEFAULT 1,
		needs_power INTEGER NOT NULL DEFAULT 0,
		consumable INTEGER NOT NULL DEFAULT 0,
		note TEXT NOT NULL DEFAULT '',
		checked INTEGER NOT NULL DEFAULT 0,
		checked_by TEXT,
		checked_at INTEGER,
		returned INTEGER NOT NULL DEFAULT 0,
		not_needed INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX idx_trip_items_trip ON trip_items(trip_id);

	CREATE TABLE activity (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		user_id TEXT,
		actor TEXT NOT NULL,
		action TEXT NOT NULL,
		subject TEXT NOT NULL DEFAULT '',
		at INTEGER NOT NULL
	);
	CREATE INDEX idx_activity_trip ON activity(trip_id, at);
	`,
	/* 2 – to-dos before departure, return-trip mode */ `
	ALTER TABLE trips ADD COLUMN phase TEXT NOT NULL DEFAULT 'pack'; -- pack | return
	ALTER TABLE trips ADD COLUMN todos_enabled INTEGER NOT NULL DEFAULT 0;

	CREATE TABLE todo_templates (
		id TEXT PRIMARY KEY,
		household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		days_before INTEGER NOT NULL DEFAULT 0,
		person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
		rules TEXT NOT NULL DEFAULT '{}',
		note TEXT NOT NULL DEFAULT '',
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX idx_todo_templates_household ON todo_templates(household_id);

	CREATE TABLE trip_todos (
		id TEXT PRIMARY KEY,
		trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		days_before INTEGER NOT NULL DEFAULT 0,
		person_id TEXT,
		note TEXT NOT NULL DEFAULT '',
		template_id TEXT,
		origin TEXT NOT NULL DEFAULT 'template',
		done INTEGER NOT NULL DEFAULT 0,
		done_by TEXT,
		done_at INTEGER,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX idx_trip_todos_trip ON trip_todos(trip_id);
	`
];

let instance: DatabaseSync | null = null;

export function db(): DatabaseSync {
	if (instance) return instance;
	fs.mkdirSync(config.dataDir, { recursive: true });
	const file = path.join(config.dataDir, 'packwise.db');
	const conn = new DatabaseSync(file);
	conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	migrate(conn);
	instance = conn;
	return conn;
}

function migrate(conn: DatabaseSync) {
	conn.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
	const row = conn.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
	let version = row?.version ?? 0;
	if (!row) conn.exec('INSERT INTO schema_version (version) VALUES (0)');
	while (version < MIGRATIONS.length) {
		conn.exec('BEGIN');
		try {
			conn.exec(MIGRATIONS[version]);
			version++;
			conn.prepare('UPDATE schema_version SET version = ?').run(version);
			conn.exec('COMMIT');
		} catch (err) {
			conn.exec('ROLLBACK');
			throw err;
		}
	}
}

type Params = SQLInputValue[];

export function all<T>(sql: string, ...params: Params): T[] {
	return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Params): T | undefined {
	return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Params) {
	return db().prepare(sql).run(...params);
}

let txDepth = 0;
/** Runs `fn` inside a transaction (nested calls join the outer one). */
export function tx<T>(fn: () => T): T {
	const conn = db();
	if (txDepth > 0) return fn();
	txDepth++;
	conn.exec('BEGIN');
	try {
		const result = fn();
		conn.exec('COMMIT');
		return result;
	} catch (err) {
		conn.exec('ROLLBACK');
		throw err;
	} finally {
		txDepth--;
	}
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random base62 id; 12 chars ≈ 71 bits, 16 chars ≈ 95 bits. */
export function newId(length = 16): string {
	const bytes = randomBytes(length * 2);
	let out = '';
	for (let i = 0; i < bytes.length && out.length < length; i++) {
		const b = bytes[i];
		if (b < 248) out += ALPHABET[b % 62];
	}
	return out.length === length ? out : newId(length);
}

export function getMeta(key: string): string | undefined {
	return get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value;
}

export function setMeta(key: string, value: string) {
	run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

export const now = () => Date.now();
