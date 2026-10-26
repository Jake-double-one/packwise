import { describe, expect, it } from 'vitest';
import { closeUserStreams, publish, sseResponse } from './realtime';

const decoder = new TextDecoder();

async function read(res: Response) {
	const reader = res.body!.getReader();
	let text = '';
	const next = async () => {
		const { value, done } = await reader.read();
		if (!done) text += decoder.decode(value);
		return done;
	};
	return { reader, next, text: () => text };
}

describe('realtime', () => {
	it('ends a stream as soon as access is gone', async () => {
		let ok = true;
		const res = sseResponse('trip:t1', { id: 'u1', name: 'A', color: '#000' }, () => ok);
		const s = await read(res);
		await s.next(); // retry
		await s.next(); // presence
		publish('trip:t1', 'op', { n: 1 });
		await s.next();
		expect(s.text()).toContain('event: op');
		ok = false;
		publish('trip:t1', 'op', { n: 2 });
		expect(await s.next()).toBe(true);
		expect(s.text()).not.toContain('"n":2');
	});

	it('closes the streams of one person', async () => {
		const a = await read(sseResponse('tpl:h1', { id: 'u2', name: 'B', color: '#000' }, () => true));
		const b = await read(sseResponse('tpl:h1', { id: 'u3', name: 'C', color: '#000' }, () => true));
		await a.next();
		await b.next();
		closeUserStreams('u2', 'tpl:h1');
		let done = false;
		while (!done) done = await a.next();
		expect(done).toBe(true);
		publish('tpl:h1', 'nodes', { x: 1 });
		let seen = false;
		while (!seen) {
			await b.next();
			seen = b.text().includes('event: nodes');
		}
		expect(seen).toBe(true);
	});
});
