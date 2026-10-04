<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';

	let { data, form } = $props();
	const { t } = useI18n();
</script>

<svelte:head><title>{t('auth.register')} · Packwise</title></svelte:head>

<div class="container narrow">
	<h1 class="title">{t('auth.register')}</h1>
	{#if !data.allowed}
		<div class="card">
			<p>{t('auth.registration_closed')}</p>
			<a class="btn" href="/login">{t('auth.login')}</a>
		</div>
	{:else}
		<form method="POST" class="card" use:enhance>
			{#if data.household}<div class="alert success">{t('auth.invited_to', { household: data.household })}</div>{/if}
			{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
			<div class="field">
				<label for="name">{t('setup.your_name')}</label>
				<input id="name" name="name" required autocomplete="name" value={form?.name ?? ''} />
			</div>
			<div class="field">
				<label for="email">{t('auth.email')}</label>
				<input id="email" name="email" type="email" required autocomplete="email" value={form?.email ?? data.email} />
			</div>
			<div class="field">
				<label for="password">{t('auth.password')}</label>
				<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
				<p class="tiny muted">{t('auth.password_hint')}</p>
			</div>
			<button class="btn primary block">{t('auth.register')}</button>
			<p class="small center"><a href="/login">{t('auth.have_account')}</a></p>
		</form>
	{/if}
</div>

<style>
	.title {
		text-align: center;
		margin: 2.5rem 0 1.25rem;
	}
	.center {
		text-align: center;
		margin: 0.9rem 0 0;
	}
</style>
