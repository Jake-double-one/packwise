/**
 * Minimal in-process pub/sub over Server-Sent Events. One Node process serves
 * everything, so no Redis is needed. Channels: `trip:<id>`, `tpl:<householdId>`.
 */
export interface Presence {
	id: string;
	name: string;
	color: string;
	avatar?: string | null;
}

interface Subscriber {
	id: string;
	presence: Presence;
	send: (event: string, data: unknown) => void;
	/** still allowed to listen? checked before each event and with the heartbeat */
	allowed: () => boolean;
	close: () => void;
}

const channels = new Map<string, Set<Subscriber>>();
let counter = 0;
let open = 0;
/** one process, one household or a few – far more open streams than this means something is wrong */
const MAX_OPEN = 1000;
/** many tabs and devices of one person are fine, a few hundred are not */
const MAX_PER_USER = 30;

export function publish(channel: string, event: string, data: unknown) {
	for (const sub of [...(channels.get(channel) ?? [])]) {
		if (!sub.allowed()) {
			sub.close();
			continue;
		}
		try {
			sub.send(event, data);
		} catch {
			/* closed stream – removed on cancel */
		}
	}
}

/** End the streams of a person (logged out, removed from a household or trip) – of one channel or all. */
export function closeUserStreams(userId: string, channel?: string) {
	for (const [name, set] of channels) {
		if (channel && name !== channel) continue;
		for (const sub of [...set]) if (sub.presence.id === userId) sub.close();
	}
}

function presenceList(channel: string): Presence[] {
	const seen = new Map<string, Presence>();
	for (const s of channels.get(channel) ?? []) seen.set(s.presence.id, s.presence);
	return [...seen.values()];
}

function streamsOf(userId: string) {
	let n = 0;
	for (const set of channels.values()) for (const s of set) if (s.presence.id === userId) n++;
	return n;
}

/**
 * Returns an SSE response that streams events of `channel` until the client disconnects
 * or `allowed` says no any more (session ended, access taken away).
 */
export function sseResponse(
	channel: string,
	presence: Presence,
	allowed: () => boolean,
	onOpen?: (send: Subscriber['send']) => void
): Response {
	if (open >= MAX_OPEN || streamsOf(presence.id) >= MAX_PER_USER)
		return new Response('too many open connections', { status: 503, headers: { 'retry-after': '30' } });
	const encoder = new TextEncoder();
	let sub: Subscriber;
	let heartbeat: ReturnType<typeof setInterval>;
	let removed = false;

	const remove = () => {
		if (removed) return;
		removed = true;
		clearInterval(heartbeat);
		open--;
		const set = channels.get(channel);
		set?.delete(sub);
		if (set && set.size === 0) channels.delete(channel);
		else publish(channel, 'presence', presenceList(channel));
	};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (event: string, data: unknown) =>
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			const close = () => {
				remove();
				try {
					controller.close();
				} catch {
					/* already closed */
				}
			};
			sub = { id: `s${++counter}`, presence, send, allowed, close };
			let set = channels.get(channel);
			if (!set) channels.set(channel, (set = new Set()));
			set.add(sub);
			open++;
			controller.enqueue(encoder.encode('retry: 3000\n\n'));
			onOpen?.(send);
			publish(channel, 'presence', presenceList(channel));
			heartbeat = setInterval(() => {
				if (!allowed()) return close();
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					clearInterval(heartbeat);
				}
			}, 25_000);
		},
		cancel() {
			remove();
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
}
