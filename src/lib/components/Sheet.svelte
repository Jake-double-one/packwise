<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, onclose, children, footer }: { title: string; onclose: () => void; children: Snippet; footer?: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
	<header class="row between">
		<h2>{title}</h2>
		<button class="btn ghost icon" onclick={onclose} aria-label="Close">✕</button>
	</header>
	<div class="body">{@render children()}</div>
	{#if footer}<footer>{@render footer()}</footer>{/if}
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.35);
		z-index: 40;
		animation: fade 0.15s;
	}
	.sheet {
		position: fixed;
		z-index: 41;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		display: flex;
		flex-direction: column;
		right: 0;
		top: 0;
		bottom: 0;
		width: min(440px, 100vw);
		animation: slide 0.18s ease-out;
	}
	header {
		padding: 0.9rem 1rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	header h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.body {
		padding: 1rem;
		overflow-y: auto;
		flex: 1;
	}
	footer {
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
	}
	@media (max-width: 640px) {
		.sheet {
			top: auto;
			left: 0;
			width: 100%;
			max-height: 88dvh;
			border-radius: 18px 18px 0 0;
			animation: up 0.2s ease-out;
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes slide {
		from {
			transform: translateX(30px);
			opacity: 0;
		}
	}
	@keyframes up {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
</style>
