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
});
