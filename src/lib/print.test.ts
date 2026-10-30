import { describe, expect, it } from 'vitest';
import { cardHeight, columnCapacity, packOrder, PAGE_HEIGHT } from './print';

const sizes: Record<string, number> = { A: 300, B: 750, C: 350, D: 250, E: 200, F: 120 };
const size = (k: string) => sizes[k];

describe('packOrder', () => {
	it('keeps the order when everything fits in sequence', () => {
		expect(packOrder(['A', 'D', 'E'], size, () => 1000)).toEqual(['A', 'D', 'E']);
	});

	it('fills a gap with the first later card that fits', () => {
		// column 1000: A (300) – B (750) does not fit → C (350) takes the gap, then D (250)
		expect(packOrder(['A', 'B', 'C', 'D', 'E', 'F'], size, () => 1000)).toEqual(['A', 'C', 'D', 'B', 'E', 'F']);
	});

	it('starts a new column when nothing fits any more', () => {
		expect(packOrder(['B', 'C', 'B'], size, () => 1000)).toEqual(['B', 'C', 'B']);
	});

	it('lets the browser split a card taller than a column and goes on after it', () => {
		const out = packOrder(['X', 'F', 'E'], (k) => (k === 'X' ? 1500 : size(k)), () => 1000);
		expect(out).toEqual(['F', 'E', 'X']); // the small ones fill the first column, the big one follows split
	});

	it('never loses or duplicates cards', () => {
		const cards = Array.from({ length: 40 }, (_, i) => `c${i}`);
		const out = packOrder(cards, (k) => 50 + ((+k.slice(1) * 97) % 600), (c) => (c < 2 ? 600 : 1000));
		expect([...out].sort()).toEqual([...cards].sort());
	});

	it('first page columns are shorter by the header, later ones full height', () => {
		expect(columnCapacity(0, 200)).toBe(PAGE_HEIGHT - 200);
		expect(columnCapacity(1, 200)).toBe(PAGE_HEIGHT - 200);
		expect(columnCapacity(2, 200)).toBe(PAGE_HEIGHT);
	});

	it('card height grows with rows, wrapped rows and nested headings', () => {
		expect(cardHeight(5)).toBeLessThan(cardHeight(5, 1));
		expect(cardHeight(5)).toBeLessThan(cardHeight(5, 0, 1));
		expect(cardHeight(0)).toBeGreaterThan(0);
	});
});
