import { json } from '@sveltejs/kit';
import { get } from '$lib/server/db';

export const GET = () => {
	get('SELECT 1');
	return json({ ok: true, version: __APP_VERSION__ });
};
