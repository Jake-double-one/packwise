import { purgeExpiredSessions } from './auth';
import { now, run } from './db';
import { runReminders } from './reminders';

/** Expired sessions and links, and the reminder log after two months (it only prevents repeats). */
function housekeeping() {
	try {
		purgeExpiredSessions();
		run('DELETE FROM notify_log WHERE sent_at < ?', now() - 60 * 86_400_000);
	} catch (err) {
		console.error('[scheduler]', err);
	}
}

let started = false;
let reminding = false;

/** Reminders before trips; a run is skipped while the previous one is still sending. */
async function reminders() {
	if (reminding) return;
	reminding = true;
	try {
		await runReminders();
	} catch (err) {
		console.error('[scheduler] reminders', err);
	} finally {
		reminding = false;
	}
}

/** Lightweight in-process scheduler – no extra container needed. */
export function startScheduler() {
	if (started || process.env.VITEST) return;
	started = true;
	setTimeout(housekeeping, 10_000).unref();
	setInterval(housekeeping, 3_600_000).unref();
	// shortly after start, then every 5 minutes
	setTimeout(reminders, 20_000).unref();
	setInterval(reminders, 5 * 60_000).unref();
}
