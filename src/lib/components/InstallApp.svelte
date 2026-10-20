<script lang="ts">
	import { onMount } from 'svelte';
	import { useI18n } from '$lib/i18n';
	import { install, isStandalone } from '$lib/install.svelte';

	const { t } = useI18n();
	type State = 'checking' | 'installed' | 'prompt' | 'ios' | 'insecure' | 'manual';
	let state = $state<State>('checking');

	onMount(() => {
		if (isStandalone()) state = 'installed';
		else if (!window.isSecureContext) state = 'insecure';
		else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) state = 'ios';
		else state = install.prompt ? 'prompt' : 'manual';
	});
	// Chrome may announce installability a moment after the page is up
	$effect(() => {
		if (install.prompt && (state === 'manual' || state === 'checking')) state = 'prompt';
	});
</script>

<section class="card">
	<h2>📲 {t('install.title')}</h2>
	{#if state === 'installed'}
		<p class="small">✓ {t('install.installed')}</p>
	{:else if state === 'prompt'}
		<p class="small muted">{t('install.hint')}</p>
		<button class="btn primary" onclick={() => install.prompt?.()}>{t('install.button')}</button>
	{:else if state === 'ios'}
		<p class="small muted">{t('install.hint')}</p>
		<p class="small">{t('install.ios')}</p>
	{:else if state === 'insecure'}
		<p class="alert warning small">{t('install.insecure')}</p>
	{:else if state === 'manual'}
		<p class="small muted">{t('install.hint')}</p>
		<p class="small">{t('install.manual')}</p>
		<p class="tiny muted">{t('install.check')} <a href="/manifest.webmanifest" target="_blank" rel="noopener">/manifest.webmanifest</a></p>
	{/if}
</section>
