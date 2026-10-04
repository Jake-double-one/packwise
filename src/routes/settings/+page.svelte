<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';

	let { data, form } = $props();
	const { t } = useI18n();
	const themes = ['system', 'light', 'dark', 'amoled'];
	let theme = $derived(data.theme);

	async function setTheme(value: string) {
		theme = value;
		document.documentElement.dataset.theme = value;
		await fetch('/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: value }) });
		await invalidateAll();
	}
</script>

<svelte:head><title>{t('nav.settings')} · Packwise</title></svelte:head>

<div class="container">
	<h1>{t('nav.settings')}</h1>

	<section class="card">
		<h2>{t('settings.appearance')}</h2>
		<div class="field">
			<span class="lbl">{t('settings.theme')}</span>
			<div class="themes">
				{#each themes as th}
					<button class="theme" class:on={theme === th} onclick={() => setTheme(th)} data-preview={th}>
						<span class="swatch {th}"></span>
						{t(`settings.theme_${th}`)}
					</button>
				{/each}
			</div>
		</div>
		<div class="field">
			<span class="lbl">{t('settings.language')}</span>
			<LanguageSwitch />
			<p class="tiny muted">{t('settings.language_hint')}</p>
		</div>
	</section>

	<section class="card">
		<h2>{t('settings.profile')}</h2>
		<form method="POST" action="?/profile" use:enhance={() => async ({ update }) => update({ reset: false })}>
			{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
			{#if form?.saved === 'profile'}<div class="alert success">{t('common.saved')}</div>{/if}
			<div class="row">
				<div class="field grow">
					<label for="name">{t('settings.name')}</label>
					<input id="name" name="name" value={data.user?.name} required />
				</div>
				<div class="field">
					<label for="color">{t('settings.color')}</label>
					<input id="color" name="color" type="color" value={data.user?.color} />
				</div>
			</div>
			<button class="btn primary">{t('common.save')}</button>
		</form>
	</section>

	{#if data.authMode === 'accounts'}
		<section class="card">
			<h2>{t('auth.change_password')}</h2>
			<form method="POST" action="?/password" use:enhance>
				{#if form?.pwError}<div class="alert danger">{t(form.pwError)}</div>{/if}
				{#if form?.saved === 'password'}<div class="alert success">{t('common.saved')}</div>{/if}
				<div class="grid-2">
					<div class="field">
						<label for="current">{t('auth.current_password')}</label>
						<input id="current" name="current" type="password" required autocomplete="current-password" />
					</div>
					<div class="field">
						<label for="password">{t('auth.new_password')}</label>
						<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
					</div>
				</div>
				<button class="btn">{t('auth.change_password')}</button>
			</form>
		</section>
	{/if}

	<section class="card">
		<h2>{t('settings.session')}</h2>
		<div class="row wrap">
			{#if data.authMode !== 'accounts'}
				<a class="btn" href="/profiles">🔄 {t('settings.switch_profile')}</a>
			{/if}
			{#if data.authMode === 'accounts' && data.user?.is_admin}
				<a class="btn" href="/admin">🛡️ {t('admin.title')}</a>
			{/if}
			{#if data.authMode !== 'none'}
				<form method="POST" action="/logout"><button class="btn danger">{t('auth.logout')}</button></form>
			{/if}
		</div>
		<p class="tiny muted">{t('settings.mode', { mode: data.authMode })}</p>
	</section>
</div>

<style>
	.lbl {
		display: block;
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text-2);
		margin-bottom: 0.4rem;
	}
	.themes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.5rem;
	}
	.theme {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.7rem;
		border-radius: var(--radius-sm);
		border: 2px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.theme.on {
		border-color: var(--accent);
	}
	.swatch {
		width: 100%;
		height: 2.2rem;
		border-radius: 6px;
		border: 1px solid var(--border);
	}
	.swatch.light {
		background: linear-gradient(135deg, #fff 50%, #eef0ff 50%);
	}
	.swatch.dark {
		background: linear-gradient(135deg, #171a23 50%, #1f2340 50%);
	}
	.swatch.amoled {
		background: linear-gradient(135deg, #000 50%, #12142a 50%);
	}
	.swatch.system {
		background: linear-gradient(135deg, #fff 50%, #000 50%);
	}
</style>
