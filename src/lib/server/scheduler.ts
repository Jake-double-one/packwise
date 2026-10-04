import { purgeExpiredSessions } from './auth';

let started = false;

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
}
