import { translate } from '#lib/i18n/index.js';
import { householdsFor, getUser } from './auth';
import { config } from './config';
import { all, get } from './db';
import { messagesFor } from './i18n';
import { getPrefs, linkOrigin, markSent, notifyUser, type Message } from './notify';

/**
 * Reminders before a trip, checked every few minutes by the scheduler:
 * - X days before departure (and optionally the day before): how much is packed, open to-dos
 * - to-dos that are due today
 * A person gets them for trips they travel on (their profile/account is linked to one of the
 * trip's travellers) or were invited to as a guest – one message per trip and day.
 */

/** YYYY-MM-DD in the server's time zone (TZ) */
export function localDate(d = new Date()): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

interface TripRow {
	id: string;
	name: string;
	household_id: string;
	start_date: string;
	end_date: string;
	settings: string;
}

/** Upcoming and running trips a person travels on (to-dos before heading home are due during the trip). */
function tripsFor(userId: string, today: string): TripRow[] {
	const user = getUser(userId);
	if (!user) return [];
	const households = householdsFor(user).map((h) => h.id);
	const mine = new Set(all<{ id: string }>('SELECT id FROM persons WHERE user_id = ?', userId).map((p) => p.id));
	const own = households.length
		? all<TripRow>(
				`SELECT id, name, household_id, start_date, end_date, settings FROM trips WHERE end_date >= ? AND household_id IN (${households.map(() => '?').join(',')})`,
				today,
				...households
			).filter((t) => {
				try {
					return ((JSON.parse(t.settings) as { persons?: string[] }).persons ?? []).some((p) => mine.has(p));
				} catch {
					return false;
				}
			})
		: [];
	const guest =
		config.authMode === 'accounts'
			? all<TripRow>(
					`SELECT t.id, t.name, t.household_id, t.start_date, t.end_date, t.settings FROM trip_guests g JOIN trips t ON t.id = g.trip_id
					 WHERE g.user_id = ? AND t.end_date >= ?`,
					userId,
					today
				)
			: [];
	return [...own, ...guest.filter((g) => !own.some((o) => o.id === g.id))];
}

/** What a person should hear about today – one message per trip. */
export function remindersFor(userId: string, today = localDate()): { key: string; trip: TripRow; message: Message }[] {
	const prefs = getPrefs(userId);
	const locale = get<{ locale: string | null }>('SELECT locale FROM users WHERE id = ?', userId)?.locale || config.defaultLang;
	const m = messagesFor(locale);
	const t = (key: string, vars?: Record<string, string | number>) => translate(m, key, vars);
	const mine = new Set(all<{ id: string }>('SELECT id FROM persons WHERE user_id = ?', userId).map((p) => p.id));
	const origin = linkOrigin(userId);
	const out: { key: string; trip: TripRow; message: Message }[] = [];

	for (const trip of tripsFor(userId, today)) {
		const days = daysBetween(today, trip.start_date);
		const departure = (prefs.departureDays > 0 && days === prefs.departureDays) || (prefs.dayBefore && days === 1);
		// to-dos before departure count down to the start, those before heading home to the end
		const due = prefs.todos
			? all<{ name: string; person_id: string | null }>(
					`SELECT name, person_id FROM trip_todos WHERE trip_id = ? AND done = 0
					   AND ((phase = 'pack' AND days_before = ?) OR (phase = 'return' AND days_before = ?)) ORDER BY name`,
					trip.id,
					days,
					daysBetween(today, trip.end_date)
				).filter((td) => !td.person_id || mine.has(td.person_id))
			: [];
		if (!departure && !due.length) continue;

		const count = get<{ total: number; done: number }>(
			`SELECT COUNT(*) AS total, COALESCE(SUM(checked), 0) AS done FROM trip_items WHERE trip_id = ? AND kind = 'item'`,
			trip.id
		)!;
		const open = get<{ n: number }>('SELECT COUNT(*) AS n FROM trip_todos WHERE trip_id = ? AND done = 0', trip.id)!.n;
		const lines: string[] = [];
		if (departure) {
			const pct = count.total ? Math.round((count.done / count.total) * 100) : 0;
			lines.push(t('notify.msg.packed', { pct, done: count.done, total: count.total }) + (open ? ` · ${t('notify.msg.todos_open', { count: open })}` : ''));
		}
		if (due.length) lines.push(t('notify.msg.todos_due', { list: due.map((d) => d.name).join(', ') }));
		out.push({
			key: `trip:${trip.id}:${today}`,
			trip,
			message: {
				title:
					days < 0
						? t('notify.msg.title_away', { trip: trip.name })
						: days === 0
							? t('notify.msg.title_today', { trip: trip.name })
							: t('notify.msg.title_days', { trip: trip.name, count: days }),
				body: lines.join('\n'),
				url: origin ? `${origin}/t/${trip.id}` : undefined,
				tags: ['luggage']
			}
		});
	}
	return out;
}

/** Send what's due to everybody with at least one channel. Called by the scheduler. */
export async function runReminders(date = new Date()) {
	const today = localDate(date);
	const users = all<{ user_id: string }>('SELECT DISTINCT user_id FROM notify_channels');
	for (const { user_id } of users) {
		if (date.getHours() < getPrefs(user_id).hour) continue;
		for (const r of remindersFor(user_id, today)) {
			if (get('SELECT 1 FROM notify_log WHERE user_id = ? AND key = ?', user_id, r.key)) continue;
			// only remembered once at least one channel got it – otherwise it's tried again later
			if ((await notifyUser(user_id, r.message)) > 0) {
				markSent(user_id, r.key);
			}
		}
	}
}
