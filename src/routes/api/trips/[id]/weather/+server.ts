import { now, run } from '#lib/server/db.js';
import { tripAccess } from '#lib/server/trips.js';
import { homeWeatherFor, weatherFor, weatherNeedsRefresh } from '#lib/server/weather.js';
import type { RequestHandler } from './$types';

/**
 * Weather for the trip page: the destination's summary (fetched again when somebody opens the
 * trip and the stored one is older than a few hours while the forecast reaches the trip) and,
 * for the way back, the first days at home – when the household has set its home town.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip, hh } = tripAccess(locals, params.id);
	const over = trip.end_date < new Date().toISOString().slice(0, 10);
	const [fresh, home] = await Promise.all([
		weatherNeedsRefresh(trip) ? weatherFor(trip.lat!, trip.lon!, trip.start_date, trip.end_date) : Promise.resolve(null),
		!over && hh.home_lat != null && hh.home_lon != null ? homeWeatherFor(hh.home_lat, hh.home_lon, trip.end_date) : Promise.resolve(null)
	]);
	if (weatherNeedsRefresh(trip)) {
		// a failed fetch is also remembered, so an unreachable service isn't asked on every visit
		const keep = fresh ?? trip.weather;
		run('UPDATE trips SET weather = ?, weather_at = ? WHERE id = ?', keep ? JSON.stringify(keep) : null, now(), trip.id);
	}
	return Response.json({ weather: fresh ?? trip.weather, home, homePlace: hh.home_place });
};
