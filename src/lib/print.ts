/**
 * Paper layout for the packing list.
 *
 * On paper the list is printed in two columns and a category card is never split
 * (CSS `break-inside: avoid`, `column-fill: auto`). The browser fills the columns in
 * document order, so a card that does not fit at the bottom of a column is pushed to
 * the next one and leaves a gap behind. `packOrder` reorders the cards for printing:
 * when the next card does not fit, the first later card that does takes the gap.
 * The sizes are estimates in CSS pixels of the print style sheet – if one is off, the
 * browser still prints a correct list, just with a gap.
 */

/** A4 minus the 12 mm page margins (297 mm − 24 mm at 96 dpi). */
export const PAGE_HEIGHT = 1031;
/** one list row (compact or single) */
export const ROW = 35;
/** a row whose text wraps (note, "used up" badge) */
export const ROW_WRAPPED = 60;
/** header of a card (name + traveller columns) incl. its margin */
export const CARD_HEAD = 52;
/** heading of a nested group */
export const SUB_HEAD = 25;
/** card padding, border and the gap below it */
export const CARD_FRAME = 18;
/** trip title and date line above the list */
export const TITLE_BLOCK = 85;
/** the to-do card above the list: frame + heading, plus ROW per to-do */
export const TODO_FRAME = 62;
/** margin for estimation errors – a card planned too tightly would be pushed over */
const SAFETY = 1.02;

/** Estimated height of a card with `rows` plain rows, `wrapped` rows that wrap and `subs` nested group headings. */
export function cardHeight(rows: number, wrapped = 0, subs = 0): number {
	return (CARD_HEAD + CARD_FRAME + rows * ROW + wrapped * ROW_WRAPPED + subs * SUB_HEAD) * SAFETY;
}

/** Height available in a column: the first page starts below the title and the to-dos. */
export function columnCapacity(column: number, headerHeight: number, pageHeight = PAGE_HEIGHT): number {
	return column < 2 ? Math.max(0, pageHeight - headerHeight) : pageHeight;
}

/**
 * Orders cards so that every column is filled as far as possible without splitting a card.
 * Keeps the document order where it can: a card is only deferred when it does not fit and a
 * later, smaller one does. A card taller than a whole column is printed where it comes and
 * split by the browser.
 */
export function packOrder<T>(cards: readonly T[], size: (card: T) => number, capacity: (column: number) => number): T[] {
	const left = [...cards];
	const out: T[] = [];
	let column = 0;
	let free = capacity(0);
	let guard = 0;
	while (left.length && guard++ < 10_000) {
		const i = left.findIndex((c) => size(c) <= free);
		if (i >= 0) {
			const [card] = left.splice(i, 1);
			out.push(card);
			free -= size(card);
			continue;
		}
		// nothing fits in what is left of this column – start the next one
		if (free <= 0 || free < capacity(column)) {
			column++;
			free = capacity(column);
			continue;
		}
		// a fresh column and still nothing fits: the first card is taller than a whole column.
		// The browser splits it; it ends somewhere in a later column
		const first = left.shift()!;
		out.push(first);
		const columns = Math.max(1, Math.ceil(size(first) / free));
		const rest = size(first) - (columns - 1) * free;
		column += columns - 1;
		free = Math.max(0, free - rest);
	}
	return out.concat(left);
}
