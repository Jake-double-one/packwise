<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { api, clientId, live } from '$lib/api';
	import { useI18n } from '$lib/i18n';
	import { childrenMap, depthOf, mergeNodes, MAX_GROUP_DEPTH, ancestors } from '$lib/tree';
	import type { TemplateNode } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import NodeEditor from '$lib/components/NodeEditor.svelte';
	import RuleSummary from '$lib/components/RuleSummary.svelte';

	let { data } = $props();
	const { t } = useI18n();

	let nodes = $derived<TemplateNode[]>(data.nodes);
	let errorMsg = $state('');
	let query = $state('');
	let selectedId = $state<string | null>(null);
	let newCategory = $state('');
	const collapsed = new SvelteSet<string>();
	const drafts = $state<Record<string, string>>({});
	let dragId = $state<string | null>(null);
	let dropTarget = $state<string | null>(null);

	const tree = $derived(childrenMap(nodes));
	const selected = $derived(nodes.find((n) => n.id === selectedId) ?? null);
	const bagById = $derived(new Map(data.bags.map((b) => [b.id, b])));
	const personById = $derived(new Map(data.persons.map((p) => [p.id, p])));
	const itemCount = $derived(nodes.filter((n) => n.kind === 'item').length);

	/** ids visible under the current search (matches + their ancestors) */
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return null;
		const set = new Set<string>();
		for (const n of nodes) {
			if (n.name.toLowerCase().includes(q)) {
				set.add(n.id);
				ancestors(nodes, n.parent_id).forEach((a) => set.add(a.id));
			}
		}
		return set;
	});

	onMount(() =>
		live('/api/template/live', {
			nodes: (msg: { upsert: TemplateNode[]; removed: string[]; client: string | null }) => {
				if (msg.client !== clientId) nodes = mergeNodes(nodes, msg.upsert, msg.removed);
			}
		})
	);

	async function send(op: Record<string, unknown>) {
		errorMsg = '';
		try {
			const res = await api<{ upsert: TemplateNode[]; removed: string[] }>('/api/template', { ...op, client: clientId });
			nodes = mergeNodes(nodes, res.upsert, res.removed);
			return res;
		} catch (err) {
			errorMsg = t((err as Error).message);
			return null;
		}
	}

	async function addNode(parentId: string | null, kind: 'group' | 'item', name: string) {
		if (!name.trim()) return;
		const res = await send({ op: 'add', parent_id: parentId, kind, name });
		if (res && parentId) collapsed.delete(parentId);
		return res;
	}

	async function addSubgroup(parentId: string) {
		const name = prompt(t('template.new_subgroup'));
		if (name) await addNode(parentId, 'group', name);
	}

	function siblingsOf(n: TemplateNode) {
		return tree.get(n.parent_id) ?? [];
	}

	function move(n: TemplateNode, delta: number) {
		const sibs = siblingsOf(n);
		const index = sibs.findIndex((s) => s.id === n.id) + delta;
		if (index < 0 || index >= sibs.length) return;
		send({ op: 'move', id: n.id, parent_id: n.parent_id, index });
	}

	function outdent(n: TemplateNode) {
		const parent = nodes.find((p) => p.id === n.parent_id);
		if (!parent) return;
		const index = (tree.get(parent.parent_id) ?? []).findIndex((s) => s.id === parent.id) + 1;
		send({ op: 'move', id: n.id, parent_id: parent.parent_id, index });
	}

	function indent(n: TemplateNode) {
		const sibs = siblingsOf(n);
		const prev = sibs
			.slice(0, sibs.findIndex((s) => s.id === n.id))
			.reverse()
			.find((s) => s.kind === 'group');
		if (!prev) return;
		send({ op: 'move', id: n.id, parent_id: prev.id, index: (tree.get(prev.id) ?? []).length });
		collapsed.delete(prev.id);
	}

	async function remove(n: TemplateNode) {
		const count = n.kind === 'group' ? nodes.filter((x) => ancestors(nodes, x.id).some((a) => a.id === n.id)).length - 1 : 0;
		const msg = n.kind === 'group' ? t('template.confirm_delete_group', { name: n.name, count }) : t('template.confirm_delete_item', { name: n.name });
		if (!confirm(msg)) return;
		await send({ op: 'delete', id: n.id });
		if (selectedId === n.id) selectedId = null;
	}

	function qtyLabel(n: TemplateNode) {
		if (n.qty_mode === 'fixed') return n.qty !== 1 ? `×${n.qty}` : '';
		let s = t(n.qty_mode === 'per_day' ? 'qty.short_day' : 'qty.short_night', { qty: n.qty });
		if (n.qty_extra) s += ` ${n.qty_extra > 0 ? '+' : ''}${n.qty_extra}`;
		if (n.qty_max) s += ` ≤${n.qty_max}`;
		return s;
	}

	function onDrop(target: TemplateNode) {
		const id = dragId;
		dragId = dropTarget = null;
		if (!id || id === target.id) return;
		if (target.kind === 'group') {
			send({ op: 'move', id, parent_id: target.id, index: (tree.get(target.id) ?? []).length });
			collapsed.delete(target.id);
		} else {
			const sibs = (tree.get(target.parent_id) ?? []).filter((s) => s.id !== id);
			send({ op: 'move', id, parent_id: target.parent_id, index: sibs.findIndex((s) => s.id === target.id) });
		}
	}

	function toggleAll() {
		const groups = nodes.filter((n) => n.kind === 'group');
		if (collapsed.size) collapsed.clear();
		else groups.forEach((g) => collapsed.add(g.id));
	}
