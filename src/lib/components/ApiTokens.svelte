<script lang="ts">
	import { enhance } from '$app/forms';
	import { copyText } from '#lib/clipboard.js';
	import { timeAgo, useI18n } from '#lib/i18n/index.js';
	import { toast } from '#lib/toast.svelte.js';

	interface Token {
		id: string;
		name: string;
		scope: 'read' | 'write';
		created_at: number;
		last_used_at: number | null;
		preview: string;
	}
	let {
		tokens,
		max,
		url,
		created,
		error
	}: { tokens: Token[]; max: number; url: string; created?: { id: string; token: string } | null; error?: string | null } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	/** revealed tokens (fetched on demand, never part of the page) */
	const shown = $state<Record<string, string>>({});
	$effect(() => {
		if (created) shown[created.id] = created.token; // a new token is shown right away
	});

	async function fetchToken(id: string): Promise<string | null> {
		if (shown[id]) return shown[id];
		const res = await fetch(`/api/tokens/${id}`);
		if (!res.ok) {
			toast(t('tokens.err.reveal'));
			return null;
		}
		return (await res.json()).token as string;
	}
	async function toggle(id: string) {
		if (shown[id]) delete shown[id];
		else {
			const tok = await fetchToken(id);
			if (tok) shown[id] = tok;
		}
	}
	async function copy(text: string | null) {
		if (!text) return;
		await copyText(text);
		toast(t('common.copied'), 'info', 1500);
	}
	const mask = (tk: Token) => `${tk.preview}${'•'.repeat(18)}`;
	let help = $state<'claude' | 'chatgpt' | 'grok' | null>(null);
</script>

<section class="card">
	<h2>🤖 {t('tokens.title')}</h2>
	<p class="small muted">{t('tokens.intro')}</p>
	{#if error}<div class="alert danger small">{t(error)}</div>{/if}

	<ul class="tokens">
		{#each tokens as tk (tk.id)}
			<li>
				<div class="row wrap head">
					<form method="POST" action="?/tokenRename" use:enhance={() => async ({ update }) => update({ reset: false })} class="grow">
						<input type="hidden" name="id" value={tk.id} />
						<input class="name" name="name" value={tk.name} aria-label={t('tokens.name')} onchange={(e) => e.currentTarget.form?.requestSubmit()} />
					</form>
					<span class="badge" class:write={tk.scope === 'write'}>{tk.scope === 'write' ? `✏️ ${t('tokens.scope_write')}` : `👁 ${t('tokens.scope_read')}`}</span>
				</div>
				<div class="row secret">
					<code class="grow">{shown[tk.id] ?? mask(tk)}</code>
					<button class="btn ghost icon" title={shown[tk.id] ? t('notes.hide') : t('notes.show')} onclick={() => toggle(tk.id)}>{shown[tk.id] ? '🙈' : '👁'}</button>
					<button class="btn ghost icon" title={t('common.copy')} onclick={async () => copy(await fetchToken(tk.id))}>📋</button>
					<form method="POST" action="?/tokenDelete" use:enhance={({ cancel }) => { if (!confirm(t('tokens.confirm_delete', { name: tk.name }))) cancel(); }}>
						<input type="hidden" name="id" value={tk.id} />
						<button class="btn ghost icon" title={t('common.delete')}>🗑</button>
					</form>
				</div>
				<div class="tiny muted">
					{t('tokens.created', { when: timeAgo(tk.created_at, i18n.locale) })} ·
					{tk.last_used_at ? t('tokens.used', { when: timeAgo(tk.last_used_at, i18n.locale) }) : t('tokens.never_used')}
				</div>
				{#if created?.id === tk.id}<div class="alert success small">{t('tokens.created_hint')}</div>{/if}
			</li>
		{/each}
	</ul>

	{#if tokens.length < max}
		<form method="POST" action="?/tokenCreate" use:enhance class="row wrap create">
			<input class="grow" name="name" required maxlength="60" placeholder={t('tokens.name_placeholder')} aria-label={t('tokens.name')} />
			<select name="scope" aria-label={t('tokens.scope')}>
				<option value="read">👁 {t('tokens.scope_read')}</option>
				<option value="write">✏️ {t('tokens.scope_write')}</option>
			</select>
			<button class="btn primary small">+ {t('tokens.create')}</button>
		</form>
		<p class="tiny muted">{t('tokens.count', { count: tokens.length, max })}</p>
	{:else}
		<p class="tiny muted">{t('tokens.err.max')}</p>
	{/if}

	<h3>{t('tokens.connect')}</h3>
	<div class="row secret">
		<code class="grow">{url}</code>
		<button class="btn ghost icon" title={t('common.copy')} onclick={() => copy(url)}>📋</button>
	</div>
	<div class="seg-help row wrap">
		{#each [['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['grok', 'Grok']] as [key, label]}
			<button class="chip" class:on={help === key} onclick={() => (help = help === key ? null : (key as typeof help))}>{label}</button>
		{/each}
	</div>
	{#if help}
		<div class="help small">
			{#if help === 'claude'}
				<p>{t('tokens.help_claude_app')}</p>
				<code class="block">{url}/&lt;TOKEN&gt;</code>
				<p>{t('tokens.help_claude_code')}</p>
				<code class="block">claude mcp add --transport http packwise {url} --header "Authorization: Bearer &lt;TOKEN&gt;"</code>
			{:else if help === 'chatgpt'}
				<p>{t('tokens.help_chatgpt')}</p>
				<code class="block">{url}/&lt;TOKEN&gt;</code>
			{:else}
				<p>{t('tokens.help_grok')}</p>
				<code class="block">{`{ "type": "mcp", "server_url": "${url}", "server_label": "packwise", "authorization": "Bearer <TOKEN>" }`}</code>
			{/if}
			<p class="tiny muted">⚠️ {t('tokens.help_https')}</p>
		</div>
	{/if}
</section>

<style>
	.tokens {
		list-style: none;
		margin: 0.5rem 0;
		padding: 0;
	}
	.tokens li {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.7rem;
		margin-bottom: 0.5rem;
	}
	.head {
		gap: 0.5rem;
		align-items: center;
	}
	.name {
		font-weight: 700;
		border-color: transparent;
		background: transparent;
		padding: 0.2rem 0.3rem;
	}
	.name:focus {
		background: var(--surface-2);
	}
	.badge.write {
		background: var(--warning-soft, var(--accent-soft));
	}
	.secret {
		align-items: center;
		gap: 0.2rem;
		margin: 0.25rem 0;
	}
	code {
		font-family: ui-monospace, monospace;
		font-size: 0.82rem;
		background: var(--surface-2);
		border-radius: 6px;
		padding: 0.35rem 0.5rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	code.block {
		display: block;
		margin: 0.3rem 0 0.6rem;
	}
	.create {
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.create select {
		width: auto;
	}
	h3 {
		font-size: 0.9rem;
		margin: 1rem 0 0.3rem;
	}
	.seg-help {
		gap: 0.35rem;
		margin: 0.4rem 0;
	}
	.help {
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.8rem;
	}
	.help code {
		background: var(--surface);
	}
</style>
