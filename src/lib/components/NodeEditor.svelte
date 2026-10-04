<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import type { Bag, Person, Rules, TemplateNode } from '$lib/types';
	import { computeQty } from '$lib/generate';
	import RuleChips from './RuleChips.svelte';
	import Sheet from './Sheet.svelte';

	let {
		node,
		persons,
		bags,
		canEdit,
		onpatch,
		ondelete,
		onclose
	}: {
		node: TemplateNode;
		persons: Person[];
		bags: Bag[];
		canEdit: boolean;
		onpatch: (patch: Partial<TemplateNode>) => void;
		ondelete: () => void;
		onclose: () => void;
	} = $props();
	const { t } = useI18n();

	let name = $derived(node.name);
	let note = $derived(node.note);
	const example = $derived(computeQty(node, 7, 6, 0));
	const isItem = $derived(node.kind === 'item');
</script>

<Sheet title={isItem ? t('template.edit_item') : t('template.edit_group')} {onclose}>
	<div class="field">
		<label for="nname">{t('template.name')}</label>
		<input id="nname" bind:value={name} disabled={!canEdit} onchange={() => name.trim() && onpatch({ name })} />
	</div>

	{#if isItem}
		<div class="grid-2">
			<div class="field">
				<label for="bag">{t('template.bag')}</label>
				<select id="bag" value={node.bag_id ?? ''} disabled={!canEdit} onchange={(e) => onpatch({ bag_id: (e.currentTarget as HTMLSelectElement).value || null })}>
					<option value="">—</option>
					{#each bags as b}<option value={b.id}>{b.icon} {b.name}</option>{/each}
				</select>
			</div>
			<div class="field">
				<label for="person">{t('template.person')}</label>
				<select id="person" value={node.person_id ?? ''} disabled={!canEdit} onchange={(e) => onpatch({ person_id: (e.currentTarget as HTMLSelectElement).value || null })}>
					<option value="">{t('template.everyone')}</option>
					{#each persons as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
			</div>
		</div>
		{#if node.person_id}
			<p class="tiny muted">{t('template.person_hint')}</p>
		{:else}
			<label class="check field">
				<input type="checkbox" checked={node.per_person} disabled={!canEdit} onchange={(e) => onpatch({ per_person: (e.currentTarget as HTMLInputElement).checked })} />
				{t('template.per_person')}
			</label>
		{/if}

		<fieldset class="qty">
			<legend>{t('template.quantity')}</legend>
			<div class="row wrap">
				<select value={node.qty_mode} disabled={!canEdit} onchange={(e) => onpatch({ qty_mode: (e.currentTarget as HTMLSelectElement).value as TemplateNode['qty_mode'] })}>
					<option value="fixed">{t('qty.fixed')}</option>
					<option value="per_day">{t('qty.per_day')}</option>
					<option value="per_night">{t('qty.per_night')}</option>
				</select>
				<input type="number" min="0" step="0.5" value={node.qty} disabled={!canEdit} aria-label={t('template.quantity')} onchange={(e) => onpatch({ qty: +(e.currentTarget as HTMLInputElement).value })} />
			</div>
			{#if node.qty_mode !== 'fixed'}
				<div class="row wrap">
					<label class="inline">
						{t('qty.extra')}
						<input type="number" step="1" value={node.qty_extra} disabled={!canEdit} onchange={(e) => onpatch({ qty_extra: +(e.currentTarget as HTMLInputElement).value })} />
					</label>
					<label class="inline">
						{t('qty.max')}
						<input type="number" min="0" step="1" value={node.qty_max ?? ''} placeholder="∞" disabled={!canEdit} onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; onpatch({ qty_max: v === '' ? null : +v }); }} />
					</label>
				</div>
				<p class="tiny muted">{t('qty.example', { qty: example })}</p>
			{/if}
		</fieldset>

		<label class="check"><input type="checkbox" checked={node.needs_power} disabled={!canEdit} onchange={(e) => onpatch({ needs_power: (e.currentTarget as HTMLInputElement).checked })} /> ⚡ {t('template.needs_power')}</label>
		<label class="check field"><input type="checkbox" checked={node.consumable} disabled={!canEdit} onchange={(e) => onpatch({ consumable: (e.currentTarget as HTMLInputElement).checked })} /> 🧴 {t('template.consumable')}</label>
	{/if}

	<div class="field">
		<label for="note">{t('template.note')}</label>
		<textarea id="note" rows="2" bind:value={note} disabled={!canEdit} onchange={() => onpatch({ note })}></textarea>
	</div>

	<details open={Object.keys(node.rules ?? {}).length > 0}>
		<summary>{t('template.rules')} {#if Object.keys(node.rules ?? {}).length}<span class="badge">{Object.values(node.rules).reduce((n, c) => n + Object.keys(c).length, 0)}</span>{/if}</summary>
		{#if !isItem}<p class="tiny muted">{t('template.group_rules_hint')}</p>{/if}
		<RuleChips rules={node.rules ?? {}} disabled={!canEdit} perPerson={isItem && node.per_person && !node.person_id} onchange={(rules: Rules) => onpatch({ rules })} />
	</details>

	{#if node.not_needed_count > 0}
		<div class="alert warning small">{t('template.not_needed_count', { count: node.not_needed_count })}</div>
	{/if}

	{#snippet footer()}
		<div class="row between">
			{#if canEdit}<button class="btn danger" onclick={ondelete}>🗑 {t('common.delete')}</button>{:else}<span></span>{/if}
			<button class="btn primary" onclick={onclose}>{t('common.done')}</button>
		</div>
	{/snippet}
</Sheet>

<style>
	fieldset.qty {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.75rem;
		margin: 0 0 0.9rem;
	}
	legend {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text-2);
		padding: 0 0.3rem;
	}
	.qty select,
	.qty input {
		width: auto;
		max-width: 10rem;
	}
	.qty .row {
		margin-bottom: 0.4rem;
	}
	.inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		margin: 0;
	}
	.inline input {
		width: 5rem;
	}
	.check {
		margin-bottom: 0.5rem;
	}
	details summary {
		cursor: pointer;
		font-weight: 700;
		margin-bottom: 0.6rem;
	}
</style>
