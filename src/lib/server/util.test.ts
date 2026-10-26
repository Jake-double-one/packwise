import { describe, expect, it } from 'vitest';
import { safeNext } from './util';

describe('safeNext', () => {
	it('keeps paths of this site', () => {
		expect(safeNext('/t/abc?tab=info#x')).toBe('/t/abc?tab=info#x');
		expect(safeNext('/settings')).toBe('/settings');
	});

	it('refuses anything that leads to another site', () => {
		for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', 'evil', '', null])
			expect(safeNext(next), String(next)).toBe('/');
	});
});
