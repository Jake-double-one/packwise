import { get } from '#lib/server/db.js';

export const GET = () => {
	get('SELECT 1');
	return Response.json({ ok: true, version: __APP_VERSION__ });
};
