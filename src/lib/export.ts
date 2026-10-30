import { countryFlag } from './data/countries';
import { todoAnchor, todoDue } from './generate';
import { formatDate, formatRange } from './i18n/index';
import { childrenMap } from './tree';
import type { Person, Trip, TripItem, TripTodo } from './types';

type T = (key: string, params?: Record<string, string | number>) => string;

export interface MarkdownInput {
	trip: Pick<Trip, 'name' | 'destination' | 'country' | 'start_date' | 'end_date' | 'phase' | 'todos_enabled'>;
	items: TripItem[];
	todos: TripTodo[];
	persons: Pick<Person, 'id' | 'name'>[];
	locale: string;
	t: T;
}

/**
 * The trip as Markdown text, exactly as it stands: the to-dos and the list of the current
 * phase with quantities, ticks, consumables and who an item belongs to. Meant for sharing
 * (messenger, mail) and keeping; the importer reads the same shape (headings → categories,
 * "3x Socks" → quantity, ticks are ignored).
 */
export function tripMarkdown({ trip, items, todos, persons, locale, t }: MarkdownInput): string {
	const returning = trip.phase === 'return';
	const who = new Map(persons.map((p) => [p.id, p.name]));
	const out: string[] = [];
	const flag = countryFlag(trip.country);
	out.push(`# ${flag ? `${flag} ` : ''}${trip.name}`.trim());
	out.push([trip.destination, formatRange(trip.start_date, trip.end_date, locale)].filter(Boolean).join(' · '));

	// to-dos of this phase, soonest due last (as on screen)
	const phaseTodos = todos.filter((td) => (td.phase === 'return') === returning).sort((a, b) => b.days_before - a.days_before || a.name.localeCompare(b.name));
	if (trip.todos_enabled && phaseTodos.length) {
		out.push('', `## ${returning ? '🏠' : '✅'} ${t(returning ? 'todo.title_return' : 'todo.title')}`);
		const anchor = todoAnchor(trip, returning ? 'return' : 'pack');
		for (const td of phaseTodos) {
			const due = formatDate(todoDue(anchor, td.days_before), locale, { weekday: 'short', day: 'numeric', month: 'short' });
			out.push(`- [${td.done ? 'x' : ' '}] ${td.name} · ${due}${suffix(who.get(td.person_id ?? ''), td.note)}`);
		}
	}

	out.push('', `## ${returning ? '🏠' : '🧳'} ${t(returning ? 'trip.phase_return' : 'trip.list_title')}`);
	const tree = childrenMap(items.filter((i) => i.kind === 'group' || !i.not_needed));
	const line = (it: TripItem) => {
		if (returning && it.consumable) return `- 🧴 ${it.name} · ${t('trip.used_up')}`;
		const done = returning ? it.returned : it.checked;
		const qty = it.qty > 1 ? `${it.qty}x ` : '';
		return `- [${done ? 'x' : ' '}] ${qty}${it.name}${it.needs_power ? ' ⚡' : ''}${suffix(who.get(it.person_id ?? ''), it.note)}`;
	};
	const hasItems = (id: string): boolean => (tree.get(id) ?? []).some((c) => (c.kind === 'item' ? true : hasItems(c.id)));
	const walk = (parent: string | null, depth: number) => {
		const children = tree.get(parent) ?? [];
		// loose items first – a line after a heading would read as part of that category
		for (const c of children) if (c.kind === 'item') out.push(line(c));
		for (const c of children) {
			if (c.kind !== 'group' || !hasItems(c.id)) continue;
			out.push('', `${'#'.repeat(Math.min(6, depth + 3))} ${c.name}`);
			walk(c.id, depth + 1);
		}
	};
	walk(null, 0);
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function suffix(person: string | undefined, note: string): string {
	return `${person ? ` · ${person}` : ''}${note.trim() ? ` – ${note.trim()}` : ''}`;
}

/** File name for a downloaded export. */
export function exportFileName(name: string, ext: string): string {
	const base = name
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.slice(0, 60);
	return `${base || 'packwise'}.${ext}`;
}
