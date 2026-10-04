import { MAX_GROUP_DEPTH } from './tree';

/**
 * Turns free text (plain lists, Markdown, OneNote / Word pastes, printed
 * checklists) into a flat list of lines with levels, which the review step
 * lets the user correct before anything is written.
 */
export interface ImportLine {
	uid: number;
	name: string;
	kind: 'group' | 'item';
	level: number; // 0-based nesting level
	qty: number;
	selected: boolean;
	exists?: boolean;
}

const BULLET = /^(?:[-*+•◦▪▫·‣⁃–—>]|\[[ xX✓✔]?\]|[☐☑☒✓✔✗]|\d{1,3}[.)]|[a-zA-Z][.)](?=\s))\s*/;
const QTY_PREFIX = /^(\d{1,3})\s*[x×]\s+(.+)$/i;
const QTY_SUFFIX = /^(.+?)\s*(?:[x×]\s*(\d{1,3})|\((\d{1,3})\))$/i;

function parseQty(text: string): { name: string; qty: number } {
	let m = text.match(QTY_PREFIX);
	if (m) return { name: m[2].trim(), qty: +m[1] };
	m = text.match(QTY_SUFFIX);
	if (m) return { name: m[1].trim(), qty: +(m[2] ?? m[3]) };
	return { name: text, qty: 1 };
}

function indentWidth(raw: string): number {
	let w = 0;
	for (const ch of raw) {
		if (ch === ' ' || ch === ' ') w += 1;
		else if (ch === '\t') w += 4;
		else break;
	}
	return w;
}

