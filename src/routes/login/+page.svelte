<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';

	let { data, form } = $props();
	const { t } = useI18n();
	let busy = $state(false);
</script>

<svelte:head><title>{t('auth.login')} · Packwise</title></svelte:head>

<div class="container narrow">
	<div class="hero">
		<img src="/favicon.svg" alt="" width="56" height="56" />
		<h1>Packwise</h1>
		<p class="muted">{data.mode === 'local' ? t('auth.local_intro') : t('auth.accounts_intro')}</p>
	</div>
	<form
		method="POST"
		class="card"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
		{#if data.mode === 'accounts'}
			<div class="field">
				<label for="email">{t('auth.email')}</label>
				<input id="email" name="email" type="email" required autocomplete="username" value={form?.email ?? ''} />
			</div>
		{/if}
		<div class="field">
			<label for="password">{t('auth.password')}</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input id="password" name="password" type="password" required autocomplete="current-password" autofocus={data.mode === 'local'} />
		</div>
		<button class="btn primary block" disabled={busy}>{t('auth.login')}</button>
		{#if data.mode === 'accounts'}
			<div class="row between links small">
				<a href="/forgot">{t('auth.forgot')}</a>
				{#if data.registration === 'open'}<a href="/register">{t('auth.register')}</a>{/if}
			</div>
		{/if}
	</form>
	<div class="center"><LanguageSwitch /></div>
</div>

<style>
	.hero {
		text-align: center;
		margin: 3rem 0 1.25rem;
	}
	.links {
		margin-top: 0.9rem;
	}
	.center {
		text-align: center;
		margin-top: 1rem;
	}
</style>
