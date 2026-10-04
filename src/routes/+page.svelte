<script lang="ts">
	import { useI18n, formatRange } from '$lib/i18n';
	import { countryFlag } from '$lib/data/countries';
	import { weatherIcon } from '$lib/weather';
	import Ring from '$lib/components/Ring.svelte';

	let { data } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const today = new Date().toISOString().slice(0, 10);
	const upcoming = $derived(data.trips.filter((tr) => tr.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)));
	const past = $derived(data.trips.filter((tr) => tr.end_date < today));

	function countdown(start: string, end: string) {
		const days = Math.round((Date.parse(start) - Date.parse(today)) / 86_400_000);
		if (days > 0) return t('trips.in_days', { count: days });
		if (end >= today) return t('trips.ongoing');
		return '';
	}
</script>

<svelte:head><title>{t('nav.trips')} · Packwise</title></svelte:head>

<div class="container">
	<div class="row between head">
		<div>
			<h1>{t('trips.title')}</h1>
			<p class="muted small">{data.household?.name}</p>
		</div>
		<a class="btn primary" href="/trips/new">✨ {t('trips.new')}</a>
	</div>

	{#if data.trips.length === 0}
		<div class="card empty">
			<div class="big">🧳</div>
			<h2>{t('trips.empty_title')}</h2>
			<p>{t('trips.empty_text')}</p>
			<div class="row" style="justify-content:center">
				<a class="btn primary" href="/trips/new">✨ {t('trips.new')}</a>
				<a class="btn" href="/template">📋 {t('nav.template')}</a>
			</div>
		</div>
	{/if}

	{#snippet tripCard(tr: (typeof data.trips)[number])}
		<a class="trip card" href="/t/{tr.id}">
			<div class="flag">{countryFlag(tr.country)}</div>
			<div class="grow info">
				<strong>{tr.name}</strong>
				<div class="small muted">{tr.destination ? `${tr.destination} · ` : ''}{formatRange(tr.start_date, tr.end_date, i18n.locale)}</div>
				<div class="row tiny meta">
					{#if countdown(tr.start_date, tr.end_date)}<span class="badge">{countdown(tr.start_date, tr.end_date)}</span>{/if}
					{#if tr.weather}<span>{weatherIcon(tr.weather)} {Math.round(tr.weather.avgMax)}° / {Math.round(tr.weather.avgMin)}°</span>{/if}
					<span class="muted">{t('trips.items_progress', { done: tr.done, total: tr.total })}</span>
				</div>
			</div>
			<Ring value={tr.done} total={tr.total} />
		</a>
	{/snippet}

	{#if upcoming.length}
		<h2 class="section">{t('trips.upcoming')}</h2>
		<div class="stack">{#each upcoming as tr (tr.id)}{@render tripCard(tr)}{/each}</div>
	{/if}
	{#if past.length}
		<h2 class="section">{t('trips.past')}</h2>
		<div class="stack past">{#each past as tr (tr.id)}{@render tripCard(tr)}{/each}</div>
	{/if}
</div>

<style>
	.head {
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}
	.section {
		margin: 1.5rem 0 0.6rem;
		font-size: 1rem;
		color: var(--text-2);
	}
	.trip {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		color: var(--text);
		text-decoration: none !important;
		transition: transform 0.1s, border-color 0.15s;
		margin: 0 !important;
	}
	.trip:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}
	.flag {
		font-size: 2rem;
	}
	.info {
		min-width: 0;
	}
	.meta {
		gap: 0.6rem;
		margin-top: 0.2rem;
		flex-wrap: wrap;
	}
	.past .trip {
		opacity: 0.75;
	}
</style>
