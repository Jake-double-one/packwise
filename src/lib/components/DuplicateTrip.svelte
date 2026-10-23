<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, describeError } from '#lib/api.js';
	import { useI18n } from '#lib/i18n/index.js';
	import { toast } from '#lib/toast.svelte.js';
	import type { Trip } from '#lib/types.js';
	import Sheet from './Sheet.svelte';

	let { trip, onclose }: { trip: Trip; onclose: () => void } = $props();
	const { t } = useI18n();

	// same length as the original, starting in a year by default
	const DAY = 86_400_000;
	const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
	const init = () => {
		const length = Date.parse(trip.end_date) - Date.parse(trip.start_date);
		const s = new Date(trip.start_date);
		s.setUTCFullYear(Math.max(s.getUTCFullYear() + 1, new Date().getUTCFullYear()));
		return { name: trip.name, start: iso(s.getTime()), end: iso(s.getTime() + Math.max(0, Math.round(length / DAY)) * DAY) };
	};
	const start0 = init();
	let name = $state(start0.name);
	let start = $state(start0.start);
	let end = $state(start0.end);
	let saving = $state(false);

	async function save() {
		saving = true;
		try {
			const res = await api<{ id: string }>(`/api/trips/${trip.id}/duplicate`, { name, start, end });
			onclose();
			await goto(`/t/${res.id}`);
		} catch (err) {
			toast(describeError(err, t));
		} finally {
			saving = false;
		}
	}
</script>

<Sheet title={t('trip.duplicate')} {onclose}>
	<p class="small muted">{t('trip.duplicate_intro')}</p>
	<div class="field">
		<label for="dname">{t('wizard.name')}</label>
		<input id="dname" bind:value={name} />
	</div>
	<div class="grid-2">
		<div class="field">
			<label for="dstart">{t('wizard.start')}</label>
			<input id="dstart" type="date" bind:value={start} onchange={() => end < start && (end = start)} />
		</div>
		<div class="field">
			<label for="dend">{t('wizard.end')}</label>
			<input id="dend" type="date" bind:value={end} min={start} />
		</div>
	</div>
	<p class="small muted">ℹ️ {t('trip.duplicate_hint')}</p>

	{#snippet footer()}
		<div class="row between">
			<button class="btn" onclick={onclose}>{t('common.back')}</button>
			<button class="btn primary" onclick={save} disabled={saving || !start || !end}>{saving ? t('common.saving') : t('trip.duplicate_go')}</button>
		</div>
	{/snippet}
</Sheet>
