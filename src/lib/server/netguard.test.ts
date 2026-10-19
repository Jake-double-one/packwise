import { describe, expect, it } from 'vitest';
import { hostAllowed, isBlockedHostname, isBlockedIp } from './netguard';

describe('netguard', () => {
	it('blocks the container itself, link-local and nothing', () => {
		for (const ip of ['127.0.0.1', '127.1.2.3', '0.0.0.0', '169.254.169.254', '::1', '::', '[::1]', '::ffff:127.0.0.1', 'fe80::1', 'FE80::abcd'])
			expect(isBlockedIp(ip), ip).toBe(true);
	});

	it('allows public and private LAN addresses', () => {
		for (const ip of ['8.8.8.8', '192.168.1.5', '10.0.0.2', '172.16.0.9', '2001:db8::1', 'fd00::1', '::ffff:192.168.1.5'])
			expect(isBlockedIp(ip), ip).toBe(false);
	});

	it('blocks localhost names', () => {
		expect(isBlockedHostname('localhost')).toBe(true);
		expect(isBlockedHostname('foo.localhost.')).toBe(true);
		expect(isBlockedHostname('ntfy.sh')).toBe(false);
	});

	it('checks URLs by their host', async () => {
		expect(await hostAllowed('http://127.0.0.1:8080/x')).toBe(false);
		expect(await hostAllowed('https://[::1]/')).toBe(false);
		expect(await hostAllowed('http://169.254.169.254/latest/meta-data')).toBe(false);
		expect(await hostAllowed('http://localhost:2586')).toBe(false);
		expect(await hostAllowed('http://192.168.1.20:8080')).toBe(true);
		expect(await hostAllowed('not a url')).toBe(false);
	});
});
