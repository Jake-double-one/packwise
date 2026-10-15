<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { useI18n } from '$lib/i18n';

	type Channel = { id: string; kind: 'email' | 'ntfy' | 'gotify' | 'webpush'; label: string; last_error: string | null };
	type Prefs = { departureDays: number; dayBefore: boolean; todos: boolean; hour: number };
	type Result = { notifySaved?: string; notifyError?: string; notifyDetail?: string; notifyFor?: string } | null;
	let {
		channels,
		prefs,
		max,
		tz,
		smtp,
		result
	}: { channels: Channel[]; prefs: Prefs; max: number; tz: string; smtp: boolean; result: Result } = $props();
	const { t } = useI18n();

	const ICONS = { email: '✉️', ntfy: '📣', gotify: '🔔', webpush: '📱' } as const;
	const DAYS = [1, 2, 3, 5, 7, 14];
	let adding = $state<'' | 'email' | 'ntfy' | 'gotify'>('');
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const added = () => async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
		await update();
		if (result.type === 'success') adding = '';
	};

	// ── Web Push on this device ──
	type PushState = 'checking' | 'unsupported' | 'insecure' | 'ios_home' | 'denied' | 'off' | 'on' | 'busy';
	let push = $state<PushState>('checking');
	let pushError = $state('');

	const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
	async function registration() {
		return withTimeout(navigator.serviceWorker.ready, 5000);
	}

	onMount(async () => {
		const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
		const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
		if (!window.isSecureContext) return (push = 'insecure');
		if (ios && !standalone) return (push = 'ios_home');
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return (push = 'unsupported');
		if (Notification.permission === 'denied') return (push = 'denied');
		try {
			const sub = await (await registration()).pushManager.getSubscription();
			push = sub ? 'on' : 'off';
		} catch {
			push = 'unsupported';
		}
	});

	function deviceName() {
		const ua = navigator.userAgent;
		const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
		const os = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
		return os ? `${browser} · ${os}` : browser;
	}

	function keyBytes(base64: string) {
		const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	}

	async function enablePush() {
		pushError = '';
		push = 'busy';
		try {
			if ((await Notification.requestPermission()) !== 'granted') return (push = 'denied');
			const { publicKey } = await (await fetch('/api/notify/webpush')).json();
			const reg = await registration();
			const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
			const res = await fetch('/api/notify/webpush', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() })
			});
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
			push = 'on';
			await invalidateAll();
		} catch (err) {
			pushError = (err as Error).message;
			push = 'off';
		}
	}

	async function disablePush() {
		push = 'busy';
		try {
			const sub = await (await registration()).pushManager.getSubscription();
			if (sub) {
				await fetch('/api/notify/webpush', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
				await sub.unsubscribe();
			}
		} finally {
			push = 'off';
			await invalidateAll();
		}
	}
</script>

<section class="card notify">
	<h2>🔔 {t('notify.title')}</h2>
	<p class="small muted">{t('notify.hint')}</p>
	{#if result?.notifyError && !result.notifyFor}<div class="alert danger small">{t(result.notifyError)}</div>{/if}
	{#if result?.notifySaved && !result.notifyFor}<div class="alert success small">{t(`notify.done.${result.notifySaved}`)}</div>{/if}

	<h3>{t('notify.when')}</h3>
	<form method="POST" action="?/notifyPrefs" use:enhance={keep} class="prefs">
		<label class="check">
			<input type="checkbox" name="departure" checked={prefs.departureDays > 0} />
			<span>
				{t('notify.departure_before')}
				<select name="days" aria-label={t('notify.days')} value={String(prefs.departureDays || 3)}>
					{#each DAYS as d (d)}<option value={String(d)}>{t('notify.days_n', { count: d })}</option>{/each}
				</select>
			</span>
		</label>
		<label class="check"><input type="checkbox" name="day_before" checked={prefs.dayBefore} /> {t('notify.day_before')}</label>
		<label class="check"><input type="checkbox" name="todos" checked={prefs.todos} /> {t('notify.todos')}</label>
		<label class="row hour">
			{t('notify.hour')}
			<select name="hour" value={String(prefs.hour)}>
				{#each Array.from({ length: 24 }, (_, h) => h) as h (h)}<option value={String(h)}>{String(h).padStart(2, '0')}:00</option>{/each}
			</select>
			<span class="tiny muted">({tz})</span>
		</label>
		<p class="tiny muted">{t('notify.who')}</p>
		<button class="btn small primary">{t('common.save')}</button>
	</form>

	<h3>{t('notify.channels')}</h3>
	{#if channels.length}
		<ul class="channels">
			{#each channels as ch (ch.id)}
				<li>
					<div class="row">
						<span class="icon" aria-hidden="true">{ICONS[ch.kind]}</span>
						<div class="grow">
							<strong>{t(`notify.kind.${ch.kind}`)}</strong>
							<div class="tiny muted">{ch.label}</div>
						</div>
						<form method="POST" action="?/notifyTest" use:enhance={keep}>
							<input type="hidden" name="id" value={ch.id} />
							<button class="btn small">{t('notify.test')}</button>
						</form>
						<form method="POST" action="?/notifyDelete" use:enhance>
							<input type="hidden" name="id" value={ch.id} />
							<button class="btn ghost icon" title={t('common.delete')} aria-label={t('common.delete')}>✕</button>
						</form>
					</div>
					{#if result?.notifyFor === ch.id}
						{#if result.notifyError}
							<div class="alert danger small">{t(result.notifyError)}{#if result.notifyDetail}: <code class="tiny">{result.notifyDetail}</code>{/if}</div>
						{:else if result.notifySaved}
							<div class="alert success small">{t('notify.done.tested')}</div>
						{/if}
					{:else if ch.last_error}
						<div class="tiny err">⚠️ {t('notify.last_error')}: {ch.last_error}</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="small muted">{t('notify.none')}</p>
	{/if}

	{#if channels.length < max}
		<div class="device">
			<strong>📱 {t('notify.this_device')}</strong>
			{#if push === 'on'}
				<span class="badge">✓ {t('notify.push_on')}</span>
				<button class="btn small ghost" onclick={disablePush}>{t('notify.push_off')}</button>
			{:else if push === 'off' || push === 'busy'}
				<button class="btn small primary" onclick={enablePush} disabled={push === 'busy'}>{t('notify.push_enable')}</button>
			{:else if push === 'checking'}
				<span class="tiny muted">…</span>
			{:else}
				<p class="tiny muted">{t(`notify.push.${push}`)}</p>
			{/if}
			{#if pushError}<p class="tiny err">{pushError}</p>{/if}
		</div>

		<div class="row wrap add">
			<button class="btn small" class:primary={adding === 'email'} onclick={() => (adding = adding === 'email' ? '' : 'email')}>+ {t('notify.kind.email')}</button>
			<button class="btn small" class:primary={adding === 'ntfy'} onclick={() => (adding = adding === 'ntfy' ? '' : 'ntfy')}>+ ntfy</button>
			<button class="btn small" class:primary={adding === 'gotify'} onclick={() => (adding = adding === 'gotify' ? '' : 'gotify')}>+ Gotify</button>
		</div>

		{#if adding}
			<form method="POST" action="?/notifyAdd" use:enhance={added} class="add-form">
				<input type="hidden" name="kind" value={adding} />
				{#if adding === 'email'}
					{#if !smtp}<p class="alert warning small">{t('notify.email_no_smtp')}</p>{/if}
					<div class="field">
						<label for="n-address">{t('auth.email')}</label>
						<input id="n-address" name="address" type="email" required autocomplete="email" />
					</div>
				{:else if adding === 'ntfy'}
					<p class="tiny muted">{t('notify.ntfy_hint')}</p>
					<div class="field">
						<label for="n-server">{t('notify.server')}</label>
						<input id="n-server" name="server" value="https://ntfy.sh" required />
					</div>
					<div class="field">
						<label for="n-topic">{t('notify.topic')}</label>
						<input id="n-topic" name="topic" required pattern="[A-Za-z0-9_\-]{'{1,64}'}" placeholder="packwise-…" />
					</div>
					<div class="field">
						<label for="n-token">{t('notify.ntfy_token')} <span class="tiny muted">({t('admin.optional')})</span></label>
						<input id="n-token" name="token" type="password" autocomplete="off" />
					</div>
				{:else}
					<p class="tiny muted">{t('notify.gotify_hint')}</p>
					<div class="field">
						<label for="n-server">{t('notify.server')}</label>
						<input id="n-server" name="server" required placeholder="https://gotify.example.com" />
					</div>
					<div class="field">
						<label for="n-token">{t('notify.gotify_token')}</label>
						<input id="n-token" name="token" type="password" required autocomplete="off" />
					</div>
				{/if}
				<button class="btn small primary">{t('notify.add')}</button>
			</form>
		{/if}
	{/if}
</section>

<style>
	h3 {
		margin-top: 1rem;
	}
	.prefs {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}
	.prefs select {
		width: auto;
		display: inline-block;
		padding: 0.2rem 0.4rem;
		margin-left: 0.25rem;
	}
	.hour {
		gap: 0.4rem;
		align-items: center;
	}
	.channels {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.channels li {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.5rem 0.6rem;
	}
	.channels .row {
		gap: 0.5rem;
		align-items: center;
	}
	.icon {
		font-size: 1.3rem;
	}
	.device {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin: 0.5rem 0;
	}
	.device p {
		flex-basis: 100%;
		margin: 0;
	}
	.add {
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.add-form {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.err {
		color: var(--danger);
		margin-top: 0.25rem;
	}
</style>
