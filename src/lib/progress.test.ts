import { describe, expect, it } from 'vitest';
import { overallProgress, type Counts } from './progress';

const counts: Counts = {
	items: { done: 30, total: 40 },
	returnItems: { done: 5, total: 35 },
	packTodos: { done: 2, total: 6 },
	returnTodos: { done: 0, total: 3 }
};

describe('overallProgress', () => {
	it('packing: items plus to-dos when they are on', () => {
		expect(overallProgress('pack', true, [], counts)).toEqual({ done: 32, total: 46, withTodos: true });
		expect(overallProgress('pack', false, [], counts)).toEqual({ done: 30, total: 40, withTodos: false });
	});

	it('folded to-dos are left out', () => {
		expect(overallProgress('pack', true, ['pack_todos'], counts)).toMatchObject({ done: 30, total: 40, withTodos: false });
	});

	it('return: items back in the bag plus the to-dos before heading home', () => {
		expect(overallProgress('return', true, [], counts)).toMatchObject({ done: 5, total: 38, withTodos: true });
		expect(overallProgress('return', true, ['return_todos'], counts)).toMatchObject({ done: 5, total: 35, withTodos: false });
		expect(overallProgress('return', true, ['return_items'], counts)).toMatchObject({ done: 0, total: 3 });
		expect(overallProgress('return', true, ['return_items', 'return_todos'], counts)).toMatchObject({ done: 0, total: 0 });
	});

	it('the packing phase ignores the folded return parts', () => {
		expect(overallProgress('pack', true, ['return_items', 'return_todos'], counts)).toMatchObject({ done: 32, total: 46 });
	});
});
