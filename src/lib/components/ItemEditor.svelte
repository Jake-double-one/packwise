<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import type { Bag, Person, TripItem } from '$lib/types';
	import Sheet from './Sheet.svelte';

	let {
		item,
		persons,
		bags,
		templateState,
		canEditTemplate,
		onpatch,
		ondelete,
		onpromote,
		onsync,
		onclose
	}: {
		item: TripItem;
		persons: Person[];
		bags: Bag[];
		templateState: 'linked' | 'differs' | 'new' | 'auto';
		canEditTemplate: boolean;
		onpatch: (patch: Partial<TripItem>) => void;
		ondelete: () => void;
		onpromote: () => void;
		onsync: () => void;
		onclose: () => void;
	} = $props();
	const { t } = useI18n();

	let name = $derived(item.name);
	let note = $derived(item.note);
	const isItem = $derived(item.kind === 'item');
</script>

<Sheet title={isItem ? t('trip.edit_item') : t('trip.edit_group')} {onclose}>
	<div class="field">
		<label for="iname">{t('template.name')}</label>
		<input id="iname" bind:value={name} onchange={() => name.trim() && onpatch({ name })} />
	</div>
	{#if isItem}
		<div class="grid-2">
			<div class="field">
				<label for="iqty">{t('template.quantity')}</label>
				<input id="iqty" type="number" min="0" value={item.qty} onchange={(e) => onpatch({ qty: +(e.currentTarget as HTMLInputElement).value })} />
			</div>
			<div class="field">
				<label for="ibag">{t('template.bag')}</label>
				<select id="ibag" value={item.bag_id ?? ''} onchange={(e) => onpatch({ bag_id: (e.currentTarget as HTMLSelectElement).value || null })}>
					<option value="">—</option>
					{#each bags as b}<option value={b.id}>{b.icon} {b.name}</option>{/each}
				</select>
			</div>
		</div>
		<div class="field">
			<label for="iperson">{t('template.person')}</label>
			<select id="iperson" value={item.person_id ?? ''} onchange={(e) => onpatch({ person_id: (e.currentTarget as HTMLSelectElement).value || null })}>
				<option value="">{t('template.everyone')}</option>
				{#each persons as p}<option value={p.id}>{p.name}</option>{/each}
			</select>
		</div>
		<label class="check"><input type="checkbox" checked={item.needs_power} onchange={(e) => onpatch({ needs_power: (e.currentTarget as HTMLInputElement).checked })} /> ⚡ {t('template.needs_power')}</label>
		<label class="check field"><input type="checkbox" checked={item.consumable} onchange={(e) => onpatch({ consumable: (e.currentTarget as HTMLInputElement).checked })} /> 🧴 {t('template.consumable')}</label>
	{/if}
	<div class="field">
		<label for="inote">{t('template.note')}</label>
		<textarea id="inote" rows="2" bind:value={note} onchange={() => onpatch({ note })}></textarea>
	</div>
	{#if item.reason}
		<p class="small muted">💡 {item.reason}</p>
	{/if}

	<div class="tpl card">
		<h3>📋 {t('trip.template_link')}</h3>
		{#if templateState === 'auto'}
			<p class="small muted">{t('trip.tpl_auto')}</p>
		{:else if templateState === 'new'}
			<p class="small muted">{t('trip.tpl_new')}</p>
			{#if canEditTemplate}<button class="btn primary small" onclick={onpromote}>↑ {t('trip.promote')}</button>{/if}
		{:else if templateState === 'differs'}
			<p class="small muted">{t('trip.tpl_differs')}</p>
			{#if canEditTemplate}<button class="btn primary small" onclick={onsync}>⟳ {t('trip.sync')}</button>{/if}
		{:else}
			<p class="small muted">✓ {t('trip.tpl_linked')}</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class="row between">
			<button class="btn danger" onclick={ondelete}>🗑 {t('common.delete')}</button>
			<button class="btn primary" onclick={onclose}>{t('common.done')}</button>
		</div>
	{/snippet}
</Sheet>

<style>
	.check {
		margin-bottom: 0.5rem;
	}
	.tpl {
		background: var(--surface-2);
		box-shadow: none;
	}
	.tpl h3 {
		font-size: 0.9rem;
		margin-bottom: 0.3rem;
	}
</style>
