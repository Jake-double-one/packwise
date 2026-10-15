import { purgeExpiredSessions } from './auth';
import { runReminders } from './reminders';

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
	const hourly = setInterval(() => {
		try {
			purgeExpiredSessions();
		} catch (err) {
			console.error('[scheduler]', err);
		}
	}, 3_600_000);
	hourly.unref();
	// shortly after start, then every 5 minutes
	setTimeout(reminders, 20_000).unref();
	setInterval(reminders, 5 * 60_000).unref();
}
