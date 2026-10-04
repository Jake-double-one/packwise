import { json } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import { tripAccess } from '$lib/server/trips';
import { dailyWeather, locateCountry } from '$lib/server/weather';
import { countryName } from '$lib/data/countries';
import type { RequestHandler } from './$types';

/** Trip info tab: position for the map and the day-by-day weather. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip } = tripAccess(locals, params.id);
	let location: { lat: number; lon: number; precision: 'place' | 'country' } | null = null;
	if (trip.lat != null && trip.lon != null) location = { lat: trip.lat, lon: trip.lon, precision: 'place' };
	else if (trip.country && config.weatherEnabled) {
		const pos = await locateCountry(trip.country, countryName(trip.country, 'en'));
		if (pos) location = { ...pos, precision: 'country' };
	}
	const days = location && location.precision === 'place' ? await dailyWeather(location.lat, location.lon, trip.start_date, trip.end_date) : [];
	return json({ location, days, weatherEnabled: config.weatherEnabled });
};
