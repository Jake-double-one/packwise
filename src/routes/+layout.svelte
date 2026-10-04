<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { provideI18n } from '$lib/i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import Toasts from '$lib/components/Toasts.svelte';

	let { data, children } = $props();
	const { t } = provideI18n(() => ({ locale: data.locale, messages: data.messages }));

	const nav = $derived([
		{ href: '/', label: t('nav.trips'), icon: '🧳' },
		{ href: '/template', label: t('nav.template'), icon: '📋' },
		{ href: '/household', label: t('nav.household'), icon: '🏠' }
	]);
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/trips') : page.url.pathname.startsWith(href));
	const showNav = $derived(!!data.user && !page.url.pathname.startsWith('/setup'));
</script>

<svelte:head>
	<title>Packwise</title>
</svelte:head>

{#if showNav}
	<header class="topbar no-print">
		<div class="inner">
			<a class="brand" href="/" aria-label="Packwise">
				<img src="/favicon.svg" alt="" width="28" height="28" />
				<span>Packwise</span>
			</a>
			<nav>
				{#each nav as item}
					<a href={item.href} class:active={active(item.href)}>
						<span class="ico" aria-hidden="true">{item.icon}</span>
						<span class="lbl">{item.label}</span>
					</a>
				{/each}
			</nav>
			<a class="me" href="/settings" title={t('nav.settings')} class:active={page.url.pathname.startsWith('/settings')}>
				<Avatar name={data.user?.name ?? '?'} color={data.user?.color ?? '#888'} size={30} />
			</a>
		</div>
	</header>
{/if}

<main>
	{@render children()}
</main>

<Toasts />

<style>
	.topbar {
		position: sticky;
		top: 0;
		z-index: 20;
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--border);
		padding-top: env(safe-area-inset-top);
	}
	.inner {
		max-width: 960px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 16px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--text);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 0.25rem;
		flex: 1;
		justify-content: center;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.8rem;
		border-radius: 999px;
		color: var(--text-2);
		font-weight: 600;
		text-decoration: none;
	}
	nav a:hover {
		background: var(--surface-2);
	}
	nav a.active {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.me {
		border-radius: 50%;
		padding: 2px;
		border: 2px solid transparent;
	}
	.me.active {
		border-color: var(--accent);
	}
	@media (max-width: 640px) {
		.brand span,
		nav .lbl {
			display: none;
		}
		nav a {
			padding: 0.45rem 0.9rem;
			font-size: 1.15rem;
		}
	}
</style>
