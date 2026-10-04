<script lang="ts">
	import { analysePlugs, COUNTRIES, countryFlag, countryName, currencyName, LEFT_HAND_TRAFFIC } from '$lib/data/countries';
	import { formatDate, useI18n } from '$lib/i18n';
	import { dayIcon, tripLength } from '$lib/weather';
	import type { Trip, TripNote } from '$lib/types';
	import TripEditor from './TripEditor.svelte';
	import TripNotes from './TripNotes.svelte';
	import WarningList from './WarningList.svelte';
	import WeatherCard from './WeatherCard.svelte';

	let {
		trip,
		notes,
		homeCountry,
		canEdit,
		send
	}: {
		trip: Trip;
		notes: TripNote[];
		homeCountry: string | null;
		canEdit: boolean;
		send: (op: { op: string; [k: string]: unknown }) => Promise<unknown>;
	} = $props();
	let editing = $state(false);
	const i18n = useI18n();
	const { t } = i18n;

	interface Day {
		date: string;
		source: 'forecast' | 'climate';
		tmax: number | null;
		tmin: number | null;
		rain: number | null;
		precip: number | null;
		snow: number | null;
		code: number | null;
	}
	interface Info {
		location: { lat: number; lon: number; precision: 'place' | 'country' } | null;
		days: Day[];
		weatherEnabled: boolean;
	}

	let info = $state<Info | null>(null);
	let failed = $state(false);

	// reload map & weather when destination or dates change
	const infoKey = $derived(`${trip.id}|${trip.lat}|${trip.lon}|${trip.country}|${trip.start_date}|${trip.end_date}`);
	$effect(() => {
		void infoKey;
		load();
	});

	async function load() {
		failed = false;
		try {
			const res = await fetch(`/api/trips/${trip.id}/info`);
			if (!res.ok) throw new Error(String(res.status));
			info = await res.json();
		} catch {
			failed = true;
		}
	}

	const country = $derived(trip.country ? COUNTRIES[trip.country] : null);
	const plugs = $derived(analysePlugs(homeCountry, trip.country));
	const { days: dayCount, nights } = $derived(tripLength(trip.start_date, trip.end_date));
	const hasClimate = $derived(info?.days.some((d) => d.source === 'climate') ?? false);
	const hasForecast = $derived(info?.days.some((d) => d.source === 'forecast') ?? false);

	const mapUrl = $derived.by(() => {
		const loc = info?.location;
		if (!loc) return null;
		const [dLat, dLon] = loc.precision === 'place' ? [0.05, 0.09] : [4, 7];
		const bbox = [loc.lon - dLon, loc.lat - dLat, loc.lon + dLon, loc.lat + dLat].map((n) => n.toFixed(4)).join(',');
		return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
	});
	const mapLink = $derived(
		info?.location
			? `https://www.openstreetmap.org/?mlat=${info.location.lat.toFixed(5)}&mlon=${info.location.lon.toFixed(5)}#map=${info.location.precision === 'place' ? 13 : 6}/${info.location.lat.toFixed(4)}/${info.location.lon.toFixed(4)}`
			: null
	);
	const round = (n: number | null) => (n == null ? '–' : Math.round(n));
</script>

