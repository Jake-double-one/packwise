import { config } from './config';
import type { WeatherSummary } from '$lib/types';

/**
 * Open-Meteo (https://open-meteo.com) – free, no API key.
 * ≤ 16 days ahead → real forecast; further out → climate average of the same
 * calendar days over the last 10 years (archive API, one request, cached).
 */
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_DAYS = 16;
const CLIMATE_YEARS = 10;

export interface Place {
	name: string;
	admin1: string | null;
	country: string | null;
	country_code: string | null;
	lat: number;
	lon: number;
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...args) => fetch(...args);
/** test hook */
export function setFetcher(f: Fetch) {
	fetcher = f;
}

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();

async function getJson<T>(url: string, ttlMs: number): Promise<T | null> {
	const hit = cache.get(url);
	if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
	try {
		const res = await fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'packwise' } });
		if (!res.ok) return null;
		const value = (await res.json()) as T;
		cache.set(url, { at: Date.now(), ttl: ttlMs, value });
		if (cache.size > 500) cache.delete(cache.keys().next().value!);
		return value;
	} catch (err) {
		console.warn('[weather]', (err as Error).message);
		return null;
	}
}

export async function geocode(query: string, lang: string): Promise<Place[]> {
	if (!config.weatherEnabled || query.trim().length < 2) return [];
	const url = `${GEO}?name=${encodeURIComponent(query.trim())}&count=8&format=json&language=${encodeURIComponent(lang)}`;
	const data = await getJson<{ results?: { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number }[] }>(
		url,
		86_400_000
	);
	return (data?.results ?? []).map((r) => ({
		name: r.name,
		admin1: r.admin1 ?? null,
		country: r.country ?? null,
		country_code: r.country_code?.toUpperCase() ?? null,
		lat: r.latitude,
		lon: r.longitude
	}));
}

