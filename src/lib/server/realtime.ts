/**
 * Minimal in-process pub/sub over Server-Sent Events. One Node process serves
 * everything, so no Redis is needed. Channels: `trip:<id>`, `tpl:<householdId>`.
 */
export interface Presence {
	id: string;
	name: string;
	color: string;
}

interface Subscriber {
	id: string;
	presence: Presence;
	send: (event: string, data: unknown) => void;
}

const channels = new Map<string, Set<Subscriber>>();
let counter = 0;

export function publish(channel: string, event: string, data: unknown) {
	for (const sub of channels.get(channel) ?? []) {
		try {
			sub.send(event, data);
		} catch {
			/* closed stream – removed on cancel */
		}
	}
}

function presenceList(channel: string): Presence[] {
	const seen = new Map<string, Presence>();
	for (const s of channels.get(channel) ?? []) seen.set(s.presence.id, s.presence);
	return [...seen.values()];
}

/** Returns an SSE response that streams events of `channel` until the client disconnects. */
export function sseResponse(channel: string, presence: Presence, onOpen?: (send: Subscriber['send']) => void): Response {
	const encoder = new TextEncoder();
	let sub: Subscriber;
	let heartbeat: ReturnType<typeof setInterval>;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (event: string, data: unknown) =>
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			sub = { id: `s${++counter}`, presence, send };
			let set = channels.get(channel);
			if (!set) channels.set(channel, (set = new Set()));
			set.add(sub);
			controller.enqueue(encoder.encode('retry: 3000\n\n'));
			onOpen?.(send);
			publish(channel, 'presence', presenceList(channel));
			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					clearInterval(heartbeat);
				}
			}, 25_000);
		},
		cancel() {
			clearInterval(heartbeat);
			const set = channels.get(channel);
			set?.delete(sub);
			if (set && set.size === 0) channels.delete(channel);
			else publish(channel, 'presence', presenceList(channel));
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
