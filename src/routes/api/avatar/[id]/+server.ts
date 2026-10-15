import { error } from '@sveltejs/kit';
import { get } from '$lib/server/db';
import type { RequestHandler } from './$types';

/** Uploaded profile picture. The URL carries a version, so it can be cached for good. */
export const GET: RequestHandler = async ({ params }) => {
	const row = get<{ avatar_img: string | null }>('SELECT avatar_img FROM users WHERE id = ?', params.id);
	const match = row?.avatar_img?.match(/^data:(image\/(?:webp|jpeg|png));base64,(.+)$/);
	if (!match) error(404);
	return new Response(Buffer.from(match[2], 'base64'), {
		headers: { 'content-type': match[1], 'cache-control': 'private, max-age=31536000, immutable' }
	});
};
