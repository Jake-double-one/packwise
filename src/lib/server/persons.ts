import { all, get, run, tx } from './db';
import { messagesFor } from './i18n';
import { createBag, createPerson } from './repo';
import { translate } from '$lib/i18n';
import type { BagKind, PersonKind } from '$lib/types';

/**
 * Personal bags: adults and children get a suitcase and a carry-on in their
 * colour, babies only a suitcase, pets none. The bags belong to the person
 * (renamed / recoloured with them, deleted with them).
 */
const BAGS_FOR: Record<PersonKind, BagKind[]> = {
	adult: ['suitcase', 'carryon'],
	child: ['suitcase', 'carryon'],
	baby: ['suitcase'],
	pet: []
};
const ICON: Record<BagKind, string> = { suitcase: '🧳', carryon: '🎒', other: '🧳' };

function bagName(kind: BagKind, person: string, locale: string) {
	return translate(messagesFor(locale), kind === 'carryon' ? 'bag.carryon_of' : 'bag.suitcase_of', { name: person });
}

/** Creates the missing personal bags of a person; returns ids by kind. */
export function createPersonBags(householdId: string, personId: string, locale: string): Partial<Record<BagKind, string>> {
	const p = get<{ name: string; kind: PersonKind; color: string }>('SELECT name, kind, color FROM persons WHERE id = ? AND household_id = ?', personId, householdId);
	if (!p) return {};
	const existing = all<{ id: string; kind: BagKind }>('SELECT id, kind FROM bags WHERE person_id = ?', personId);
	const ids: Partial<Record<BagKind, string>> = Object.fromEntries(existing.map((b) => [b.kind, b.id]));
	for (const kind of BAGS_FOR[p.kind] ?? []) {
		ids[kind] ??= createBag(householdId, bagName(kind, p.name, locale), p.color, ICON[kind], personId, kind);
	}
	return ids;
}

export function addPersonWithBags(householdId: string, name: string, kind: PersonKind, color: string, userId: string | null, locale: string) {
	return tx(() => {
		const personId = createPerson(householdId, name, kind, color, userId);
		return { personId, bags: createPersonBags(householdId, personId, locale) };
	});
}

/** After a person was renamed / recoloured: follow with their bags (custom bag names are kept). */
export function syncPersonBags(householdId: string, personId: string, oldName: string, locale: string) {
	const p = get<{ name: string; color: string }>('SELECT name, color FROM persons WHERE id = ? AND household_id = ?', personId, householdId);
	if (!p) return;
	for (const b of all<{ id: string; name: string; kind: BagKind }>('SELECT id, name, kind FROM bags WHERE person_id = ?', personId)) {
		const generated = b.name === bagName(b.kind, oldName, locale);
		run('UPDATE bags SET color = ?, name = ? WHERE id = ?', p.color, generated ? bagName(b.kind, p.name, locale) : b.name, b.id);
	}
}
