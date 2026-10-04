<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';

	let { data, form } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	let busy = $state(false);
	let country = $derived(form?.country ?? data.defaultCountry);
</script>

<svelte:head><title>{t('setup.title')} · Packwise</title></svelte:head>

<div class="container narrow">
	<div class="hero">
		<img src="/favicon.svg" alt="" width="64" height="64" />
		<h1>{t('setup.welcome')}</h1>
		<p class="muted">{t('setup.intro')}</p>
		<LanguageSwitch />
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
		<input type="hidden" name="lang" value={i18n.locale} />

		<h2>{t('setup.you')}</h2>
		<div class="field">
			<label for="name">{t('setup.your_name')}</label>
			<input id="name" name="name" required autocomplete="name" value={form?.name ?? ''} placeholder={t('setup.name_placeholder')} />
		</div>

		{#if data.mode === 'accounts'}
			<div class="field">
				<label for="email">{t('auth.email')}</label>
				<input id="email" name="email" type="email" required autocomplete="email" value={form?.email ?? ''} />
			</div>
			<div class="field">
				<label for="password">{t('auth.password')}</label>
				<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
				<p class="tiny muted">{t('auth.password_hint')}</p>
			</div>
		{/if}

		{#if data.needsAppPassword}
			<div class="field">
				<label for="app_password">{t('setup.app_password')}</label>
				<input id="app_password" name="app_password" type="password" required minlength="6" autocomplete="new-password" />
				<p class="tiny muted">{t('setup.app_password_hint')}</p>
			</div>
		{/if}

		<hr />
		<h2>{t('setup.household')}</h2>
		<div class="field">
			<label for="household">{t('household.name')}</label>
			<input id="household" name="household" required value={form?.household ?? t('setup.household_default')} />
		</div>
		<div class="field">
			<label for="country">{t('household.home_country')}</label>
			<CountrySelect bind:value={country} />
			<p class="tiny muted">{t('household.home_country_hint')}</p>
		</div>

		<div class="field">
			<span class="label">{t('setup.starter')}</span>
			<label class="check"><input type="radio" name="starter" value="yes" checked /> {t('setup.starter_yes')}</label>
			<label class="check"><input type="radio" name="starter" value="no" /> {t('setup.starter_no')}</label>
		</div>

		<button class="btn primary block" disabled={busy}>{busy ? t('common.saving') : t('setup.finish')}</button>
	</form>

	<p class="tiny muted center">{t('setup.mode_hint', { mode: data.mode })}</p>
</div>

<style>
	.hero {
		text-align: center;
		margin: 2rem 0 1.25rem;
	}
	.hero img {
		margin-bottom: 0.75rem;
	}
	.label {
		display: block;
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text-2);
		margin-bottom: 0.3rem;
	}
	.check {
		margin-bottom: 0.35rem;
	}
	.center {
		text-align: center;
		margin-top: 1rem;
	}
</style>
