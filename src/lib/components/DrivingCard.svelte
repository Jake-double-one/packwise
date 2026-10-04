<script lang="ts">
	import { ROAD_TRANSPORT } from '$lib/context';
	import { countryFlag, countryName } from '$lib/data/countries';
	import { DRIVING } from '$lib/data/driving';
	import { useI18n } from '$lib/i18n';
	import type { Trip, TripNote } from '$lib/types';

	let { trip, notes }: { trip: Trip; notes: TripNote[] } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	const rules = $derived(trip.country ? DRIVING[trip.country] : undefined);
	// open by default when the trip goes by car/camper or has a rental car note
	const byCar = $derived(
		(trip.settings.context.transport ?? []).some((v) => ROAD_TRANSPORT.includes(v)) || notes.some((n) => n.kind === 'car')
	);
	const unit = $derived(rules?.unit === 'mph' ? 'mph' : 'km/h');
	const signs = $derived(
		rules
			? [
					{ key: 'urban', value: rules.urban },
					{ key: 'rural', value: rules.rural },
					...(rules.expressway ? [{ key: 'expressway', value: rules.expressway }] : []),
					{ key: 'motorway', value: rules.motorway }
				]
			: []
	);
	const permille = (v: number) => v.toLocaleString(i18n.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const child = $derived.by(() => {
		const c = rules?.childSeat;
		if (!c) return null;
		if (c.age && c.height) return t('drive.child_both', { age: c.age, height: c.height });
		return c.height ? t('drive.child_height', { height: c.height }) : t('drive.child_age', { age: c.age ?? 0 });
	});
</script>

{#snippet body()}
	{#if rules}
		<h3 class="tiny label">{t('drive.speed')} <span class="muted">({unit})</span></h3>
		<div class="signs">
			{#each signs as s (s.key)}
				<div class="sign-wrap">
					<div class="sign" class:none={s.value === 'none'} class:long={s.value.length > 3}>
						{s.value === 'none' ? '–' : s.value}
					</div>
					<div class="tiny">{t(`drive.${s.key}`)}</div>
					{#if s.value === 'none'}<div class="tiny muted">{t('drive.no_limit')}</div>{/if}
				</div>
			{/each}
		</div>
		<dl class="facts">
			<dt>🍷 {t('drive.alcohol')}</dt>
			<dd>
				{t('drive.bac', { value: permille(rules.bac) })}
				{#if rules.bacNovice != null && rules.bacNovice !== rules.bac}<span class="muted small"> · {t('drive.bac_novice', { value: permille(rules.bacNovice) })}</span>{/if}
			</dd>
			{#if child}
				<dt>🧒 {t('drive.child_seat')}</dt>
				<dd>{child}</dd>
			{/if}
		</dl>
		{#if rules.notes.length}
			<h3 class="tiny label">{t('drive.special')}</h3>
			<ul class="notes">
				{#each rules.notes as key (key)}<li>{t(`drive.note.${key}`)}</li>{/each}
			</ul>
		{/if}
		<p class="tiny muted">{t('drive.disclaimer')}</p>
	{/if}
{/snippet}

{#if rules && trip.country}
	<section class="card driving">
		{#if byCar}
			<h2>🚗 {t('drive.title')} · {countryFlag(trip.country)} {countryName(trip.country, i18n.locale)}</h2>
			{@render body()}
		{:else}
			<details>
				<summary>
					<h2>🚗 {t('drive.title')} · {countryFlag(trip.country)} {countryName(trip.country, i18n.locale)}</h2>
					<span class="small muted">{t('drive.collapsed')}</span>
				</summary>
				{@render body()}
			</details>
		{/if}
	</section>
{/if}

<style>
	h2 {
		font-size: 1.05rem;
	}
	summary {
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary h2 {
		margin-bottom: 0.15rem;
	}
	summary h2::after {
		content: ' ▾';
		color: var(--text-3);
	}
	details[open] summary h2::after {
		content: ' ▴';
	}
	details[open] summary span {
		display: none;
	}
	.label {
		font-weight: 700;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0.6rem 0 0.4rem;
	}
	.signs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem 1.1rem;
		margin-bottom: 0.6rem;
	}
	.sign-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		min-width: 4.2rem;
	}
	.sign {
		width: 3.4rem;
		height: 3.4rem;
		border-radius: 50%;
		border: 0.42rem solid #d7262e;
		background: #fff;
		color: #111;
		display: grid;
		place-items: center;
		font-weight: 800;
		font-size: 1.15rem;
		letter-spacing: -0.03em;
		margin-bottom: 0.25rem;
	}
	.sign.long {
		font-size: 0.72rem;
	}
	.sign.none {
		border: 0.15rem solid #111;
		background: repeating-linear-gradient(135deg, #fff 0 0.32rem, #111 0.32rem 0.45rem);
		color: transparent;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.45rem 1rem;
		margin: 0 0 0.3rem;
	}
	dt {
		font-weight: 700;
		color: var(--text-2);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.notes {
		margin: 0 0 0.6rem;
		padding-left: 1.1rem;
	}
	.notes li {
		margin-bottom: 0.3rem;
	}
</style>
