<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import { weatherIcon } from '$lib/weather';
	import type { WeatherSummary } from '$lib/types';

	let { weather, loading = false, compact = false }: { weather: WeatherSummary | null; loading?: boolean; compact?: boolean } = $props();
	const { t } = useI18n();
</script>

<section class="weather card" class:compact>
	{#if loading}
		<p class="muted small">⏳ {t('weather.loading')}</p>
	{:else if weather}
		<div class="row">
			<div class="icon">{weatherIcon(weather)}</div>
			<div class="grow">
				<div class="temps"><strong>{Math.round(weather.avgMax)}°</strong> <span class="muted">/ {Math.round(weather.avgMin)}°</span></div>
				<div class="tiny muted">
					{weather.source === 'forecast' ? t('weather.forecast') : t('weather.climate', { years: weather.years ?? 10 })}
				</div>
			</div>
			<div class="facts tiny">
				<div>↕ {Math.round(weather.minMin)}° … {Math.round(weather.maxMax)}°</div>
				<div>🌧 {weather.precipProb != null ? `${weather.precipProb}%` : t('weather.rain_days', { pct: Math.round(weather.rainShare * 100) })}</div>
				{#if weather.snowPerDay > 0}<div>❄️ {weather.snowPerDay} cm/{t('weather.day')}</div>{/if}
			</div>
		</div>
	{:else}
		<p class="muted small">{t('weather.unavailable')}</p>
	{/if}
</section>

<style>
	.weather {
		margin-bottom: 0.9rem;
	}
	.icon {
		font-size: 2.4rem;
		line-height: 1;
	}
	.temps {
		font-size: 1.4rem;
	}
	.facts {
		text-align: right;
		color: var(--text-2);
	}
	.compact {
		padding: 0.6rem 0.8rem;
	}
	.compact .icon {
		font-size: 1.8rem;
	}
	.compact .temps {
		font-size: 1.1rem;
	}
</style>
