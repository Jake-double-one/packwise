<script lang="ts">
	import { goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { api } from '$lib/api';
	import { DIMENSIONS } from '$lib/context';
	import { countryName, regionOf } from '$lib/data/countries';
	import { generate, generateTodos, todoDue } from '$lib/generate';
	import { formatDate, useI18n } from '$lib/i18n';
	import { classifyClimate, seasonOf, tripLength, weatherIcon } from '$lib/weather';
	import type { TripContext, WeatherSummary } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import PlaceSearch, { type Place } from '$lib/components/PlaceSearch.svelte';
	import WeatherCard from '$lib/components/WeatherCard.svelte';
	import WarningList from '$lib/components/WarningList.svelte';

	let { data } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	const iso = (d: Date) => d.toISOString().slice(0, 10);
	const addDays = (s: string, n: number) => iso(new Date(Date.parse(s) + n * 86_400_000));

	// ── form state ──────────────────────────────────────────────────────────
	let query = $state('');
	let place = $state<Place | null>(null);
	let manualCountry = $state('');
	let name = $state('');
	let nameTouched = $state(false);
	let start = $state(addDays(iso(new Date()), 14));
	let end = $state(addDays(iso(new Date()), 21));
	// everyone travels by default (initial value only; the page is not reused across households)
	const everyone = () => data.persons.map((p) => p.id);
	let persons = new SvelteSet<string>(everyone());
	let manual = $state<TripContext>({ transport: [], stay: [], activity: [] });
	let overrides = $state<Record<string, string[]>>({});
	let laundry = $state(false);
	let laundryDays = $state(7);
	let withTodos = $state(true);
	let weather = $state<WeatherSummary | null>(null);
	let weatherLoading = $state(false);
	const forceIn = new SvelteSet<string>();
	const forceOut = new SvelteSet<string>();
	let creating = $state(false);
	let errorMsg = $state('');
	let showExcluded = $state(false);

	const country = $derived(place?.country_code ?? (manualCountry || null));
	const destination = $derived(place ? [place.name, place.admin1].filter(Boolean).join(', ') : manualCountry ? countryName(manualCountry, i18n.locale) : '');
	const { days, nights } = $derived(tripLength(start, end));

	$effect(() => {
		if (!nameTouched) {
			const year = start.slice(0, 4);
			name = destination ? `${place?.name ?? destination} ${year}` : '';
		}
	});

	// ── auto context ────────────────────────────────────────────────────────
	const auto = $derived<TripContext>({
		climate: classifyClimate(weather),
		season: [seasonOf(start, end, place?.lat)],
		region: [regionOf(data.homeCountry, country)].filter((x): x is string => !!x),
		travelers: [...new Set(data.persons.filter((p) => persons.has(p.id)).map((p) => p.kind))]
	});
	const context = $derived<TripContext>({ ...manual, ...auto, ...overrides });

	function toggle(dim: string, value: string) {
		const isAuto = DIMENSIONS.find((d) => d.key === dim)?.auto;
		const current = context[dim] ?? [];
		const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
		if (isAuto) overrides = { ...overrides, [dim]: dim === 'season' ? next.slice(-1) : next };
		else manual = { ...manual, [dim]: next };
	}

	// ── weather ─────────────────────────────────────────────────────────────
	$effect(() => {
		const p = place;
		const s = start;
		const e = end;
		if (!p || !s || !e || e < s || !data.weatherEnabled) {
			weather = null;
			return;
		}
		weatherLoading = true;
		const ctrl = new AbortController();
		fetch(`/api/weather?lat=${p.lat}&lon=${p.lon}&start=${s}&end=${e}`, { signal: ctrl.signal })
			.then((r) => r.json())
			.then((d) => {
				weather = d.weather;
				const { climate: _, ...rest } = overrides;
				overrides = rest;
			})
			.catch(() => {})
			.finally(() => (weatherLoading = false));
		return () => ctrl.abort();
	});

	// ── like last time ──────────────────────────────────────────────────────
	function applyPrevious(id: string) {
		const prev = data.previous.find((p) => p.id === id);
		if (!prev) return;
		const c = prev.settings.context ?? {};
		manual = { transport: c.transport ?? [], stay: c.stay ?? [], activity: c.activity ?? [] };
		persons.clear();
		(prev.settings.persons ?? []).forEach((p) => persons.add(p));
		laundry = (prev.settings.laundryDays ?? 0) > 0;
		if (laundry) laundryDays = prev.settings.laundryDays;
		withTodos = prev.settings.todos ?? true;
	}

	// ── preview ─────────────────────────────────────────────────────────────
	const settings = $derived({ persons: [...persons], context, laundryDays: laundry ? laundryDays : 0, todos: withTodos });
	const todoPreview = $derived(withTodos ? generateTodos(data.todoTemplates, settings) : []);
	const preview = $derived(
		generate({
			nodes: data.nodes,
			persons: data.persons,
			bags: data.bags,
			settings,
			startDate: start,
			endDate: end,
			homeCountry: data.homeCountry,
			destCountry: country,
			weather,
			forceInclude: [...forceIn],
			forceExclude: [...forceOut],
			locale: i18n.locale,
			t
		})
	);
	const previewGroups = $derived.by(() => {
		const top = preview.items.filter((i) => i.kind === 'group' && i.parentKey === null);
		const under = (key: string): typeof preview.items =>
			preview.items.filter((i) => i.parentKey === key).flatMap((i) => (i.kind === 'group' ? under(i.key) : [i]));
		return top.map((g) => ({ group: g, items: under(g.key) }));
	});
	const itemCount = $derived(preview.items.filter((i) => i.kind === 'item').length);
	const personName = $derived(new Map(data.persons.map((p) => [p.id, p.name])));

	function excludeItem(templateId: string | null) {
		if (!templateId) return;
		forceIn.delete(templateId);
		forceOut.add(templateId);
	}
	function includeItem(templateId: string) {
		forceOut.delete(templateId);
		forceIn.add(templateId);
	}

	async function create() {
		errorMsg = '';
		if (!destination && !nameTouched) {
			errorMsg = t('trip.err.destination');
			return;
		}
		creating = true;
		try {
			const res = await api<{ id: string }>('/api/trips', {
				name: name || destination,
				destination,
				country,
				lat: place?.lat ?? null,
				lon: place?.lon ?? null,
				start,
				end,
				settings,
				weather,
				forceInclude: [...forceIn],
				forceExclude: [...forceOut]
			});
			await goto(`/t/${res.id}`);
		} catch (err) {
			errorMsg = t((err as Error).message);
			creating = false;
		}
	}
</script>

<svelte:head><title>{t('trips.new')} · Packwise</title></svelte:head>

<div class="container wide">
	<h1>✨ {t('trips.new')}</h1>

	<div class="layout">
		<div class="form">
			<section class="card">
				<h2>📍 {t('wizard.where')}</h2>
				<PlaceSearch bind:place bind:country={manualCountry} bind:query />
				<div class="grid-2">
					<div class="field">
						<label for="start">{t('wizard.start')}</label>
						<input id="start" type="date" bind:value={start} onchange={() => end < start && (end = start)} />
					</div>
					<div class="field">
						<label for="end">{t('wizard.end')}</label>
						<input id="end" type="date" bind:value={end} min={start} />
					</div>
				</div>
				<p class="small muted">{t('wizard.length', { days, nights })}</p>
				<div class="field">
					<label for="tname">{t('wizard.name')}</label>
					<input id="tname" bind:value={name} oninput={() => (nameTouched = true)} placeholder={t('wizard.name_placeholder')} />
				</div>
				{#if data.previous.length}
					<div class="field">
						<label for="prev">{t('wizard.like_last_time')}</label>
						<select id="prev" onchange={(e) => applyPrevious((e.currentTarget as HTMLSelectElement).value)}>
							<option value="">—</option>
							{#each data.previous as p}<option value={p.id}>{p.name}</option>{/each}
						</select>
					</div>
				{/if}
			</section>

			<section class="card">
				<h2>👥 {t('wizard.who')}</h2>
				<div class="chips">
					{#each data.persons as p}
						<button type="button" class="chip person" class:on={persons.has(p.id)} onclick={() => (persons.has(p.id) ? persons.delete(p.id) : persons.add(p.id))}>
							<Avatar name={p.name} color={p.color} size={20} />
							{p.name}
						</button>
					{/each}
				</div>
				{#if !data.persons.length}<p class="small muted">{t('wizard.no_persons')} <a href="/household">{t('nav.household')}</a></p>{/if}
			</section>

			<section class="card">
				<h2>🧭 {t('wizard.context')}</h2>
				{#each DIMENSIONS as dim}
					<div class="dim">
						<div class="dim-label">
							{dim.icon} {t(`dim.${dim.key}`)}
							{#if dim.auto}<span class="badge">{t('wizard.auto')}</span>{/if}
						</div>
						<div class="chips">
							{#each dim.values.filter((v) => dim.key !== 'travelers' || v !== 'adult') as v}
								<button type="button" class="chip" class:on={(context[dim.key] ?? []).includes(v)} onclick={() => toggle(dim.key, v)}>
									{t(`ctx.${dim.key}.${v}`)}
								</button>
							{/each}
						</div>
					</div>
				{/each}
				<label class="check">
					<input type="checkbox" bind:checked={laundry} />
					🧺 {t('wizard.laundry')}
				</label>
				{#if laundry}
					<div class="row laundry">
						<span class="small">{t('wizard.laundry_days')}</span>
						<input type="number" min="1" max="30" bind:value={laundryDays} />
					</div>
				{/if}
				<label class="check todos-check">
					<input type="checkbox" bind:checked={withTodos} />
					✅ {t('wizard.todos')}
				</label>
			</section>
		</div>

		<aside class="preview">
			{#if data.weatherEnabled && place}
				<WeatherCard {weather} loading={weatherLoading} />
			{/if}
			{#if !data.homeCountry}
				<div class="alert small">{t('wizard.no_home_country')} <a href="/household">{t('nav.household')}</a></div>
			{/if}
			<WarningList warnings={preview.warnings} />

			<section class="card">
				<div class="row between">
					<h2>📋 {t('wizard.preview')}</h2>
					<span class="badge">{t('wizard.items', { count: itemCount })}</span>
				</div>
				{#each previewGroups as { group, items }}
					<details class="pgroup" open={group.origin === 'auto'}>
						<summary>
							<strong>{group.name}</strong>
							<span class="tiny muted">{items.length}</span>
						</summary>
						<ul>
							{#each items as it}
								<li class="row">
									<span class="grow">
										{it.name}
										{#if it.qty > 1}<span class="badge">×{it.qty}</span>{/if}
										{#if it.person_id}<span class="tiny muted">· {personName.get(it.person_id)}</span>{/if}
										{#if it.reason}<span class="reason tiny">{it.reason}</span>{/if}
									</span>
									{#if it.template_id}
										<button type="button" class="btn ghost small" title={t('wizard.remove')} onclick={() => excludeItem(it.template_id)}>✕</button>
									{/if}
								</li>
							{/each}
						</ul>
					</details>
				{/each}

				{#if todoPreview.length}
					<details class="pgroup">
						<summary><strong>✅ {t('todo.title')}</strong> <span class="tiny muted">{todoPreview.length}</span></summary>
						<ul>
							{#each todoPreview as td}
								<li class="row"><span class="grow">{td.name}</span><span class="tiny muted">{formatDate(todoDue(start, td.days_before), i18n.locale, { day: 'numeric', month: 'short' })}</span></li>
							{/each}
						</ul>
					</details>
				{/if}

				{#if preview.excluded.length}
					<button type="button" class="btn ghost small toggle-ex" onclick={() => (showExcluded = !showExcluded)}>
						{showExcluded ? '▾' : '▸'} {t('wizard.excluded', { count: preview.excluded.length })}
					</button>
					{#if showExcluded}
						<ul class="excluded">
							{#each preview.excluded as ex}
								<li class="row">
									<span class="grow">
										<span class="ex-name">{ex.name}</span>
										<span class="tiny muted">{ex.path}</span>
										<span class="reason tiny">{ex.reason}</span>
									</span>
									<button type="button" class="btn small" onclick={() => includeItem(ex.template_id)}>+ {t('wizard.include')}</button>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>

			{#if errorMsg}<div class="alert danger">{errorMsg}</div>{/if}
			<button class="btn primary block create" onclick={create} disabled={creating}>
				{creating ? t('common.saving') : `✨ ${t('wizard.create')}`}
			</button>
		</aside>
	</div>
</div>

<style>
	.wide {
		max-width: 1200px;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
	}
	.preview {
		position: sticky;
		top: 4.5rem;
		max-height: calc(100dvh - 5.5rem);
		overflow-y: auto;
		padding-bottom: 1rem;
	}
	@media (max-width: 860px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.preview {
			position: static;
			max-height: none;
		}
	}
	.dim {
		margin-bottom: 0.8rem;
	}
	.dim-label {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-2);
		margin-bottom: 0.35rem;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.person {
		padding-left: 0.3rem;
	}
	.laundry {
		margin-top: 0.4rem;
	}
	.todos-check {
		margin-top: 0.6rem;
	}
	.laundry input {
		width: 5rem;
	}
	.pgroup {
		border-top: 1px solid var(--border);
		padding: 0.4rem 0;
	}
	.pgroup summary {
		cursor: pointer;
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.pgroup ul,
	.excluded {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0 0 0 0.6rem;
	}
	.pgroup li,
	.excluded li {
		padding: 0.15rem 0;
		font-size: 0.9rem;
		align-items: flex-start;
	}
	.reason {
		display: block;
		color: var(--text-3);
	}
	.ex-name {
		text-decoration: line-through;
		color: var(--text-2);
	}
	.toggle-ex {
		margin-top: 0.5rem;
	}
	.create {
		margin-top: 0.75rem;
		min-height: 3rem;
		font-size: 1.05rem;
	}
</style>