<div class="info-tab">
	<TripNotes {notes} {send} />

	<section class="card map-card">
		<div class="row between">
			<h2>🗺️ {trip.destination || (trip.country ? countryName(trip.country, i18n.locale) : trip.name)}</h2>
			{#if canEdit}<button class="btn small" onclick={() => (editing = true)}>✏️ {t('trip.edit_trip')}</button>{/if}
		</div>
		{#if mapUrl}
			<div class="map"><iframe title={t('info.map')} src={mapUrl} loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
			<div class="row between tiny">
				<span class="muted">{info?.location?.precision === 'country' ? t('info.map_country') : ''} © OpenStreetMap</span>
				<a href={mapLink} target="_blank" rel="noopener">{t('info.open_map')} ↗</a>
			</div>
		{:else if info || failed}
			<p class="muted small">{t('info.no_location')}</p>
		{:else}
			<div class="map skeleton"></div>
		{/if}
	</section>

	<section class="card wide">
		<div class="row between wrap">
			<h2>🌤️ {t('info.weather')}</h2>
			<div class="legend tiny">
				{#if hasForecast}<span class="pill">{t('weather.forecast')}</span>{/if}
				{#if hasClimate}<span class="pill climate">⌀ {t('info.climate_short')}</span>{/if}
			</div>
		</div>
		{#if info?.days.length}
			<div class="days" role="list">
				{#each info.days as d (d.date)}
					<div class="day" class:climate={d.source === 'climate'} role="listitem">
						<div class="dow">{formatDate(d.date, i18n.locale, { weekday: 'short' })}</div>
						<div class="date tiny">{formatDate(d.date, i18n.locale, { day: 'numeric', month: 'short' })}</div>
						<div class="icon">{dayIcon(d)}</div>
						<div class="temps"><strong>{round(d.tmax)}°</strong> <span class="muted">{round(d.tmin)}°</span></div>
						<div class="rain tiny" title={d.source === 'climate' ? t('info.rain_years') : t('info.rain_prob')}>💧 {d.rain == null ? '–' : `${d.rain}%`}</div>
						{#if (d.snow ?? 0) >= 0.5}<div class="tiny">❄️ {d.snow} cm</div>{/if}
						{#if d.source === 'climate'}<div class="src tiny">⌀ {t('info.climate_tile')}</div>{/if}
					</div>
				{/each}
			</div>
			{#if hasClimate}<p class="tiny muted">{t('info.climate_hint')}</p>{/if}
		{:else if info && !info.weatherEnabled}
			<p class="muted small">{t('info.weather_disabled')}</p>
		{:else if info?.location?.precision === 'country'}
			<p class="muted small">{t('info.weather_needs_place')}</p>
			{#if trip.weather}<WeatherCard weather={trip.weather} compact />{/if}
		{:else if info || failed}
			<p class="muted small">{t('weather.unavailable')}</p>
			{#if trip.weather}<WeatherCard weather={trip.weather} compact />{/if}
		{:else}
			<p class="muted small">⏳ {t('weather.loading')}</p>
		{/if}
	</section>

	<section class="card">
		<h2>🧭 {t('info.facts')}</h2>
		<dl class="facts">
			<dt>{t('info.when')}</dt>
			<dd>{formatDate(trip.start_date, i18n.locale, { weekday: 'short', day: 'numeric', month: 'long' })} – {formatDate(trip.end_date, i18n.locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {t('wizard.length', { days: dayCount, nights })}</dd>
			{#if trip.country}
				<dt>{t('info.country')}</dt>
				<dd>{countryFlag(trip.country)} {countryName(trip.country, i18n.locale)}</dd>
			{/if}
			{#if country}
				<dt>{t('info.power')}</dt>
				<dd>
					{t('info.plugs', { types: country.plugs.join(', '), volt: country.voltage, hz: country.hz })}
					{#if plugs}
						<br /><span class="small" class:warn={plugs.status !== 'none'}>{plugs.status === 'none' ? `✓ ${t('info.plugs_fit')}` : `🔌 ${t('info.adapter', { types: plugs.adapterTypes.join('/') })}`}</span>
						{#if plugs.voltageMismatch}<br /><span class="small warn">⚡ {t('info.voltage', { home: plugs.homeVoltage, dest: plugs.destVoltage })}</span>{/if}
					{/if}
				</dd>
				<dt>{t('info.currency')}</dt>
				<dd>{currencyName(country.currency, i18n.locale)} ({country.currency})</dd>
				<dt>{t('info.traffic')}</dt>
				<dd>{LEFT_HAND_TRAFFIC.has(country.code) ? `⬅️ ${t('info.left')}` : `➡️ ${t('info.right')}`}</dd>
			{/if}
		</dl>
	</section>

	{#if trip.warnings.length}
		<section class="card">
			<h2>💡 {t('trip.hints', { count: trip.warnings.length })}</h2>
			<WarningList warnings={trip.warnings} />
		</section>
	{/if}
</div>

{#if editing}
	<TripEditor {trip} onsave={(patch) => send(patch as { op: string })} onclose={() => (editing = false)} />
{/if}

<style>
	.info-tab {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.9rem;
	}
	@media (min-width: 1000px) {
		.info-tab {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
		.wide {
			grid-column: 1 / -1;
		}
	}
	.info-tab .card {
		margin: 0;
	}
	h2 {
		font-size: 1.05rem;
	}
	.map {
		height: 320px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--border);
		margin-bottom: 0.4rem;
		background: var(--surface-2);
	}
	.map iframe {
		width: 100%;
		height: 100%;
		border: 0;
	}
	:global(:root[data-theme='dark']) .map iframe,
	:global(:root[data-theme='amoled']) .map iframe {
		filter: invert(0.9) hue-rotate(180deg) brightness(0.95);
	}
	@media (prefers-color-scheme: dark) {
		:global(:root[data-theme='system']) .map iframe {
			filter: invert(0.9) hue-rotate(180deg) brightness(0.95);
		}
	}
	.skeleton {
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	@keyframes pulse {
		to {
			opacity: 0.5;
		}
	}
	.legend {
		display: flex;
		gap: 0.35rem;
	}
	.pill {
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-weight: 600;
	}
	.pill.climate {
		border-style: dashed;
	}
	.days {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 0.2rem 0.1rem 0.6rem;
		scroll-snap-type: x proximity;
	}
	.day {
		flex: 0 0 5.4rem;
		scroll-snap-align: start;
		text-align: center;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.3rem;
	}
	.day.climate {
		border-style: dashed;
		background: transparent;
	}
	.dow {
		font-weight: 800;
		text-transform: capitalize;
	}
	.date {
		color: var(--text-3);
	}
	.icon {
		font-size: 1.8rem;
		line-height: 1.3;
	}
	.temps {
		font-size: 0.95rem;
	}
	.rain {
		color: var(--text-2);
	}
	.src {
		color: var(--text-3);
		margin-top: 0.15rem;
	}
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.45rem 1rem;
		margin: 0;
	}
	dt {
		font-weight: 700;
		color: var(--text-2);
		font-size: 0.85rem;
	}
	dd {
		margin: 0;
	}
	.warn {
		color: var(--warning);
		font-weight: 600;
	}
</style>
