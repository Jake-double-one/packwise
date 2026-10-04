<script lang="ts">
	let { name, color, size = 26 }: { name: string; color: string; size?: number } = $props();
	const initials = $derived(
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((p) => p[0] ?? '')
			.join('') || '?'
	);
</script>

<span class="avatar" style="background:{color}; width:{size}px; height:{size}px; font-size:{Math.round(size * 0.4)}px" title={name}>
	{initials}
</span>
