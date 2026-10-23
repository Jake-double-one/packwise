import { weatherFor } from '#lib/server/weather.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const lat = Number(url.searchParams.get('lat'));
	const lon = Number(url.searchParams.get('lon'));
	const start = url.searchParams.get('start') ?? '';
	const end = url.searchParams.get('end') ?? '';
	if (!Number.isFinite(lat) || !Number.isFinite(lon) || !start || !end) return Response.json({ weather: null });
	return Response.json({ weather: await weatherFor(lat, lon, start, end) });
};
