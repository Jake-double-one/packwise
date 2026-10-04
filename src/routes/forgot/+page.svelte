<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';

	let { data, form } = $props();
	const { t } = useI18n();
</script>

<div class="container narrow">
	<h1 class="title">{t('auth.forgot')}</h1>
	<div class="card">
		{#if !data.smtp}
			<p>{t('auth.ask_admin')}</p>
		{:else if form?.sent}
			<div class="alert success">{t('auth.reset_sent')}</div>
		{:else}
			<form method="POST" use:enhance>
				{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
				<div class="field">
					<label for="email">{t('auth.email')}</label>
					<input id="email" name="email" type="email" required autocomplete="email" />
				</div>
				<button class="btn primary block">{t('auth.send_reset')}</button>
			</form>
		{/if}
		<p class="small center"><a href="/login">← {t('auth.login')}</a></p>
	</div>
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
