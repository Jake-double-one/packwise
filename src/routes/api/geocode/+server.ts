import { json } from '@sveltejs/kit';
import { geocode } from '$lib/server/weather';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	return json({ places: await geocode(url.searchParams.get('q') ?? '', locals.locale) });
};
