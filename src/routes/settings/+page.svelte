<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { useI18n } from '$lib/i18n';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import { AVATAR_EMOJIS } from '$lib/avatars';
	import ApiTokens from '$lib/components/ApiTokens.svelte';
	import SmtpSettings from '$lib/components/SmtpSettings.svelte';
	import { tick } from 'svelte';

	let avatarForm = $state<HTMLFormElement | null>(null);
	let avatarImage = $state('');
	let uploading = $state(false);

	/** Center-crop and shrink the picture to 160 px in the browser, so only a few KB are uploaded. */
	async function pickImage(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploading = true;
		try {
			const bitmap = await createImageBitmap(file);
			const side = Math.min(bitmap.width, bitmap.height);
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 160;
			canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 160, 160);
			let url = canvas.toDataURL('image/webp', 0.85);
			if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);
			avatarImage = url;
			await tick();
			avatarForm?.requestSubmit();
		} catch {
			uploading = false;
			alert(t('settings.avatar_invalid'));
		}
	}

	let { data, form } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const themes = ['system', 'light', 'dark', 'amoled'];
	let theme = $derived(data.theme);

	/** Cached lists must not survive a logout on shared devices. */
	function clearOfflineCache() {
		try {
			caches?.delete('pw-pages');
			navigator.serviceWorker?.controller?.postMessage('clear-pages');
		} catch {
			/* no cache support */
		}
	}

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
		{#if data.authMode === 'accounts'}
		<div class="avatar-row">
			<Avatar name={data.user?.name ?? '?'} color={data.user?.color ?? '#888'} avatar={data.user?.avatar} size={72} />
			<div class="grow">
				<span class="lbl">{t('settings.avatar')}</span>
				<form method="POST" action="?/avatar" bind:this={avatarForm} use:enhance={() => async ({ update }) => { uploading = false; await update({ reset: false }); }}>
					<input type="hidden" name="image" value={avatarImage} />
					<div class="emojis">
						{#each AVATAR_EMOJIS as e}
							<button class="emoji" class:on={data.user?.avatar === e} name="emoji" value={e} aria-label={e}>{e}</button>
						{/each}
					</div>
					<div class="row wrap upload-row">
						<label class="btn small">
							📷 {uploading ? t('common.saving') : t('settings.avatar_upload')}
							<input type="file" accept="image/*" class="sr-only" onchange={pickImage} />
						</label>
						{#if data.user?.avatar}<button class="btn small ghost" name="clear" value="1">{t('settings.avatar_clear')}</button>{/if}
					</div>
				</form>
				{#if form?.avatarError}<div class="alert danger small">{t(form.avatarError)}</div>{/if}
				<p class="tiny muted">{t('settings.avatar_hint')}</p>
			</div>
		</div>
		{/if}
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

	{#if data.smtpSettings}
		<SmtpSettings view={data.smtpSettings} result={form} />
	{/if}

	{#if data.mcp}
		<ApiTokens tokens={data.mcp.tokens} max={data.mcp.max} url={data.mcp.url} created={form?.createdToken ?? null} error={form?.tokenError ?? null} />
	{/if}

	{#if data.authMode === 'accounts'}
		<section class="card">
			<h2>{t('auth.change_password')}</h2>
			{#if data.adminReset}<p class="small muted">🔑 {t('settings.admin_reset', { date: new Date(data.adminReset).toLocaleString(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>{/if}
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
				<form method="POST" action="/logout" onsubmit={clearOfflineCache}><button class="btn danger">{t('auth.logout')}</button></form>
			{/if}
		</div>
		<p class="tiny muted">{t('settings.mode', { mode: data.authMode })} · Packwise v{__APP_VERSION__}</p>
	</section>
</div>

<style>
	.avatar-row {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 1rem;
	}
	.emojis {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.3rem 0 0.5rem;
	}
	.emoji {
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1.25rem;
		line-height: 1;
		border-radius: 50%;
		border: 2px solid transparent;
		background: var(--surface-2);
		cursor: pointer;
		padding: 0;
	}
	.emoji.on {
		border-color: var(--accent);
	}
	.upload-row {
		gap: 0.5rem;
	}
	.upload-row label.btn {
		cursor: pointer;
	}
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
