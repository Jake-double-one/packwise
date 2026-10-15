<script lang="ts">
	import { dismiss, toasts } from '$lib/toast.svelte';
</script>

<div class="toasts no-print" aria-live="assertive">
	{#each toasts as t (t.id)}
		{#if t.action}
			{@const action = t.action}
			<div class="toast {t.kind} with-action">
				<span class="grow">{t.text}</span>
				<button class="act" onclick={() => { dismiss(t.id); action.run(); }}>{action.label}</button>
				<button class="x" aria-label="✕" onclick={() => dismiss(t.id)}>✕</button>
			</div>
		{:else}
			<button class="toast {t.kind}" onclick={() => dismiss(t.id)}>{t.kind === 'error' ? '⚠️' : 'ℹ️'} {t.text}</button>
		{/if}
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		z-index: 100;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: min(560px, calc(100vw - 32px));
		pointer-events: none;
	}
	/* above the bar of the packing mode */
	:global(body:has(.pack-bar)) .toasts {
		bottom: calc(4.6rem + env(safe-area-inset-bottom));
	}
	.toast {
		pointer-events: auto;
		text-align: left;
		font: inherit;
		font-size: 0.9rem;
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--danger) 50%, transparent);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-lg);
		cursor: pointer;
		animation: in 0.2s ease-out;
	}
	.toast.with-action {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		cursor: default;
		border-color: var(--border);
		padding: 0.45rem 0.5rem 0.45rem 0.9rem;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.act {
		border: none;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 800;
		cursor: pointer;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius-sm);
	}
	.act:hover {
		background: var(--accent-soft);
	}
	.x {
		border: none;
		background: none;
		color: var(--text-3);
		cursor: pointer;
		padding: 0.35rem;
	}
	.toast.error {
		background: color-mix(in srgb, var(--danger) 16%, var(--surface));
	}
	@keyframes in {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