export function parseText(text: string): ImportLine[] {
	const raw = text.replace(/\r\n?/g, '\n').split('\n');
	interface Pre {
		indent: number;
		heading: number;
		colon: boolean;
		text: string;
	}
	const pre: Pre[] = [];
	for (const line of raw) {
		if (!line.trim()) continue;
		const indent = indentWidth(line);
		let text = line.trim();
		const h = text.match(/^(#{1,6})\s+(.*)$/);
		const heading = h ? h[1].length : 0;
		if (h) text = h[2];
		for (let i = 0; i < 3 && BULLET.test(text); i++) text = text.replace(BULLET, '');
		text = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').trim();
		const colon = /[:：]$/.test(text);
		if (colon) text = text.replace(/[:：]+$/, '').trim();
		if (!text) continue;
		pre.push({ indent, heading, colon, text });
	}

	// Headings define levels by their own depth; indented lines nest below the last heading.
	const out: ImportLine[] = [];
	const stack: number[] = []; // indentation widths of open list levels
	let headingLevel = -1; // level of the latest heading
	const minHeading = Math.min(...pre.filter((p) => p.heading).map((p) => p.heading), 99);
	let uid = 0;

	for (const p of pre) {
		let level: number;
		if (p.heading) {
			level = p.heading - minHeading;
			headingLevel = level;
			stack.length = 0;
		} else {
			while (stack.length && stack[stack.length - 1] > p.indent) stack.pop();
			if (!stack.length || stack[stack.length - 1] < p.indent) stack.push(p.indent);
			level = headingLevel + stack.length;
		}
		const { name, qty } = parseQty(p.text);
		out.push({ uid: uid++, name, qty, level: Math.max(0, level), kind: p.heading || p.colon ? 'group' : 'item', selected: true });
	}

	// a line followed by a deeper line is a group
	for (let i = 0; i < out.length - 1; i++) {
		if (out[i + 1].level > out[i].level) out[i].kind = 'group';
	}
	// colon-groups without indentation: following plain lines at the same level belong to them
	for (let i = 0; i < out.length; i++) {
		if (out[i].kind !== 'group' || pre[i].heading) continue;
		const base = out[i].level;
		for (let j = i + 1; j < out.length && out[j].level === base && out[j].kind === 'item' && !pre[j].heading; j++) {
			out[j].level = base + 1;
		}
	}
	return normalise(out);
}

/** Keeps levels consistent: no jumps by more than one, groups ≤ MAX_GROUP_DEPTH, items under groups. */
export function normalise(lines: ImportLine[]): ImportLine[] {
	const result: ImportLine[] = [];
	const groupAt: (ImportLine | null)[] = [];
	for (const l of lines) {
		let level = Math.max(0, l.level);
		// cannot be deeper than one below the deepest open group
		let maxLevel = 0;
		for (let d = groupAt.length - 1; d >= 0; d--) {
			if (groupAt[d]) {
				maxLevel = d + 1;
				break;
			}
		}
		level = Math.min(level, maxLevel);
		const line = { ...l, level };
		if (line.kind === 'group' && level >= MAX_GROUP_DEPTH) line.kind = 'item';
		groupAt.length = level;
		if (line.kind === 'group') groupAt[level] = line;
		result.push(line);
	}
	return result;
}

/** Converts pasted HTML (OneNote, Word, Google Docs) into indented text. */
export function htmlToText(html: string): string {
	if (typeof DOMParser === 'undefined') return '';
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const lines: string[] = [];
	const walk = (el: Element, depth: number) => {
		for (const child of Array.from(el.children)) {
			const tag = child.tagName.toLowerCase();
			if (tag === 'ul' || tag === 'ol') walk(child, depth + 1);
			else if (tag === 'li') {
				const own = Array.from(child.childNodes)
					.filter((n) => !(n instanceof Element && ['ul', 'ol'].includes(n.tagName.toLowerCase())))
					.map((n) => n.textContent ?? '')
					.join('')
					.trim();
				if (own) lines.push(`${'  '.repeat(Math.max(0, depth - 1))}- ${own}`);
				walk(child, depth);
			} else if (/^h[1-6]$/.test(tag)) {
				const text = child.textContent?.trim();
				if (text) lines.push(`${'#'.repeat(+tag[1])} ${text}`);
			} else if (tag === 'p' || tag === 'div' || tag === 'span') {
				// OneNote uses margin-left for indentation of plain paragraphs
				const margin = parseFloat((child as HTMLElement).style?.marginLeft || '0');
				const extra = margin > 0 ? Math.round(margin / 36) : 0;
				const hasBlocks = child.querySelector('p, div, ul, ol, h1, h2, h3, li');
				if (hasBlocks) walk(child, depth);
				else {
					const text = child.textContent?.trim();
					if (text) lines.push(`${'  '.repeat(depth + extra)}${text}`);
				}
			} else if (tag === 'table') {
				child.querySelectorAll('tr').forEach((tr) => {
					const text = tr.textContent?.trim();
					if (text) lines.push(`${'  '.repeat(depth)}${text}`);
				});
			} else walk(child, depth);
		}
	};
	walk(doc.body, 0);
	return lines.join('\n');
}

export interface ImportTreeNode {
	name: string;
	kind: 'group' | 'item';
	qty: number;
	children: ImportTreeNode[];
}

/** Builds the tree of selected lines (unselected groups keep their selected children). */
export function toTree(lines: ImportLine[]): ImportTreeNode[] {
	const roots: ImportTreeNode[] = [];
	const stack: { level: number; node: ImportTreeNode | null }[] = [];
	for (const l of normalise(lines)) {
		while (stack.length && stack[stack.length - 1].level >= l.level) stack.pop();
		const parent = [...stack].reverse().find((s) => s.node)?.node ?? null;
		const node: ImportTreeNode | null = l.selected ? { name: l.name, kind: l.kind, qty: l.qty, children: [] } : null;
		if (node) (parent ? parent.children : roots).push(node);
		if (l.kind === 'group') stack.push({ level: l.level, node });
	}
	const prune = (nodes: ImportTreeNode[]): ImportTreeNode[] =>
		nodes
			.map((n) => ({ ...n, children: prune(n.children) }))
			.filter((n) => n.kind === 'item' || n.children.length > 0);
	return prune(roots);
}

/** Packwise JSON export → lines (so the same review step applies). */
export function parseJson(text: string): ImportLine[] | null {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return null;
	}
	const tree = (data as { template?: ImportTreeNode[] })?.template;
	if (!Array.isArray(tree)) return null;
	const out: ImportLine[] = [];
	let uid = 0;
	const walk = (nodes: ImportTreeNode[], level: number) => {
		for (const n of nodes) {
			if (!n || typeof n.name !== 'string') continue;
			out.push({ uid: uid++, name: n.name, kind: n.kind === 'group' ? 'group' : 'item', qty: Number(n.qty) || 1, level, selected: true });
			if (Array.isArray(n.children)) walk(n.children, level + 1);
		}
	};
	walk(tree, 0);
	return normalise(out);
}
