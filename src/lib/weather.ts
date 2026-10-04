import type { WeatherSummary } from './types';

/** Derive climate chips from a weather summary. Several may apply at once. */
export function classifyClimate(w: WeatherSummary | null): string[] {
	if (!w) return [];
	const out: string[] = [];
	if (w.avgMax >= 28) out.push('hot');
	if (w.avgMax >= 19 && w.avgMax < 29) out.push('warm');
	if (w.avgMax >= 11 && w.avgMax < 21) out.push('mild');
	if (w.avgMax < 12 || w.avgMin < 4) out.push('cold');
	if (w.snowPerDay >= 0.3 || w.avgMax <= 2) out.push('snow');
	if (w.rainShare >= 0.35 || (w.precipProb ?? 0) >= 45) out.push('rain');
	return out;
}

/** Meteorological season of the trip's midpoint, flipped on the southern hemisphere. */
export function seasonOf(start: string, end: string, lat: number | null | undefined): string {
	const a = Date.parse(start);
	const b = Date.parse(end);
	const mid = new Date(Number.isNaN(b) ? a : (a + b) / 2);
	const m = mid.getUTCMonth() + 1;
	let season = m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
	if (lat != null && lat < 0) {
		season = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' }[season]!;
	}
	return season;
}

/** Inclusive number of days and nights between two ISO dates. */
export function tripLength(start: string, end: string): { days: number; nights: number } {
	const ms = Date.parse(end) - Date.parse(start);
	const nights = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
	return { days: nights + 1, nights };
}

export function weatherIcon(w: WeatherSummary | null): string {
	if (!w) return '❔';
	if (w.snowPerDay >= 0.3) return '🌨️';
	if (w.rainShare >= 0.5 || (w.precipProb ?? 0) >= 60) return '🌧️';
	if (w.rainShare >= 0.3) return '🌦️';
	if (w.avgMax >= 26) return '☀️';
	if (w.avgMax >= 16) return '🌤️';
	return '☁️';
}

/** Icon for one day: WMO weather code (forecast) or derived from the averages (climate). */
export function dayIcon(d: { code: number | null; tmax: number | null; rain: number | null; snow: number | null }): string {
	const c = d.code;
	if (c != null) {
		if (c === 0) return '☀️';
		if (c <= 2) return '🌤️';
		if (c === 3) return '☁️';
		if (c === 45 || c === 48) return '🌫️';
		if (c >= 51 && c <= 57) return '🌦️';
		if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return '🌧️';
		if ((c >= 71 && c <= 77) || c === 85 || c === 86) return '🌨️';
		if (c >= 95) return '⛈️';
	}
	if ((d.snow ?? 0) >= 0.5) return '🌨️';
	if ((d.rain ?? 0) >= 60) return '🌧️';
	if ((d.rain ?? 0) >= 35) return '🌦️';
	if ((d.tmax ?? 0) >= 26) return '☀️';
	if ((d.tmax ?? 0) >= 16) return '🌤️';
	return '☁️';
}
