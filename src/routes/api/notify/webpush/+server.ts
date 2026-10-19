import { error, json } from '@sveltejs/kit';
import { publicOrigin } from '$lib/server/auth';
import { addChannel, deleteWebPush, rememberOrigin, vapidKeys } from '$lib/server/notify';
import { hostAllowed } from '$lib/server/netguard';
import type { RequestHandler } from './$types';

/** Web Push for the current person: the public VAPID key, subscribe and unsubscribe this browser. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401);
	return json({ publicKey: vapidKeys().publicKey });
};

const validSubscription = (s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } => {
	const sub = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	return (
		typeof sub?.endpoint === 'string' &&
		/^https:\/\//.test(sub.endpoint) &&
		sub.endpoint.length < 1000 &&
		typeof sub.keys?.p256dh === 'string' &&
		typeof sub.keys?.auth === 'string'
	);
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401);
	const body = (await request.json().catch(() => null)) as { subscription?: unknown; device?: unknown } | null;
	if (!validSubscription(body?.subscription)) error(400, 'invalid subscription');
	const { endpoint, keys } = body.subscription;
	if (!(await hostAllowed(endpoint))) error(400, 'invalid subscription');
	const id = addChannel(locals.user.id, { kind: 'webpush', subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } }, String(body.device ?? ''));
	if (!id) error(400, 'notify.err.max');
	rememberOrigin(publicOrigin(request));
	return json({ id });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401);
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (typeof body?.endpoint === 'string') deleteWebPush(locals.user.id, body.endpoint);
	return json({ ok: true });
};
