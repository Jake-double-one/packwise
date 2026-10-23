import { error } from '@sveltejs/kit';
import { config } from '#lib/server/config.js';
import { publicOrigin } from '#lib/server/auth.js';
import { messagesFor } from '#lib/server/i18n.js';
import { sendMail, smtpEnabled } from '#lib/server/mail.js';
import { listTripGuests, removeTripGuest } from '#lib/server/repo.js';
import { createToken } from '#lib/server/tokens.js';
import { tripAccess } from '#lib/server/trips.js';
import { translate } from '#lib/i18n/index.js';
import type { RequestHandler } from './$types';

/**
 * Guests of a trip (accounts mode): household members invite other accounts to
 * just this trip; guests may edit the trip but see nothing else of the household.
 */
function access(locals: App.Locals, id: string) {
	if (config.authMode !== 'accounts' || !locals.user) error(404);
	return tripAccess(locals, id);
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { trip } = access(locals, params.id);
	return Response.json({ guests: listTripGuests(trip.id) });
};

/** Create an invitation link (valid 7 days, single use), optionally sent by e-mail. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { trip, hh } = access(locals, params.id);
	if (hh.role === 'guest') error(403, 'error.forbidden');
	const body = await request.json().catch(() => ({}));
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	if (email && !/^\S+@\S+\.\S+$/.test(email)) error(400, 'auth.err.email');
	const token = createToken('trip_invite', { trip_id: trip.id, email: email || null }, 7 * 86_400_000);
	const link = `${publicOrigin(request)}/invite/${token}`;
	let mailed = false;
	if (email && smtpEnabled()) {
		const m = messagesFor(locals.locale);
		mailed = await sendMail(
			email,
			translate(m, 'mail.trip_invite.subject', { trip: trip.name }),
			translate(m, 'mail.trip_invite.body', { name: locals.user!.name, trip: trip.name, link })
		);
	}
	return Response.json({ link, mailed, smtp: smtpEnabled() });
};

/** Remove a guest – or leave the trip yourself as a guest. */
export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	const { trip, hh } = access(locals, params.id);
	const body = await request.json().catch(() => ({}));
	const userId = typeof body.user_id === 'string' ? body.user_id : '';
	const self = userId === locals.user!.id;
	if (hh.role === 'guest' && !self) error(403, 'error.forbidden');
	removeTripGuest(trip.id, userId);
	return Response.json({ guests: listTripGuests(trip.id) });
};
