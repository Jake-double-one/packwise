<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { invalidateAll } from '$app/navigation';
	import { api, describeError } from '#lib/api.js';
	import { useI18n } from '#lib/i18n/index.js';
	import { htmlToText, normalise, parseJson, parseText, toTree, type ImportLine } from '#lib/importer.js';
	import { childrenMap, MAX_GROUP_DEPTH } from '#lib/tree.js';
	import type { TemplateNode } from '#lib/types.js';

	let { data } = $props();
	const { t } = useI18n();

	let text = $state('');
	let lines = $state<ImportLine[]>([]);
	let step = $state<'input' | 'review' | 'done'>('input');
	let result = $state<{ created: number; groups: number; skipped: number; unmapped?: number } | null>(null);
	let busy = $state(false);
	let errorMsg = $state('');

	const existingItems = $derived(new Set(data.existing.filter((n) => n.kind === 'item').map((n) => n.name.trim().toLowerCase())));
	const exists = (name: string) => existingItems.has(name.trim().toLowerCase());
	const selectedCount = $derived(lines.filter((l) => l.selected && l.kind === 'item').length);

	// ── from another household of mine ──────────────────────────────────────
	type Remote = { nodes: TemplateNode[]; persons: { id: string; name: string }[]; bags: { id: string; name: string }[] };
	let source = $state<'text' | 'household'>('text');
	let fromId = $state<string | null>(null);
	let remote = $state<Remote | null>(null);
	let loading = $state(false);
	/** ticked items of the other template (categories follow their items) */
	const picked = new SvelteSet<string>();
	const remoteTree = $derived(childrenMap(remote?.nodes ?? []));
	const remoteNames = $derived({
		persons: new Map((remote?.persons ?? []).map((p) => [p.id, p.name])),
		bags: new Map((remote?.bags ?? []).map((b) => [b.id, b.name]))
	});
	const pickedCount = $derived(picked.size);

	function itemsBelow(id: string | null): TemplateNode[] {
		return (remoteTree.get(id) ?? []).flatMap((c) => (c.kind === 'item' ? [c] : itemsBelow(c.id)));
	}
	async function loadHousehold(id: string) {
		fromId = id;
		remote = null;
		errorMsg = '';
		loading = true;
		try {
			const res = await fetch(`/api/import/${id}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as Remote;
			remote = data;
			// everything that is not here yet is ticked to start with
			picked.clear();
			for (const n of data.nodes) if (n.kind === 'item' && !exists(n.name)) picked.add(n.id);
		} catch (err) {
			errorMsg = describeError(err, t);
		} finally {
			loading = false;
		}
	}
	function groupState(id: string): 'all' | 'some' | 'none' {
		const items = itemsBelow(id);
		const n = items.filter((i) => picked.has(i.id)).length;
		return n === 0 ? 'none' : n === items.length ? 'all' : 'some';
	}
	function pickGroup(id: string, on: boolean) {
		for (const i of itemsBelow(id)) if (on) picked.add(i.id);
		else picked.delete(i.id);
	}
	function pickAll(on: boolean) {
		for (const i of itemsBelow(null)) if (on) picked.add(i.id);
		else picked.delete(i.id);
	}
	async function importPicked() {
		busy = true;
		errorMsg = '';
		try {
			result = await api('/api/import', { from: fromId, ids: [...picked] });
			step = 'done';
			await invalidateAll();
		} catch (err) {
			errorMsg = describeError(err, t);
		} finally {
			busy = false;
		}
	}

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
			await invalidateAll(); // "exists" badges of the next round know the new items
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
		{#if data.households.length}
			<div class="seg source" role="tablist">
				<button role="tab" aria-selected={source === 'text'} class:on={source === 'text'} onclick={() => (source = 'text')}>📄 {t('import.source_text')}</button>
				<button role="tab" aria-selected={source === 'household'} class:on={source === 'household'} onclick={() => { source = 'household'; if (!fromId) loadHousehold(data.households[0].id); }}>🏠 {t('import.source_household')}</button>
			</div>
		{/if}
		{#if source === 'household'}
		<section class="card">
			<p class="muted small">{t('import.household_intro')}</p>
			{#if data.households.length > 1}
				<div class="seg wrap" role="tablist">
					{#each data.households as h (h.id)}
						<button role="tab" aria-selected={fromId === h.id} class:on={fromId === h.id} onclick={() => loadHousehold(h.id)}>{h.name}</button>
					{/each}
				</div>
			{/if}
			{#if loading}
				<p class="muted small">…</p>
			{:else if remote}
				{#if !remote.nodes.length}
					<p class="muted">{t('import.household_empty')}</p>
				{:else}
					<div class="row between wrap">
						<p class="tiny muted grow">{t('import.household_mapping')}</p>
						<div class="row">
							<button class="btn small" onclick={() => pickAll(true)}>{t('import.select_all')}</button>
							<button class="btn small" onclick={() => pickAll(false)}>{t('import.select_none')}</button>
						</div>
					</div>
					{#snippet remoteNode(n: TemplateNode, level: number)}
						{#if n.kind === 'group'}
							{@const st = groupState(n.id)}
							<li class="line group" class:off={st === 'none'} style="--lvl:{level}">
								<input type="checkbox" checked={st === 'all'} indeterminate={st === 'some'} onchange={(e) => pickGroup(n.id, e.currentTarget.checked)} aria-label={n.name} />
								<span class="nm grow">📁 {n.name}</span>
							</li>
							{#each remoteTree.get(n.id) ?? [] as c (c.id)}{@render remoteNode(c, level + 1)}{/each}
						{:else}
							{@const person = n.person_id ? remoteNames.persons.get(n.person_id) : null}
							{@const bag = n.bag_id ? remoteNames.bags.get(n.bag_id) : null}
							<li class="line" class:off={!picked.has(n.id)} style="--lvl:{level}">
								<input type="checkbox" checked={picked.has(n.id)} onchange={(e) => (e.currentTarget.checked ? picked.add(n.id) : picked.delete(n.id))} aria-label={n.name} />
								<span class="nm grow">{n.name}</span>
								{#if n.qty > 1 || n.qty_mode !== 'fixed'}<span class="badge">×{n.qty}{n.qty_mode === 'per_day' ? '/d' : n.qty_mode === 'per_night' ? '/n' : ''}</span>{/if}
								{#if n.needs_power}<span class="tiny">⚡</span>{/if}
								{#if n.consumable}<span class="tiny">🧴</span>{/if}
								{#if person}<span class="badge">{person}</span>{/if}
								{#if bag}<span class="badge">🧳 {bag}</span>{/if}
								{#if exists(n.name)}<span class="badge exists" title={t('import.exists_hint')}>{t('import.exists')}</span>{/if}
							</li>
						{/if}
					{/snippet}
					<ul class="lines">
						{#each remoteTree.get(null) ?? [] as n (n.id)}{@render remoteNode(n, 0)}{/each}
					</ul>
					<div class="row wrap actions">
						<div class="grow"></div>
						<span class="small muted">{t('import.selected', { count: pickedCount })}</span>
						<button class="btn primary" onclick={importPicked} disabled={busy || !data.canEdit || !pickedCount}>
							{busy ? t('common.saving') : t('import.do_import')}
						</button>
					</div>
					<p class="tiny muted">{t('import.merge_hint')}</p>
				{/if}
			{/if}
		</section>
		{:else}
		<section class="card">
			<p class="muted small">{t('import.intro')}</p>
			<textarea rows="14" bind:value={text} onpaste={onPaste} placeholder={t('import.placeholder')} aria-label={t('import.title')}></textarea>
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
		{/if}
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
			{#if result.unmapped}<p class="small muted">{t('import.unmapped', { count: result.unmapped })}</p>{/if}
			<div class="row" style="justify-content:center">
				<a class="btn primary" href="/template">📋 {t('nav.template')}</a>
				<button class="btn" onclick={() => { text = ''; step = 'input'; if (fromId) loadHousehold(fromId); }}>{t('import.again')}</button>
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
	.seg {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px;
	}
	.seg button {
		border: none;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	.source {
		margin-bottom: 0.75rem;
	}
	.seg.wrap {
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.line span.nm {
		min-height: 2.2rem;
		display: inline-flex;
		align-items: center;
	}
	.line .nm:focus {
		background: var(--surface-2);
	}
	.line.group .nm {
		font-weight: 700;
	}
	.line.off .nm {
		color: var(--text-3);
	}
	.line.off input.nm {
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
