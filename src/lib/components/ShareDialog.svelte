<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api, describeError } from '#lib/api.js';
	import { useI18n } from '#lib/i18n/index.js';
	import { toast } from '#lib/toast.svelte.js';
	import Avatar from './Avatar.svelte';
	import CopyField from './CopyField.svelte';
	import Sheet from './Sheet.svelte';

	type Guest = { user_id: string; name: string; email: string | null; color: string; avatar: string | null };
	let {
		url,
		name,
		onclose,
		tripId = '',
		guests: initialGuests = null,
		canInvite = false,
		isGuest = false,
		me = ''
	}: {
		url: string;
		name: string;
		onclose: () => void;
		tripId?: string;
		/** accounts mode only: invited guests of this trip */
		guests?: Guest[] | null;
		canInvite?: boolean;
		isGuest?: boolean;
		me?: string;
	} = $props();
	const { t } = useI18n();
	// initial list only – the dialog is recreated each time it opens
	const init = () => initialGuests;
	let guests = $state<Guest[] | null>(init() ? [...init()!] : null);
	let inviteEmail = $state('');
	let inviteLink = $state('');
	let mailed = $state(false);
	let busy = $state(false);

	async function invite() {
		busy = true;
		try {
			const res = await api<{ link: string; mailed: boolean }>(`/api/trips/${tripId}/guests`, { email: inviteEmail });
			inviteLink = res.link;
			mailed = res.mailed;
		} catch (err) {
			toast(describeError(err, t));
		} finally {
			busy = false;
		}
	}
	async function remove(g: Guest) {
		const self = g.user_id === me;
		if (!confirm(self ? t('guests.confirm_leave') : t('guests.confirm_remove', { name: g.name }))) return;
		try {
			const res = await api<{ guests: Guest[] }>(`/api/trips/${tripId}/guests`, { user_id: g.user_id }, 'DELETE');
			guests = res.guests;
			if (self) {
				onclose();
				goto('/');
			}
		} catch (err) {
			toast(describeError(err, t));
		}
	}
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

	{#if guests}
		<section class="guests">
			<h3>👥 {t('guests.title')}</h3>
			<p class="small muted">{isGuest ? t('guests.you_are_guest') : t('guests.hint')}</p>
			{#if guests.length}
				<ul>
					{#each guests as g (g.user_id)}
						<li class="row">
							<Avatar name={g.name} color={g.color} avatar={g.avatar} size={28} />
							<span class="grow">{g.name}{#if g.email}<span class="tiny muted">&nbsp;· {g.email}</span>{/if}</span>
							{#if canInvite || g.user_id === me}
								<button class="btn small" class:danger={g.user_id !== me} onclick={() => remove(g)}>{g.user_id === me ? t('guests.leave') : '✕'}</button>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="small muted">{t('guests.none')}</p>
			{/if}
			{#if canInvite}
				<form class="row wrap" onsubmit={(e) => { e.preventDefault(); invite(); }}>
					<input class="grow" type="email" bind:value={inviteEmail} placeholder={t('guests.email')} aria-label={t('guests.email')} />
					<button class="btn primary" disabled={busy}>{t('guests.create')}</button>
				</form>
				{#if inviteLink}
					<div class="alert success small">
						{#if mailed}<p>{t('household.invite_mailed')}</p>{/if}
						<CopyField value={inviteLink} />
						<p class="tiny muted">{t('guests.link_hint')}</p>
					</div>
				{/if}
			{/if}
		</section>
	{/if}
</Sheet>

<style>
	.guests {
		margin-top: 1.2rem;
		border-top: 1px solid var(--border);
		padding-top: 0.8rem;
	}
	.guests h3 {
		font-size: 1rem;
		margin-bottom: 0.3rem;
	}
	.guests ul {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
	}
	.guests li {
		padding: 0.3rem 0;
		align-items: center;
		gap: 0.5rem;
	}
	.guests form {
		gap: 0.4rem;
		margin-bottom: 0.5rem;
	}
	.qr {
		display: block;
		margin: 1rem auto;
		border-radius: 12px;
		background: #fff;
		padding: 8px;
	}
</style>
