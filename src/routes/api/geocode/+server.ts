import { geocode } from '#lib/server/weather.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	return Response.json({ places: await geocode(url.searchParams.get('q') ?? '', locals.locale) });
};
