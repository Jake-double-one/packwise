<script lang="ts">
	import { page } from '$app/state';
	import { formatRange, useI18n } from '$lib/i18n';

	let { data } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const token = $derived(page.params.token);
</script>

<div class="container narrow">
	<div class="card hero">
		<div class="big">✉️</div>
		{#if data.trip}
			<h1>{t('invite.trip_title', { trip: data.trip.name })}</h1>
			<p class="muted">{t('invite.trip_from', { household: data.household })} · {formatRange(data.trip.start_date, data.trip.end_date, i18n.locale)}</p>
			<p class="small muted">{t('invite.trip_hint')}</p>
		{:else}
			<h1>{t('invite.title', { household: data.household })}</h1>
		{/if}
		{#if data.loggedIn}
			<form method="POST" action="?/accept">
				<button class="btn primary block">{data.trip ? t('invite.accept_trip') : t('invite.accept')}</button>
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
