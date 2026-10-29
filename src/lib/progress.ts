import type { Section, TripPhase } from './types';

export interface Count {
	done: number;
	total: number;
}

/** Everything the progress of a trip is made of – each part has its own invisible bar. */
export interface Counts {
	/** items packed (packing phase) */
	items: Count;
	/** items back in the bag – consumables are used up and don't count (return phase) */
	returnItems: Count;
	packTodos: Count;
	returnTodos: Count;
}

const add = (a: Count, b: Count): Count => ({ done: a.done + b.done, total: a.total + b.total });
const none: Count = { done: 0, total: 0 };

/**
 * The one visible progress of a trip: the list of the current phase plus its to-dos (when
 * they are switched on). A part the household folded away is left out, so a return list
 * nobody uses never shows as "not done".
 */
export function overallProgress(phase: TripPhase, todosEnabled: boolean, collapsed: readonly Section[], c: Counts): Count & { withTodos: boolean } {
	const folded = (s: Section) => collapsed.includes(s);
	const returning = phase === 'return';
	const items = returning ? (folded('return_items') ? none : c.returnItems) : c.items;
	const todoSection: Section = returning ? 'return_todos' : 'pack_todos';
	const todos = todosEnabled && !folded(todoSection) ? (returning ? c.returnTodos : c.packTodos) : none;
	// "x of y done" instead of "packed" once to-dos are part of the number
	return { ...add(items, todos), withTodos: todos.total > 0 };
}