</script>

<svelte:head><title>{t('nav.template')} · Packwise</title></svelte:head>

<div class="container">
	<div class="row between wrap head">
		<div>
			<h1>{t('template.title')}</h1>
			<p class="muted small">{t('template.subtitle', { count: itemCount })}</p>
		</div>
		<div class="row">
			<a class="btn" href="/import">📥 {t('nav.import')}</a>
		</div>
	</div>

	<div class="row toolbar">
		<input type="search" class="grow" placeholder={t('template.search')} bind:value={query} />
		<button class="btn" onclick={toggleAll} title={t('template.toggle_all')}>{collapsed.size ? '⊞' : '⊟'}</button>
	</div>

	{#if errorMsg}<div class="alert danger">{errorMsg}</div>{/if}
	{#if !data.canEdit}<div class="alert">{t('template.read_only')}</div>{/if}

	{#if nodes.length === 0}
		<div class="card empty">
			<div class="big">📋</div>
			<p>{t('template.empty')}</p>
		</div>
	{/if}

	{#snippet row(n: TemplateNode, depth: number)}
		{#if !visible || visible.has(n.id)}
			{#if n.kind === 'group'}
				{@const kids = tree.get(n.id) ?? []}
				{@const open = !collapsed.has(n.id) || !!visible}
				<section class="group depth-{depth}" class:drop={dropTarget === n.id}>
					<div
						class="group-head row"
						draggable={data.canEdit}
						ondragstart={() => (dragId = n.id)}
						ondragover={(e) => { if (dragId) { e.preventDefault(); dropTarget = n.id; } }}
						ondragleave={() => dropTarget === n.id && (dropTarget = null)}
						ondrop={(e) => { e.preventDefault(); onDrop(n); }}
						role="treeitem"
						aria-selected="false"
						aria-expanded={open}
						tabindex="-1"
					>
						<button class="btn ghost icon caret" onclick={() => (collapsed.has(n.id) ? collapsed.delete(n.id) : collapsed.add(n.id))} aria-label={open ? t('common.collapse') : t('common.expand')}>
							{open ? '▾' : '▸'}
						</button>
						<button class="name-btn grow" onclick={() => (selectedId = n.id)}>
							<span class="gname">{n.name}</span>
							<span class="count">{kids.length}</span>
							<RuleSummary rules={n.rules} />
						</button>
						{#if data.canEdit}
							<div class="actions">
								{#if depth < MAX_GROUP_DEPTH}<button class="btn ghost icon" title={t('template.add_subgroup')} onclick={() => addSubgroup(n.id)}>📁</button>{/if}
								<button class="btn ghost icon" title={t('common.move_up')} onclick={() => move(n, -1)}>↑</button>
								<button class="btn ghost icon" title={t('common.move_down')} onclick={() => move(n, 1)}>↓</button>
								{#if n.parent_id}<button class="btn ghost icon" title={t('template.outdent')} onclick={() => outdent(n)}>⇤</button>{/if}
								<button class="btn ghost icon" title={t('common.delete')} onclick={() => remove(n)}>🗑</button>
							</div>
						{/if}
					</div>
					{#if open}
						<div class="children">
							{#each kids as child (child.id)}
								{@render row(child, child.kind === 'group' ? depth + 1 : depth)}
							{/each}
							{#if data.canEdit}
								<form class="add-row row" onsubmit={async (e) => { e.preventDefault(); const name = drafts[n.id] ?? ''; drafts[n.id] = ''; await addNode(n.id, 'item', name); }}>
									<span class="plus">+</span>
									<input class="grow" placeholder={t('template.add_item')} bind:value={drafts[n.id]} />
								</form>
							{/if}
						</div>
					{/if}
				</section>
			{:else}
				{@const bag = n.bag_id ? bagById.get(n.bag_id) : null}
				{@const person = n.person_id ? personById.get(n.person_id) : null}
				<div
					class="item row"
					class:drop={dropTarget === n.id}
					style={bag ? `--bag:${bag.color}` : ''}
					class:has-bag={!!bag}
					draggable={data.canEdit}
					ondragstart={() => (dragId = n.id)}
					ondragover={(e) => { if (dragId) { e.preventDefault(); dropTarget = n.id; } }}
					ondragleave={() => dropTarget === n.id && (dropTarget = null)}
					ondrop={(e) => { e.preventDefault(); onDrop(n); }}
					role="treeitem"
					aria-selected={selectedId === n.id}
					tabindex="-1"
				>
					<button class="name-btn grow" onclick={() => (selectedId = n.id)}>
						<span class="iname">{n.name}</span>
						{#if qtyLabel(n)}<span class="badge">{qtyLabel(n)}</span>{/if}
						{#if n.per_person}<span class="badge" title={t('template.per_person')}>👥</span>{/if}
						{#if n.needs_power}<span title={t('template.needs_power')}>⚡</span>{/if}
						{#if n.consumable}<span title={t('template.consumable')}>🧴</span>{/if}
						<RuleSummary rules={n.rules} />
					</button>
					{#if bag}<span class="bag-tag" title={bag.name}>{bag.icon}</span>{/if}
					{#if person}<Avatar name={person.name} color={person.color} size={22} />{/if}
					{#if data.canEdit}
						<div class="actions">
							<button class="btn ghost icon" title={t('common.move_up')} onclick={() => move(n, -1)}>↑</button>
							<button class="btn ghost icon" title={t('common.move_down')} onclick={() => move(n, 1)}>↓</button>
							<button class="btn ghost icon hide-sm" title={t('template.indent')} onclick={() => indent(n)}>⇥</button>
							{#if n.parent_id}<button class="btn ghost icon hide-sm" title={t('template.outdent')} onclick={() => outdent(n)}>⇤</button>{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/snippet}

	<div class="tree" role="tree">
		{#each tree.get(null) ?? [] as n (n.id)}
			{@render row(n, 1)}
		{/each}
	</div>

	{#if data.canEdit}
		<form class="card new-cat row" onsubmit={async (e) => { e.preventDefault(); const name = newCategory; newCategory = ''; await addNode(null, 'group', name); }}>
			<input class="grow" placeholder={t('template.new_category')} bind:value={newCategory} />
			<button class="btn primary">+ {t('template.add_category')}</button>
		</form>
	{/if}
	<p class="tiny muted">{t('template.tip')}</p>
</div>

{#if selected}
	<NodeEditor
		node={selected}
		persons={data.persons}
		bags={data.bags}
		canEdit={data.canEdit}
		onpatch={(patch) => send({ op: 'update', id: selected.id, patch })}
		ondelete={() => remove(selected)}
		onclose={() => (selectedId = null)}
	/>
{/if}

<style>
	.head {
		align-items: flex-start;
	}
	.toolbar {
		margin-bottom: 0.9rem;
	}
	.tree {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		margin-bottom: 1rem;
	}
	.group {
		border-radius: var(--radius);
	}
	.group.depth-1 {
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		padding: 0.35rem 0.5rem 0.5rem;
	}
	.group.depth-2,
	.group.depth-3 {
		margin: 0.35rem 0 0.2rem;
		border-left: 2px solid var(--border);
		padding-left: 0.5rem;
	}
	.group.drop > .group-head,
	.item.drop {
		outline: 2px dashed var(--accent);
		outline-offset: 2px;
	}
	.group-head {
		gap: 0.2rem;
		min-height: 2.5rem;
	}
	.caret {
		min-width: 1.8rem;
		color: var(--text-3);
	}
	.name-btn {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		padding: 0.35rem 0.2rem;
		cursor: pointer;
		min-width: 0;
	}
	.gname {
		font-weight: 700;
	}
	.depth-1 > .group-head .gname {
		font-size: 1.05rem;
	}
	.count {
		font-size: 0.75rem;
		color: var(--text-3);
	}
	.children {
		padding-left: 1.2rem;
	}
	.item {
		gap: 0.3rem;
		border-radius: var(--radius-sm);
		padding: 0 0.3rem;
		min-height: 2.4rem;
	}
	.item:hover {
		background: var(--surface-2);
	}
	.item.has-bag {
		background: color-mix(in srgb, var(--bag) var(--tint), transparent);
		border-left: 3px solid var(--bag);
		margin: 2px 0;
	}
	.iname {
		overflow-wrap: anywhere;
	}
	.bag-tag {
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		opacity: 0.35;
		transition: opacity 0.15s;
	}
	.group-head:hover .actions,
	.item:hover .actions,
	.actions:focus-within {
		opacity: 1;
	}
	.actions .btn {
		min-width: 1.9rem;
		min-height: 1.9rem;
		padding: 0.15rem;
		font-size: 0.85rem;
	}
	.add-row {
		padding: 0 0.3rem;
	}
	.add-row .plus {
		color: var(--text-3);
		font-weight: 700;
		width: 1rem;
		text-align: center;
	}
	.add-row input {
		background: transparent;
		border-color: transparent;
		padding: 0.4rem 0.4rem;
	}
	.add-row input:focus {
		background: var(--surface-2);
	}
	.new-cat {
		margin-bottom: 0.75rem;
	}
	@media (max-width: 640px) {
		.children {
			padding-left: 0.6rem;
		}
		.hide-sm {
			display: none;
		}
		.actions {
			opacity: 0.6;
		}
	}
</style>
