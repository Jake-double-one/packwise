<script lang="ts">
	import { DIMENSION_MAP } from '$lib/context';
	import { useI18n } from '$lib/i18n';
	import type { Rules } from '$lib/types';

	let { rules }: { rules: Rules } = $props();
	const { t } = useI18n();
	const entries = $derived(
		Object.entries(rules ?? {}).flatMap(([dim, chips]) =>
			Object.entries(chips).map(([v, s]) => ({ dim, v, s, icon: DIMENSION_MAP[dim]?.icon ?? '' }))
		)
	);
</script>

{#each entries as e}
	<span class="rule" class:yes={e.s === 1} class:no={e.s === -1} title={t(`dim.${e.dim}`)}>
		{e.s === 1 ? '✓' : '✕'} {t(`ctx.${e.dim}.${e.v}`)}
	</span>
{/each}

<style>
	.rule {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		font-size: 0.7rem;
		font-weight: 600;
		padding: 0 0.4rem;
		border-radius: 999px;
		white-space: nowrap;
		line-height: 1.5;
	}
	.yes {
		background: var(--success-soft);
		color: var(--success);
	}
	.no {
		background: var(--danger-soft);
		color: var(--danger);
		text-decoration: line-through;
	}
</style>
