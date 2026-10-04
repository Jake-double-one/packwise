<script lang="ts">
	import { useI18n } from '$lib/i18n';
	let { value }: { value: string } = $props();
	const { t } = useI18n();
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			const el = document.createElement('textarea');
			el.value = value;
			document.body.appendChild(el);
			el.select();
			document.execCommand('copy');
			el.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="row copy">
	<input readonly {value} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
	<button type="button" class="btn" onclick={copy}>{copied ? '✓ ' + t('common.copied') : t('common.copy')}</button>
</div>

<style>
	.copy input {
		font-family: ui-monospace, monospace;
		font-size: 0.85rem;
	}
</style>
