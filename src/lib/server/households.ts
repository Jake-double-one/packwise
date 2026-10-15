import { config } from './config';
import { tx } from './db';
import { addPersonWithBags } from './persons';
import { createBag, createHousehold, seedTemplate, seedTodos } from './repo';
import { starterSharedBag, starterTemplate, starterTodos } from '$lib/data/starter';

/**
 * A new household for a user: they become its creator (accounts mode) and a
 * traveller with their own suitcase and carry-on; plus a shared bag and –
 * optionally – the starter template and to-dos.
 */
export function createOwnHousehold(
	name: string,
	homeCountry: string | null,
	user: { id: string; name: string; color: string } | null,
	locale: string,
	starter: boolean
): string {
	return tx(() => {
		const hh = createHousehold(name, homeCountry, user && config.authMode === 'accounts' ? user.id : null);
		const own: { suitcase?: string | null; carryon?: string | null } = user ? addPersonWithBags(hh, user.name, 'adult', user.color, user.id, locale).bags : {};
		const shared = starterSharedBag(locale);
		const sharedBag = createBag(hh, shared.name, shared.color, shared.icon);
		if (starter) {
			const bags = [own.suitcase ?? sharedBag, sharedBag, own.carryon ?? sharedBag];
			seedTemplate(hh, starterTemplate(locale), bags);
			seedTodos(hh, starterTodos(locale));
		}
		return hh;
	});
}
