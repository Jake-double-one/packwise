<script lang="ts">
	import { DIMENSIONS } from '$lib/context';
	import { useI18n } from '$lib/i18n';
	import type { Rules } from '$lib/types';

	let { rules, onchange, disabled = false }: { rules: Rules; onchange: (rules: Rules) => void; disabled?: boolean } = $props();
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
		<div class="dim">
			<div class="dim-label">{dim.icon} {t(`dim.${dim.key}`)}</div>
			<div class="chips">
				{#each dim.values as v}
					{@const s = rules[dim.key]?.[v]}
					<button type="button" class="chip" class:yes={s === 1} class:no={s === -1} onclick={() => cycle(dim.key, v)} {disabled} title={s === 1 ? t('rules.only') : s === -1 ? t('rules.never') : t('rules.neutral')}>
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
	.chip {
		font-size: 0.8rem;
		padding: 0.2rem 0.6rem;
		min-height: 1.8rem;
	}
</style>
