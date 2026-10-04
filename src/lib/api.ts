export class ApiError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
	}
}

/** JSON POST helper; throws ApiError with the server's message key. */
export async function api<T = unknown>(url: string, body: unknown, method = 'POST'): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		let message = `HTTP ${res.status}`;
		try {
			const data = await res.json();
			message = data.message ?? data.error ?? message;
		} catch {
			/* ignore */
		}
		throw new ApiError(message, res.status);
	}
	return res.json() as Promise<T>;
}

/** Stable per-tab id so a client can ignore echoes of its own changes. */
export const clientId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

/** EventSource with automatic resubscribe; returns a close function. */
export function live(url: string, handlers: Record<string, (data: any) => void>, onState?: (online: boolean) => void): () => void {
	let es: EventSource | null = null;
	let closed = false;
	let retry: ReturnType<typeof setTimeout>;
	const connect = () => {
		es = new EventSource(url);
		es.onopen = () => onState?.(true);
		es.onerror = () => {
			onState?.(false);
			if (es?.readyState === EventSource.CLOSED && !closed) {
				retry = setTimeout(connect, 3000);
			}
		};
		for (const [event, fn] of Object.entries(handlers)) {
			es.addEventListener(event, (e) => fn(JSON.parse((e as MessageEvent).data)));
		}
	};
	connect();
	return () => {
		closed = true;
		clearTimeout(retry);
		es?.close();
	};
}
