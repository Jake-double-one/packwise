<script lang="ts">
	let {
		name,
		color,
		size = 26,
		avatar = null
	}: { name: string; color: string; size?: number; /** emoji or picture URL */ avatar?: string | null } = $props();
	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0] ?? '')
			.join('') || '?'
	);
	const isImage = $derived(!!avatar && avatar.startsWith('/'));
</script>

<span
	class="avatar"
	class:emoji={!!avatar && !isImage}
	style="background:{avatar && !isImage ? `color-mix(in srgb, ${color} 22%, var(--surface))` : color}; width:{size}px; height:{size}px; font-size:{Math.round(size * (avatar && !isImage ? 0.58 : 0.4))}px"
	title={name}
>
	{#if isImage}
		<img src={avatar} alt="" width={size} height={size} loading="lazy" />
	{:else if avatar}
		{avatar}
	{:else}
		{initials}
	{/if}
</span>

<style>
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
		display: block;
	}
	.avatar {
		overflow: hidden;
	}
	.avatar.emoji {
		line-height: 1;
	}
</style>
