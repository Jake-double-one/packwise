<script lang="ts">
	import { dismiss, toasts } from '$lib/toast.svelte';
</script>

<div class="toasts" aria-live="assertive">
	{#each toasts as t (t.id)}
		<button class="toast {t.kind}" onclick={() => dismiss(t.id)}>{t.kind === 'error' ? '⚠️' : 'ℹ️'} {t.text}</button>
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
