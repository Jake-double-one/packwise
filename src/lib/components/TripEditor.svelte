<script lang="ts">
	import { countryName } from '$lib/data/countries';
	import { useI18n } from '$lib/i18n';
	import type { Trip } from '$lib/types';
	import PlaceSearch, { type Place } from './PlaceSearch.svelte';
	import Sheet from './Sheet.svelte';

	let { trip, onsave, onclose }: { trip: Trip; onsave: (patch: Record<string, unknown>) => Promise<unknown>; onclose: () => void } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	// initial values only – the sheet is recreated each time it opens
	const init = () => ({ ...trip });
	const start0 = init();
	let name = $state(start0.name);
	let start = $state(start0.start_date);
	let end = $state(start0.end_date);
	let query = $state(start0.destination);
	let country = $state(start0.country ?? '');
	let place = $state<Place | null>(null);
	let placeTouched = $state(false);
	let saving = $state(false);

	async function save() {
		saving = true;
		const patch: Record<string, unknown> = { op: 'editTrip', name, start, end };
		if (placeTouched || country !== (start0.country ?? '')) {
			// a chosen place, else typed text, else (only the country was switched) the country's name
			patch.destination = place
				? [place.name, place.admin1].filter(Boolean).join(', ')
				: placeTouched && query.trim()
					? query.trim()
					: country
						? countryName(country, i18n.locale)
						: '';
			patch.country = country || null;
			patch.lat = place?.lat ?? null;
			patch.lon = place?.lon ?? null;
		}
		await onsave(patch);
		saving = false;
		onclose();
	}
</script>

<Sheet title={t('trip.edit_trip')} {onclose}>
	<div class="field">
		<label for="tname">{t('wizard.name')}</label>
		<input id="tname" bind:value={name} />
	</div>
	<PlaceSearch bind:place bind:country bind:query onchange={() => (placeTouched = true)} />
	{#if !placeTouched && trip.lat != null}
		<p class="tiny muted">📍 {t('trip.edit_place_kept')}</p>
	{/if}
	<div class="grid-2">
		<div class="field">
			<label for="tstart">{t('wizard.start')}</label>
			<input id="tstart" type="date" bind:value={start} onchange={() => end < start && (end = start)} />
		</div>
		<div class="field">
			<label for="tend">{t('wizard.end')}</label>
			<input id="tend" type="date" bind:value={end} min={start} />
		</div>
	</div>
	<p class="small muted">ℹ️ {t('trip.edit_hint')}</p>

	{#snippet footer()}
		<div class="row between">
			<button class="btn" onclick={onclose}>{t('common.back')}</button>
			<button class="btn primary" onclick={save} disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
		</div>
	{/snippet}
</Sheet>
