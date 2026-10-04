<script lang="ts">
	import { DIMENSIONS } from '$lib/context';
	import { useI18n } from '$lib/i18n';
	import type { Rules } from '$lib/types';

	let {
		rules,
		onchange,
		disabled = false,
		perPerson = false
	}: { rules: Rules; onchange: (rules: Rules) => void; disabled?: boolean; perPerson?: boolean } = $props();
	const { t } = useI18n();

	/** neutral → only with → never with → neutral */
	function cycle(dim: string, value: string) {
		if (disabled) return;
		const next: Rules = structuredClone($state.snapshot(rules) as Rules);
		const cur = next[dim]?.[value];
		const state = cur === undefined ? 1 : cur === 1 ? -1 : undefined;
		next[dim] ??= {};
		if (state === undefined) delete next[dim][value];
		else next[dim][value] = state;
		if (!Object.keys(next[dim]).length) delete next[dim];
		onchange(next);
	}
</script>

<div class="rules">
	<p class="tiny muted">{t('rules.hint')}</p>
	{#each DIMENSIONS as dim}
		{@const forWhom = perPerson && dim.key === 'travelers'}
		<div class="dim">
			<div class="dim-label">{forWhom ? `👥 ${t('dim.travelers_for')}` : `${dim.icon} ${t(`dim.${dim.key}`)}`}</div>
			{#if forWhom}<p class="tiny muted for-hint">{t('rules.for_hint')}</p>{/if}
			<div class="chips">
				<!-- "adults" only makes sense per person: a shared item always travels with an adult -->
				{#each dim.values.filter((v) => forWhom || dim.key !== 'travelers' || v !== 'adult' || rules.travelers?.adult) as v}
					{@const s = rules[dim.key]?.[v]}
					<button type="button" class="chip" class:yes={s === 1} class:no={s === -1} onclick={() => cycle(dim.key, v)} {disabled} title={forWhom ? (s === 1 ? t('rules.only_for') : s === -1 ? t('rules.never_for') : t('rules.neutral')) : s === 1 ? t('rules.only') : s === -1 ? t('rules.never') : t('rules.neutral')}>
						{#if s === 1}✓{:else if s === -1}✕{/if}
						{t(`ctx.${dim.key}.${v}`)}
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.dim {
		margin-bottom: 0.7rem;
	}
	.dim-label {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-2);
		margin-bottom: 0.3rem;
	}
	.for-hint {
		margin: -0.15rem 0 0.35rem;
	}
	.chip {
		font-size: 0.8rem;
		padding: 0.2rem 0.6rem;
		min-height: 1.8rem;
	}
</style>
