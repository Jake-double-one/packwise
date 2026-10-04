<script lang="ts">
	import { page } from '$app/state';
	import { useI18n } from '$lib/i18n';
	const { t } = useI18n();
	const msg = $derived(page.error?.message ?? '');
</script>

<div class="container narrow">
	<div class="card empty">
		<div class="big">🧭</div>
		<h1>{page.status}</h1>
		<p>{msg && t(msg) !== msg ? t(msg) : page.status === 404 ? t('error.not_found') : msg || t('error.generic')}</p>
		<a class="btn primary" href="/">{t('error.home')}</a>
	</div>
</div>
