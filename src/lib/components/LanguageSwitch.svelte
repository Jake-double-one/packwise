<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n';

	const i18n = useI18n();
	const locales = $derived((page.data.locales ?? []) as { code: string; name: string }[]);

	async function change(e: Event) {
		const lang = (e.currentTarget as HTMLSelectElement).value;
		await fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang }) });
		await invalidateAll();
	}
</script>

<select class="lang" aria-label={i18n.t('settings.language')} value={i18n.locale} onchange={change}>
	{#each locales as l}
		<option value={l.code}>{l.name}</option>
	{/each}
</select>

<style>
	.lang {
		width: auto;
		padding: 0.35rem 0.6rem;
		font-size: 0.85rem;
	}
</style>
