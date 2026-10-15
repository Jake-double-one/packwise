<script lang="ts">
	import { useI18n, formatRange } from '$lib/i18n';
	import { countryFlag } from '$lib/data/countries';
	import { weatherIcon } from '$lib/weather';
	import Ring from '$lib/components/Ring.svelte';

	let { data } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const today = new Date().toISOString().slice(0, 10);
	const sharedNow = $derived(data.shared.filter((tr) => tr.end_date >= today));
	const upcoming = $derived(data.trips.filter((tr) => tr.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)));
	/** finished trips move into the (collapsed) archive, newest first, by year */
	const past = $derived([...data.trips, ...data.shared].filter((tr) => tr.end_date < today).sort((a, b) => b.start_date.localeCompare(a.start_date)));
	const pastByYear = $derived(
		past.reduce<[string, typeof past][]>((acc, tr) => {
			const year = tr.start_date.slice(0, 4);
			const last = acc[acc.length - 1];
			if (last && last[0] === year) last[1].push(tr);
			else acc.push([year, [tr]]);
			return acc;
		}, [])
	);

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
		{#if !data.noHousehold}<a class="btn primary" href="/trips/new">✨ {t('trips.new')}</a>{/if}
	</div>

	{#if data.noHousehold}
		<!-- an account without a household (left it, or only invited to a trip) -->
		<div class="card empty">
			<div class="big">🏠</div>
			<h2>{t('household.none_title')}</h2>
			<p>{t('household.none_text')}</p>
			<form method="POST" action="/household?/create" class="create-hh">
				<input type="hidden" name="next" value="home" />
				<input name="name" required value={data.user?.name ?? ''} aria-label={t('household.name')} placeholder={t('household.name')} />
				<label class="check small"><input type="checkbox" name="starter" checked /> {t('household.with_starter')}</label>
				<button class="btn primary">🏠 {t('household.create_own')}</button>
			</form>
		</div>
	{:else if data.trips.length === 0 && data.shared.length === 0}
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

	{#if sharedNow.length}
		<h2 class="section">🤝 {t('guests.shared_with_me')}</h2>
		<div class="stack">
			{#each sharedNow as tr (tr.id)}
				<div class="shared-wrap">
					{@render tripCard(tr)}
					<span class="from tiny">{t('guests.from', { household: tr.household_name })}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if upcoming.length}
		<h2 class="section">{t('trips.upcoming')}</h2>
		<div class="stack">{#each upcoming as tr (tr.id)}{@render tripCard(tr)}{/each}</div>
	{/if}
	{#if past.length}
		<details class="archive">
			<summary><h2 class="section">🗄️ {t('trips.archive', { count: past.length })}</h2></summary>
			{#each pastByYear as [year, list] (year)}
				<h3 class="year tiny">{year}</h3>
				<div class="stack past">{#each list as tr (tr.id)}{@render tripCard(tr)}{/each}</div>
			{/each}
		</details>
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
	.archive summary {
		cursor: pointer;
		list-style: none;
	}
	.archive summary::-webkit-details-marker {
		display: none;
	}
	.archive summary h2::after {
		content: ' ▾';
		color: var(--text-3);
	}
	.archive[open] summary h2::after {
		content: ' ▴';
	}
	.year {
		margin: 0.9rem 0 0.4rem;
		color: var(--text-3);
		font-weight: 800;
		letter-spacing: 0.05em;
	}
	.shared-wrap {
		position: relative;
	}
	.from {
		position: absolute;
		top: 0.5rem;
		right: 0.8rem;
		color: var(--accent);
		font-weight: 700;
	}
	.create-hh {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: 22rem;
		margin: 0.5rem auto 0;
		text-align: left;
	}
	.past .trip {
		opacity: 0.75;
	}
</style>
