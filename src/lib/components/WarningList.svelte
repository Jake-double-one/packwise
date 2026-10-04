<script lang="ts">
	import { useI18n } from '$lib/i18n';
	import type { Warning } from '$lib/types';

	let { warnings }: { warnings: Warning[] } = $props();
	const { t } = useI18n();
	const icon: Record<Warning['kind'], string> = { adapter: '🔌', voltage: '⚡', plausibility: '🤔', road: '🚗', info: 'ℹ️' };
</script>

{#each warnings as w}
	<div class="alert warning small">{icon[w.kind]} {t(w.key, w.params)}</div>
{/each}
