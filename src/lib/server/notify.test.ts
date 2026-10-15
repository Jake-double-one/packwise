import { describe, expect, it } from 'vitest';
import { parseChannel } from './notify';
import { localDate } from './reminders';

const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('notification channels', () => {
	it('accepts valid channels', () => {
		expect(parseChannel(form({ kind: 'email', address: 'Anna@Example.com ' }))).toEqual({ kind: 'email', address: 'anna@example.com' });
		expect(parseChannel(form({ kind: 'ntfy', server: '', topic: 'packwise-x1' }))).toEqual({ kind: 'ntfy', server: 'https://ntfy.sh', topic: 'packwise-x1', token: '' });
		expect(parseChannel(form({ kind: 'gotify', server: 'http://192.168.1.5:8080/', token: 'abc' }))).toEqual({ kind: 'gotify', server: 'http://192.168.1.5:8080', token: 'abc' });
	});

	it('rejects broken input', () => {
		expect(parseChannel(form({ kind: 'email', address: 'nope' }))).toEqual({ error: 'notify.err.address' });
		expect(parseChannel(form({ kind: 'ntfy', server: 'ftp://x', topic: 'a' }))).toEqual({ error: 'notify.err.server' });
		expect(parseChannel(form({ kind: 'ntfy', server: 'https://user:pw@ntfy.sh', topic: 'a' }))).toEqual({ error: 'notify.err.server' });
		expect(parseChannel(form({ kind: 'ntfy', topic: 'with space' }))).toEqual({ error: 'notify.err.topic' });
		expect(parseChannel(form({ kind: 'gotify', server: 'https://g.example.com', token: '' }))).toEqual({ error: 'notify.err.token' });
		expect(parseChannel(form({ kind: 'webpush' }))).toEqual({ error: 'notify.err.kind' });
	});

	it('formats the local date', () => {
		expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});
