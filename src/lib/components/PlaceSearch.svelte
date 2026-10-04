<script lang="ts" module>
	export interface Place {
		name: string;
		admin1: string | null;
		country: string | null;
		country_code: string | null;
		lat: number;
		lon: number;
	}
</script>

<script lang="ts">
	import { countryFlag } from '$lib/data/countries';
	import { useI18n } from '$lib/i18n';
	import CountrySelect from './CountrySelect.svelte';

	let {
		place = $bindable(null),
		country = $bindable(''),
		query = $bindable(''),
		onchange
	}: { place?: Place | null; country?: string; query?: string; onchange?: () => void } = $props();
	const { t } = useI18n();

	let places = $state<Place[]>([]);
	let open = $state(false);
	let active = $state(-1);

	function onKey(e: KeyboardEvent) {
		if (!open || !places.length) return;
		if (e.key === 'ArrowDown') active = (active + 1) % places.length;
		else if (e.key === 'ArrowUp') active = (active - 1 + places.length) % places.length;
		else if (e.key === 'Enter' && active >= 0) choose(places[active]);
		else if (e.key === 'Escape') open = false;
		else return;
		e.preventDefault();
	}
	let timer: ReturnType<typeof setTimeout>;

	function onInput() {
		clearTimeout(timer);
		place = null;
		onchange?.();
		if (query.trim().length < 2) {
			places = [];
			return;
		}
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
				places = (await res.json()).places ?? [];
				active = -1;
				open = true;
			} catch {
				places = [];
			}
		}, 300);
	}

	function choose(p: Place) {
		place = p;
		country = p.country_code ?? '';
		query = [p.name, p.admin1, p.country].filter(Boolean).join(', ');
		open = false;
		onchange?.();
	}
</script>

<div class="field search">
	<label for="place-q">{t('wizard.destination')}</label>
	<input
		id="place-q"
		type="search"
		autocomplete="off"
		placeholder={t('wizard.destination_placeholder')}
		bind:value={query}
		oninput={onInput}
		onkeydown={onKey}
		onfocus={() => (open = places.length > 0)}
		onblur={() => (open = false)}
		role="combobox"
		aria-expanded={open}
		aria-controls="place-list"
		aria-autocomplete="list"
	/>
	{#if open && places.length}
		<ul class="suggestions" id="place-list" role="listbox">
			{#each places as p, i}
				<li role="option" aria-selected={i === active}>
					<!-- mousedown would blur the input and close the list before the click arrives -->
					<button type="button" class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => choose(p)}>
						{countryFlag(p.country_code)} <strong>{p.name}</strong>
						<span class="muted small">{[p.admin1, p.country].filter(Boolean).join(', ')}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
{#if !place}
	<div class="field">
		<label for="country">{t('wizard.country_manual')}</label>
		<CountrySelect bind:value={country} />
	</div>
{/if}

<style>
	.search {
		position: relative;
	}
	.suggestions {
		position: absolute;
		z-index: 10;
		left: 0;
		right: 0;
		list-style: none;
		margin: 0.25rem 0 0;
		padding: 0.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-lg);
	}
	.suggestions button {
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		padding: 0.5rem 0.6rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.suggestions button:hover,
	.suggestions button.active {
		background: var(--surface-2);
	}
</style>
