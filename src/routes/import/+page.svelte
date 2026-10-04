<script lang="ts">
	import { api } from '$lib/api';
	import { useI18n } from '$lib/i18n';
	import { htmlToText, normalise, parseJson, parseText, toTree, type ImportLine } from '$lib/importer';
	import { MAX_GROUP_DEPTH } from '$lib/tree';

	let { data } = $props();
	const { t } = useI18n();

	let text = $state('');
	let lines = $state<ImportLine[]>([]);
	let step = $state<'input' | 'review' | 'done'>('input');
	let result = $state<{ created: number; groups: number; skipped: number } | null>(null);
	let busy = $state(false);
	let errorMsg = $state('');

	const existingItems = $derived(new Set(data.existing.filter((n) => n.kind === 'item').map((n) => n.name.trim().toLowerCase())));
	const selectedCount = $derived(lines.filter((l) => l.selected && l.kind === 'item').length);

	function onPaste(e: ClipboardEvent) {
		const html = e.clipboardData?.getData('text/html');
		if (!html) return;
		const converted = htmlToText(html);
		if (!converted.trim()) return;
		e.preventDefault();
		const el = e.currentTarget as HTMLTextAreaElement;
		text = text.slice(0, el.selectionStart) + converted + text.slice(el.selectionEnd);
	}

	async function onFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		text = await file.text();
	}

	function analyse() {
		errorMsg = '';
		const parsed = text.trim().startsWith('{') ? parseJson(text) : parseText(text);
		if (!parsed || !parsed.length) {
			errorMsg = t('import.nothing');
			return;
		}
		lines = parsed.map((l) => {
			const exists = l.kind === 'item' && existingItems.has(l.name.trim().toLowerCase());
			return { ...l, exists, selected: !exists };
		});
		step = 'review';
	}

	function shift(i: number, delta: number) {
		const next = lines.map((l) => ({ ...l }));
		next[i].level = Math.max(0, next[i].level + delta);
		lines = normalise(next);
	}

	function toggleKind(i: number) {
		lines = normalise(lines.map((l, j) => (j === i ? { ...l, kind: l.kind === 'group' ? 'item' : 'group' } : l)));
	}

	function setAll(value: boolean) {
		lines = lines.map((l) => ({ ...l, selected: value }));
	}

	async function doImport() {
		busy = true;
		errorMsg = '';
		try {
			result = await api('/api/import', { nodes: toTree(lines) });
			step = 'done';
		} catch (err) {
			errorMsg = t((err as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t('nav.import')} · Packwise</title></svelte:head>

<div class="container">
	<h1>📥 {t('import.title')}</h1>
	{#if !data.canEdit}<div class="alert">{t('template.read_only')}</div>{/if}
	{#if errorMsg}<div class="alert danger">{errorMsg}</div>{/if}

	{#if step === 'input'}
		<section class="card">
			<p class="muted small">{t('import.intro')}</p>
			<textarea rows="14" bind:value={text} onpaste={onPaste} placeholder={t('import.placeholder')}></textarea>
			<div class="row wrap actions">
				<label class="btn file">📄 {t('import.file')}<input type="file" accept=".txt,.md,.markdown,.json,text/plain" onchange={onFile} hidden /></label>
				<div class="grow"></div>
				<button class="btn primary" onclick={analyse} disabled={!text.trim()}>{t('import.analyse')} →</button>
			</div>
			<details class="tiny muted help">
				<summary>{t('import.format_help')}</summary>
				<pre>{t('import.example')}</pre>
			</details>
		</section>
	{:else if step === 'review'}
		<section class="card">
			<div class="row between wrap">
				<p class="small muted grow">{t('import.review_hint')}</p>
				<div class="row">
					<button class="btn small" onclick={() => setAll(true)}>{t('import.select_all')}</button>
					<button class="btn small" onclick={() => setAll(false)}>{t('import.select_none')}</button>
				</div>
			</div>
			<ul class="lines">
				{#each lines as l, i (l.uid)}
					<li class="line" class:group={l.kind === 'group'} class:off={!l.selected} style="--lvl:{l.level}">
						<input type="checkbox" bind:checked={lines[i].selected} aria-label={l.name} />
						<input class="nm grow" bind:value={lines[i].name} />
						{#if l.qty > 1}<span class="badge">×{l.qty}</span>{/if}
						{#if l.exists}<span class="badge exists" title={t('import.exists_hint')}>{t('import.exists')}</span>{/if}
						<button class="btn ghost icon" title={t('import.toggle_kind')} onclick={() => toggleKind(i)} disabled={l.kind === 'item' && l.level >= MAX_GROUP_DEPTH}>{l.kind === 'group' ? '📁' : '•'}</button>
						<button class="btn ghost icon" title={t('template.outdent')} onclick={() => shift(i, -1)} disabled={l.level === 0}>⇤</button>
						<button class="btn ghost icon" title={t('template.indent')} onclick={() => shift(i, 1)}>⇥</button>
					</li>
				{/each}
			</ul>
			<div class="row wrap actions">
				<button class="btn" onclick={() => (step = 'input')}>← {t('common.back')}</button>
				<div class="grow"></div>
				<span class="small muted">{t('import.selected', { count: selectedCount })}</span>
				<button class="btn primary" onclick={doImport} disabled={busy || !data.canEdit || !selectedCount}>
					{busy ? t('common.saving') : t('import.do_import')}
				</button>
			</div>
			<p class="tiny muted">{t('import.merge_hint')}</p>
		</section>
	{:else if result}
		<section class="card empty">
			<div class="big">✅</div>
			<p>{t('import.result', { created: result.created, groups: result.groups, skipped: result.skipped })}</p>
			<div class="row" style="justify-content:center">
				<a class="btn primary" href="/template">📋 {t('nav.template')}</a>
				<button class="btn" onclick={() => { text = ''; step = 'input'; }}>{t('import.again')}</button>
			</div>
		</section>
	{/if}

	<section class="card">
		<h2>💾 {t('import.backup')}</h2>
		<p class="small muted">{t('import.backup_hint')}</p>
		<a class="btn" href="/api/export" download>⬇️ {t('import.export_json')}</a>
	</section>
</div>

<style>
	textarea {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
	}
	.actions {
		margin-top: 0.75rem;
	}
	.file {
		cursor: pointer;
	}
	.help pre {
		white-space: pre-wrap;
		background: var(--surface-2);
		padding: 0.6rem;
		border-radius: 8px;
	}
	.lines {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.1rem 0 0.1rem calc(var(--lvl) * 1.4rem);
		border-bottom: 1px solid var(--border);
	}
	.line .nm {
		border-color: transparent;
		background: transparent;
		padding: 0.3rem 0.4rem;
	}
	.line .nm:focus {
		background: var(--surface-2);
	}
	.line.group .nm {
		font-weight: 700;
	}
	.line.off .nm {
		color: var(--text-3);
		text-decoration: line-through;
	}
	.exists {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.line .btn.icon {
		min-width: 2rem;
		min-height: 2rem;
	}
</style>
