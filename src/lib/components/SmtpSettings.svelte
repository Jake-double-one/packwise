<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '#lib/i18n/index.js';

	type View = { source: 'env' | 'db' | 'none'; host: string; port: number; security: 'starttls' | 'ssl' | 'none'; user: string; from: string; hasPassword: boolean };
	type Result = { smtpSaved?: string; smtpError?: string; smtpDetail?: string } | null;
	let { view, result }: { view: View; result: Result } = $props();
	const { t } = useI18n();

	// The fields follow the saved settings but can be edited (writable deriveds). They only
	// reset when the saved values really change – not when the page reloads its data after
	// a test mail, which would throw away what was typed.
	const saved = $derived(JSON.stringify(view));
	const v = $derived(JSON.parse(saved) as View);
	let security = $derived(v.security);
	let port = $derived(String(v.port));
	let host = $derived(v.host);
	let user = $derived(v.user);
	let from = $derived(v.from);
	/** the usual port follows the chosen encryption unless someone typed their own */
	function pickSecurity(next: 'starttls' | 'ssl' | 'none') {
		const usual = { starttls: '587', ssl: '465', none: '25' };
		if (Object.values(usual).includes(port) || !port) port = usual[next];
		security = next;
	}
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<section class="card">
	<h2>✉️ {t('smtp.title')}</h2>
	<p class="small muted">{t('smtp.hint')}</p>
	{#if result?.smtpError}
		<div class="alert danger small">{t(result.smtpError)}{#if result.smtpDetail}<br /><code class="tiny">{result.smtpDetail}</code>{/if}</div>
	{/if}
	{#if result?.smtpSaved}<div class="alert success small">{t(`smtp.done.${result.smtpSaved}`)}</div>{/if}

	{#if view.source === 'env'}
		<p class="alert small">🔒 {t('smtp.from_env')}</p>
		<p class="small">{view.host}:{view.port} · {t(`smtp.security.${view.security}`)}{view.user ? ` · ${view.user}` : ''}{view.from ? ` · ${view.from}` : ''}</p>
	{:else}
		<form method="POST" action="?/smtpSave" use:enhance={keep} class="smtp">
			<div class="grid">
				<div class="field wide">
					<label for="smtp-host">{t('smtp.host')}</label>
					<input id="smtp-host" name="host" bind:value={host} placeholder="smtp.example.com" autocomplete="off" required />
				</div>
				<div class="field">
					<label for="smtp-security">{t('smtp.security_label')}</label>
					<select id="smtp-security" name="security" bind:value={() => security, pickSecurity}>
						<option value="starttls">{t('smtp.security.starttls')}</option>
						<option value="ssl">{t('smtp.security.ssl')}</option>
						<option value="none">{t('smtp.security.none')}</option>
					</select>
				</div>
				<div class="field">
					<label for="smtp-port">{t('smtp.port')}</label>
					<input id="smtp-port" name="port" inputmode="numeric" bind:value={port} required />
				</div>
				<div class="field">
					<label for="smtp-user">{t('smtp.user')}</label>
					<input id="smtp-user" name="user" bind:value={user} autocomplete="off" />
				</div>
				<div class="field">
					<label for="smtp-pass">{t('smtp.pass')}</label>
					<input id="smtp-pass" name="pass" type="password" autocomplete="new-password" placeholder={view.hasPassword ? t('smtp.pass_kept') : ''} />
					{#if view.hasPassword}<label class="check tiny"><input type="checkbox" name="clear_pass" /> {t('smtp.pass_clear')}</label>{/if}
				</div>
				<div class="field wide">
					<label for="smtp-from">{t('smtp.from')}</label>
					<input id="smtp-from" name="from" bind:value={from} placeholder="Packwise <packwise@example.com>" autocomplete="off" />
				</div>
			</div>
			<div class="row wrap actions">
				<button class="btn primary">{t('common.save')}</button>
				{#if view.source === 'db'}<button class="btn ghost danger" formaction="?/smtpClear" formnovalidate>{t('smtp.clear')}</button>{/if}
			</div>
			<div class="row wrap test">
				<input name="test_to" type="email" class="grow" placeholder={t('smtp.test_to')} aria-label={t('smtp.test_to')} />
				<button class="btn" formaction="?/smtpTest">📨 {t('smtp.test')}</button>
			</div>
			<p class="tiny muted">{t('smtp.test_hint')}</p>
		</form>
	{/if}
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem 0.8rem;
	}
	.wide {
		grid-column: 1 / -1;
	}
	.actions,
	.test {
		margin-top: 0.75rem;
		gap: 0.5rem;
	}
	@media (max-width: 560px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
