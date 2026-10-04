<script lang="ts">
	let { value, total, size = 44, color = 'var(--accent)', label = '' }: { value: number; total: number; size?: number; color?: string; label?: string } = $props();
	const pct = $derived(total ? value / total : 0);
	const r = $derived(size / 2 - 4);
	const c = $derived(2 * Math.PI * r);
</script>

<div class="ring" style="width:{size}px;height:{size}px" title="{label} {value}/{total}">
	<svg width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface-3)" stroke-width="5" />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke={pct >= 1 ? 'var(--success)' : color}
			stroke-width="5"
			stroke-linecap="round"
			stroke-dasharray={c}
			stroke-dashoffset={c * (1 - pct)}
			transform="rotate(-90 {size / 2} {size / 2})"
			style="transition: stroke-dashoffset .4s ease"
		/>
	</svg>
	<span class="pct" style="font-size:{Math.round(size * 0.24)}px">{pct >= 1 ? '✓' : `${Math.round(pct * 100)}%`}</span>
</div>

<style>
	.ring {
		position: relative;
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
	}
	.ring svg {
		position: absolute;
		inset: 0;
	}
	.pct {
		font-weight: 800;
	}
</style>
