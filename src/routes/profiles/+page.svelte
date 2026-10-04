<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import { page } from '$app/state';

	let { data, form } = $props();
	const { t } = useI18n();
	let adding = $state(false);
	const nextQ = $derived(page.url.searchParams.get('next') ? `&next=${encodeURIComponent(page.url.searchParams.get('next')!)}` : '');
</script>

<svelte:head><title>{t('profiles.title')} · Packwise</title></svelte:head>

<div class="container narrow">
	<h1 class="center">{t('profiles.who')}</h1>
	{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
	<div class="tiles">
		{#each data.profiles as p}
			<form method="POST" action="?/choose{nextQ}" use:enhance>
				<input type="hidden" name="id" value={p.id} />
				<button class="tile">
					<Avatar name={p.name} color={p.color} size={72} />
					<span>{p.name}</span>
				</button>
			</form>
		{/each}
		<button class="tile add" onclick={() => (adding = !adding)}>
			<span class="plus">+</span>
			<span>{t('profiles.add')}</span>
		</button>
	</div>

	{#if adding}
		<form method="POST" action="?/create{nextQ}" class="card" use:enhance>
			<div class="field">
				<label for="name">{t('setup.your_name')}</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="name" name="name" required autofocus />
			</div>
			<button class="btn primary block">{t('profiles.create')}</button>
		</form>
	{/if}
	<p class="tiny muted center">{t('profiles.hint')}</p>
</div>

<style>
	.center {
		text-align: center;
	}
	h1 {
		margin: 3rem 0 1.5rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.tile {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 1.1rem 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.1s, border-color 0.15s;
	}
	.tile:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
	}
	.plus {
		display: grid;
		place-items: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: 2px dashed var(--text-3);
		font-size: 2rem;
		color: var(--text-3);
	}
</style>
