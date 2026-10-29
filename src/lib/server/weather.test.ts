import { describe, expect, it } from 'vitest';
import { climateDays, dailyWeather, forecastDays, setFetcher, weatherNeedsRefresh } from './weather';

const archive = {
	time: ['2016-07-01', '2016-07-02', '2017-07-01', '2017-07-02'],
	temperature_2m_max: [30, 28, 26, 24],
	temperature_2m_min: [20, 18, 16, 14],
	precipitation_sum: [0, 5, 2, 0],
	snowfall_sum: [0, 0, 0, 0]
};

describe('day-by-day weather', () => {
	it('averages the same calendar day over the years', () => {
		const days = climateDays(archive, ['2026-07-01', '2026-07-02']);
		expect(days[0]).toMatchObject({ date: '2026-07-01', source: 'climate', tmax: 28, tmin: 18, rain: 50 });
		expect(days[1]).toMatchObject({ tmax: 26, tmin: 16, rain: 50 });
	});

	it('keeps only trip days from the forecast', () => {
		const days = forecastDays(
			{ ...archive, time: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'], precipitation_probability_max: [10, 20, 30, 40], weather_code: [0, 3, 61, 71] },
			new Set(['2026-07-02', '2026-07-03'])
		);
		expect(days.map((d) => [d.date, d.rain, d.code])).toEqual([
			['2026-07-02', 20, 3],
			['2026-07-03', 30, 61]
		]);
	});

	it('mixes forecast and climate across the 16-day horizon', async () => {
		setFetcher((async (url: string) => {
			const u = new URL(url);
			if (u.hostname.startsWith('archive')) {
				const time: string[] = [];
				for (let y = 2016; y <= 2025; y++) for (let d = 1; d <= 31; d++) time.push(`${y}-07-${String(d).padStart(2, '0')}`);
				const n = time.length;
				return new Response(JSON.stringify({ daily: { time, temperature_2m_max: Array(n).fill(25), temperature_2m_min: Array(n).fill(15), precipitation_sum: Array(n).fill(0), snowfall_sum: Array(n).fill(0) } }));
			}
			const from = new Date(u.searchParams.get('start_date')!);
			const to = new Date(u.searchParams.get('end_date')!);
			const time: string[] = [];
			for (let d = from; d <= to; d = new Date(d.getTime() + 86400000)) time.push(d.toISOString().slice(0, 10));
			const n = time.length;
			return new Response(JSON.stringify({ daily: { time, temperature_2m_max: Array(n).fill(30), temperature_2m_min: Array(n).fill(20), precipitation_sum: Array(n).fill(0), snowfall_sum: Array(n).fill(0), precipitation_probability_max: Array(n).fill(5), weather_code: Array(n).fill(0) } }));
		}) as typeof fetch);
		const days = await dailyWeather(39.5, 2.6, '2026-07-10', '2026-07-20', new Date('2026-06-28T10:00:00Z'));
		expect(days).toHaveLength(11);
		// horizon: 16 days from 2026-06-28 → last forecast day 2026-07-13
		expect(days.filter((d) => d.source === 'forecast').map((d) => d.date)).toEqual(['2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13']);
		expect(days.at(-1)).toMatchObject({ date: '2026-07-20', source: 'climate', tmax: 25 });
	});
});

describe('weatherNeedsRefresh', () => {
	const today = new Date('2026-06-10T12:00:00Z');
	const h = 3_600_000;
	const trip = { lat: 48.1, lon: 11.6, start_date: '2026-06-20', end_date: '2026-06-27', weather: { source: 'climate' }, weather_at: today.getTime() - 24 * h };

	it('fetches again when the forecast reaches the trip and the copy is a few hours old', () => {
		expect(weatherNeedsRefresh(trip, today)).toBe(true);
		expect(weatherNeedsRefresh({ ...trip, weather_at: today.getTime() - 2 * h }, today)).toBe(false);
	});

	it('leaves a far-away trip with its climate average alone – unless nothing was fetched yet', () => {
		const far = { ...trip, start_date: '2026-08-01', end_date: '2026-08-10' };
		expect(weatherNeedsRefresh(far, today)).toBe(false);
		expect(weatherNeedsRefresh({ ...far, weather: null, weather_at: null }, today)).toBe(true);
	});

	it('never for a trip that is over or has no place', () => {
		expect(weatherNeedsRefresh({ ...trip, start_date: '2026-05-01', end_date: '2026-05-09' }, today)).toBe(false);
		expect(weatherNeedsRefresh({ ...trip, lat: null, lon: null }, today)).toBe(false);
	});

	it('a trip that is running still gets the forecast', () => {
		expect(weatherNeedsRefresh({ ...trip, start_date: '2026-06-05', end_date: '2026-06-15' }, today)).toBe(true);
	});
});
