import { describe, expect, it } from 'vitest';
import { parseJson, parseText, toTree } from './importer';

const simplify = (lines: ReturnType<typeof parseText>) => lines.map((l) => `${'  '.repeat(l.level)}${l.kind === 'group' ? '#' : '-'}${l.name}${l.qty > 1 ? `×${l.qty}` : ''}`);

describe('parseText', () => {
	it('nests by indentation and detects quantities', () => {
		const lines = parseText('Clothing\n  T-Shirts\n  3x Socks\n  Jacket (2)\nToiletries\n\tToothbrush');
		expect(simplify(lines)).toEqual(['#Clothing', '  -T-Shirts', '  -Socks×3', '  -Jacket×2', '#Toiletries', '  -Toothbrush']);
	});

	it('treats colon lines as categories, even without indentation', () => {
		const lines = parseText('Kleidung:\n- Hose\n- Pulli\nBad:\n- Shampoo');
		expect(simplify(lines)).toEqual(['#Kleidung', '  -Hose', '  -Pulli', '#Bad', '  -Shampoo']);
	});

	it('understands markdown headings and checkboxes', () => {
		const lines = parseText('# Urlaub\n## Kleidung\n- [ ] Socken x5\n- [x] Hose\n## Technik\n* Ladekabel');
		expect(simplify(lines)).toEqual(['#Urlaub', '  #Kleidung', '    -Socken×5', '    -Hose', '  #Technik', '    -Ladekabel']);
	});

	it('limits groups to three levels', () => {
		const lines = parseText('A\n  B\n    C\n      D\n        E');
		expect(lines.filter((l) => l.kind === 'group').length).toBeLessThanOrEqual(3);
		expect(Math.max(...lines.map((l) => l.level))).toBeLessThanOrEqual(3);
	});

	it('builds a tree from selected lines only', () => {
		const lines = parseText('Clothing\n  Socks\n  Hat\nEmpty\n  Gone');
		lines.find((l) => l.name === 'Hat')!.selected = false;
		lines.find((l) => l.name === 'Gone')!.selected = false;
		const tree = toTree(lines);
		expect(tree).toHaveLength(1);
		expect(tree[0].children.map((c) => c.name)).toEqual(['Socks']);
	});
});

describe('parseJson', () => {
	it('reads Packwise exports', () => {
		const lines = parseJson(JSON.stringify({ packwise: 1, template: [{ name: 'A', kind: 'group', children: [{ name: 'B', kind: 'item', qty: 2, children: [] }] }] }));
		expect(lines?.map((l) => [l.name, l.level, l.kind])).toEqual([
			['A', 0, 'group'],
			['B', 1, 'item']
		]);
	});
	it('returns null for other JSON', () => expect(parseJson('{"foo":1}')).toBeNull());
});