interface Daily {
	time: string[];
	temperature_2m_max: (number | null)[];
	temperature_2m_min: (number | null)[];
	precipitation_sum: (number | null)[];
	snowfall_sum: (number | null)[];
	precipitation_probability_max?: (number | null)[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function summarise(daily: Daily, filter: (date: string) => boolean, source: WeatherSummary['source'], days: number): WeatherSummary | null {
	const idx = daily.time.map((d, i) => (filter(d) ? i : -1)).filter((i) => i >= 0);
	const pick = (arr: (number | null)[] | undefined) => idx.map((i) => arr?.[i]).filter((v): v is number => typeof v === 'number');
	const tmax = pick(daily.temperature_2m_max);
	const tmin = pick(daily.temperature_2m_min);
	if (!tmax.length) return null;
	const precip = pick(daily.precipitation_sum);
	const snow = pick(daily.snowfall_sum);
	const prob = pick(daily.precipitation_probability_max);
	return {
		source,
		days,
		avgMax: round1(mean(tmax)),
		avgMin: round1(mean(tmin)),
		maxMax: round1(Math.max(...tmax)),
		minMin: round1(Math.min(...tmin)),
		rainShare: round1(precip.filter((p) => p >= 1).length / Math.max(1, precip.length)),
		precipProb: prob.length ? Math.round(mean(prob)) : null,
		snowPerDay: round1(mean(snow)),
		...(source === 'climate' ? { years: CLIMATE_YEARS } : {})
	};
}

/** Month-day keys (MM-DD) covered by the trip, wrapping around new year. */
function monthDays(start: string, end: string): Set<string> {
	const out = new Set<string>();
	let d = new Date(`${start}T00:00:00Z`);
	const e = new Date(`${end}T00:00:00Z`);
	for (let i = 0; d <= e && i < 366; i++, d = addDays(d, 1)) out.add(iso(d).slice(5));
	return out;
}

export async function weatherFor(lat: number, lon: number, start: string, end: string, today = new Date()): Promise<WeatherSummary | null> {
	if (!config.weatherEnabled) return null;
	const s = new Date(`${start}T00:00:00Z`);
	const e = new Date(`${end}T00:00:00Z`);
	if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
	const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
	const t0 = new Date(`${iso(today)}T00:00:00Z`);
	const horizon = addDays(t0, FORECAST_DAYS - 1);
	const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum';
	const la = lat.toFixed(2);
	const lo = lon.toFixed(2);

	if (s <= horizon && e >= t0) {
		const from = iso(s < t0 ? t0 : s);
		const to = iso(e > horizon ? horizon : e);
		const url = `${FORECAST}?latitude=${la}&longitude=${lo}&daily=${vars},precipitation_probability_max&timezone=auto&start_date=${from}&end_date=${to}`;
		const data = await getJson<{ daily?: Daily }>(url, 3 * 3_600_000);
		if (data?.daily) return summarise(data.daily, () => true, 'forecast', days);
	}

	// climate: same calendar days of the last N complete years – one cached request per location
	const y1 = t0.getUTCFullYear() - 1;
	const y0 = y1 - CLIMATE_YEARS + 1;
	const url = `${ARCHIVE}?latitude=${(+la).toFixed(1)}&longitude=${(+lo).toFixed(1)}&daily=${vars}&timezone=auto&start_date=${y0}-01-01&end_date=${y1}-12-31`;
	const data = await getJson<{ daily?: Daily }>(url, 30 * 86_400_000);
	if (!data?.daily) return null;
	const wanted = monthDays(start, end);
	return summarise(data.daily, (d) => wanted.has(d.slice(5)), 'climate', days);
}

// ── Day by day (trip info tab) ───────────────────────────────────────────────

export interface DayWeather {
	date: string;
	source: 'forecast' | 'climate';
	tmax: number | null;
	tmin: number | null;
	/** forecast: precipitation probability in % · climate: share of rainy years in % */
	rain: number | null;
	/** precipitation in mm (climate: average) */
	precip: number | null;
	/** snowfall in cm (climate: average) */
	snow: number | null;
	/** WMO weather code (forecast only) */
	code: number | null;
}

interface DailyWithCode extends Daily {
	weather_code?: (number | null)[];
}

const num = (v: number | null | undefined) => (typeof v === 'number' ? v : null);

export function forecastDays(daily: DailyWithCode, wanted: Set<string>): DayWeather[] {
	return daily.time
		.map((date, i) => ({
			date,
			source: 'forecast' as const,
			tmax: num(daily.temperature_2m_max[i]),
			tmin: num(daily.temperature_2m_min[i]),
			rain: num(daily.precipitation_probability_max?.[i]),
			precip: num(daily.precipitation_sum[i]),
			snow: num(daily.snowfall_sum[i]),
			code: num(daily.weather_code?.[i])
		}))
		.filter((d) => wanted.has(d.date));
}

/** Average of the same calendar day over all years in the archive response. */
export function climateDays(daily: Daily, dates: string[]): DayWeather[] {
	const byDay = new Map<string, number[]>();
	daily.time.forEach((t, i) => {
		const k = t.slice(5);
		const list = byDay.get(k) ?? [];
		list.push(i);
		byDay.set(k, list);
	});
	return dates.map((date) => {
		const idx = byDay.get(date.slice(5)) ?? byDay.get('02-28') ?? [];
		const vals = (arr: (number | null)[]) => idx.map((i) => arr[i]).filter((v): v is number => typeof v === 'number');
		const avg = (arr: (number | null)[]) => {
			const v = vals(arr);
			return v.length ? round1(mean(v)) : null;
		};
		const precip = vals(daily.precipitation_sum);
		return {
			date,
			source: 'climate' as const,
			tmax: avg(daily.temperature_2m_max),
			tmin: avg(daily.temperature_2m_min),
			rain: precip.length ? Math.round((precip.filter((p) => p >= 1).length / precip.length) * 100) : null,
			precip: avg(daily.precipitation_sum),
			snow: avg(daily.snowfall_sum),
			code: null
		};
	});
}

/** Every trip day: forecast where available, otherwise the 10-year average. */
export async function dailyWeather(lat: number, lon: number, start: string, end: string, today = new Date()): Promise<DayWeather[]> {
	if (!config.weatherEnabled) return [];
	const s = new Date(`${start}T00:00:00Z`);
	const e = new Date(`${end}T00:00:00Z`);
	if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
	const dates: string[] = [];
	for (let d = s; d <= e && dates.length < 62; d = addDays(d, 1)) dates.push(iso(d));
	const t0 = new Date(`${iso(today)}T00:00:00Z`);
	const horizon = addDays(t0, FORECAST_DAYS - 1);
	const vars = 'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum';
	const la = lat.toFixed(2);
	const lo = lon.toFixed(2);

	const result = new Map<string, DayWeather>();
	if (s <= horizon && e >= t0) {
		const from = iso(s < t0 ? t0 : s);
		const to = iso(e > horizon ? horizon : e);
		const url = `${FORECAST}?latitude=${la}&longitude=${lo}&daily=${vars},precipitation_probability_max,weather_code&timezone=auto&start_date=${from}&end_date=${to}`;
		const data = await getJson<{ daily?: DailyWithCode }>(url, 3 * 3_600_000);
		if (data?.daily) for (const d of forecastDays(data.daily, new Set(dates))) result.set(d.date, d);
	}
	const missing = dates.filter((d) => !result.has(d));
	if (missing.length) {
		const y1 = t0.getUTCFullYear() - 1;
		const y0 = y1 - CLIMATE_YEARS + 1;
		const url = `${ARCHIVE}?latitude=${(+la).toFixed(1)}&longitude=${(+lo).toFixed(1)}&daily=${vars}&timezone=auto&start_date=${y0}-01-01&end_date=${y1}-12-31`;
		const data = await getJson<{ daily?: Daily }>(url, 30 * 86_400_000);
		if (data?.daily) for (const d of climateDays(data.daily, missing)) result.set(d.date, d);
	}
	return dates.map((d) => result.get(d)).filter((d): d is DayWeather => !!d);
}

/** Rough position of a country (for trips where only the country was chosen). */
export async function locateCountry(code: string, name: string): Promise<{ lat: number; lon: number } | null> {
	const hit = (await geocode(name, 'en')).find((p) => p.country_code === code);
	return hit ? { lat: hit.lat, lon: hit.lon } : null;
}
