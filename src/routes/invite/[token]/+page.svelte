<script lang="ts">
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n';

	let { data } = $props();
	const { t } = useI18n();
	const token = $derived(page.params.token);
</script>

<div class="container narrow">
	<div class="card hero">
		<div class="big">✉️</div>
		<h1>{t('invite.title', { household: data.household })}</h1>
		{#if data.loggedIn}
			<form method="POST" action="?/accept">
				<button class="btn primary block">{t('invite.accept')}</button>
			</form>
		{:else}
			<p class="muted">{t('invite.need_account')}</p>
			<div class="stack">
				<a class="btn primary" href="/register?invite={token}">{t('auth.register')}</a>
				<a class="btn" href="/login?next=/invite/{token}">{t('auth.have_account')}</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.hero {
		text-align: center;
		margin-top: 3rem;
	}
	.big {
		font-size: 3rem;
	}
</style>
