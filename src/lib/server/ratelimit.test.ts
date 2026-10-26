import { beforeEach, describe, expect, it } from 'vitest';
import { rateLimit, resetRateLimits } from './auth';

describe('rateLimit', () => {
	beforeEach(() => resetRateLimits());

	it('blocks after max attempts', () => {
		for (let i = 0; i < 3; i++) expect(rateLimit('login:a', 3)).toBe(true);
		expect(rateLimit('login:a', 3)).toBe(false);
	});

	it('a flood of other keys does not lift a block', () => {
		for (let i = 0; i < 4; i++) rateLimit('login:victim@x.test', 3);
		expect(rateLimit('login:victim@x.test', 3)).toBe(false);
		for (let i = 0; i < 60_000; i++) rateLimit(`login:${i}@x.test`, 3);
		expect(rateLimit('login:victim@x.test', 3)).toBe(false);
	});

	it('with only blocked keys the table stays bounded and the newest blocks survive', () => {
		for (let i = 0; i < 55_000; i++) for (let n = 0; n < 2; n++) rateLimit(`login:${i}`, 1);
		expect(rateLimit('login:54999', 1)).toBe(false);
		expect(rateLimit('login:54998', 1)).toBe(false);
		// the oldest were evicted: a fresh attempt from them counts as the first again
		expect(rateLimit('login:0', 1)).toBe(true);
	});
});
