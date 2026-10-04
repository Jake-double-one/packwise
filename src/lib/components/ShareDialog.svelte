<script lang="ts">
	import { onMount } from 'svelte';
	import { useI18n } from '$lib/i18n';
	import CopyField from './CopyField.svelte';
	import Sheet from './Sheet.svelte';

	let { url, name, onclose }: { url: string; name: string; onclose: () => void } = $props();
	const { t } = useI18n();
	let qr = $state('');
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	onMount(async () => {
		const QRCode = (await import('qrcode')).default;
		qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
	});

	function share() {
		navigator.share({ title: name, text: t('trip.share_text', { name }), url }).catch(() => {});
	}
</script>

<Sheet title={t('trip.share')} {onclose}>
	<p class="small muted">{t('trip.share_hint')}</p>
	<CopyField value={url} />
	{#if qr}<img class="qr" src={qr} alt="QR code" width="240" height="240" />{/if}
	{#if canShare}<button class="btn primary block" onclick={share}>📤 {t('trip.share_via')}</button>{/if}
</Sheet>

<style>
	.qr {
		display: block;
		margin: 1rem auto;
		border-radius: 12px;
		background: #fff;
		padding: 8px;
	}
</style>
