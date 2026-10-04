<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';

	let { form } = $props();
	const { t } = useI18n();
</script>

<div class="container narrow">
	<h1 class="title">{t('auth.new_password')}</h1>
	<form method="POST" class="card" use:enhance>
		{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
		<div class="field">
			<label for="password">{t('auth.password')}</label>
			<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
			<p class="tiny muted">{t('auth.password_hint')}</p>
		</div>
		<button class="btn primary block">{t('common.save')}</button>
	</form>
</div>

<style>
	.title {
		text-align: center;
		margin: 2.5rem 0 1.25rem;
	}
</style>
