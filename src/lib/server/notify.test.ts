import { describe, expect, it } from 'vitest';
import { parseChannel } from './notify';
import { localDate } from './reminders';

const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('notification channels', () => {
	// servers are given as LAN addresses: names would need DNS, which the test box may not have
	it('accepts valid channels', async () => {
		expect(await parseChannel(form({ kind: 'email', address: 'Anna@Example.com ' }))).toEqual({ kind: 'email', address: 'anna@example.com' });
		expect(await parseChannel(form({ kind: 'ntfy', server: 'http://10.0.0.5', topic: 'packwise-x1' }))).toEqual({ kind: 'ntfy', server: 'http://10.0.0.5', topic: 'packwise-x1', token: '' });
		expect(await parseChannel(form({ kind: 'gotify', server: 'http://192.168.1.5:8080/', token: 'abc' }))).toEqual({ kind: 'gotify', server: 'http://192.168.1.5:8080', token: 'abc' });
	});

	it('rejects broken input and servers that point at the container itself', async () => {
		expect(await parseChannel(form({ kind: 'email', address: 'nope' }))).toEqual({ error: 'notify.err.address' });
		expect(await parseChannel(form({ kind: 'ntfy', server: 'ftp://x', topic: 'a' }))).toEqual({ error: 'notify.err.server' });
		expect(await parseChannel(form({ kind: 'ntfy', server: 'https://user:pw@10.0.0.5', topic: 'a' }))).toEqual({ error: 'notify.err.server' });
		expect(await parseChannel(form({ kind: 'ntfy', server: 'http://127.0.0.1:2586', topic: 'a' }))).toEqual({ error: 'notify.err.server' });
		expect(await parseChannel(form({ kind: 'gotify', server: 'http://169.254.169.254', token: 'x' }))).toEqual({ error: 'notify.err.server' });
		expect(await parseChannel(form({ kind: 'ntfy', server: 'http://10.0.0.5', topic: 'with space' }))).toEqual({ error: 'notify.err.topic' });
		expect(await parseChannel(form({ kind: 'gotify', server: 'http://10.0.0.5', token: '' }))).toEqual({ error: 'notify.err.token' });
		expect(await parseChannel(form({ kind: 'webpush' }))).toEqual({ error: 'notify.err.kind' });
	});

	it('formats the local date', () => {
		expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});
