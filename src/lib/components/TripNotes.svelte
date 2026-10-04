<script lang="ts">
	import { copyText } from '$lib/clipboard';
	import { useI18n } from '$lib/i18n';
	import { clientRowId } from '$lib/offline';
	import { toast } from '$lib/toast.svelte';
	import { NOTE_KINDS, parseCar, type CarRental, type NoteKind, type TripNote } from '$lib/types';

	let { notes, send }: { notes: TripNote[]; send: (op: { op: string; [k: string]: unknown }) => unknown } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	const ICON: Record<NoteKind, string> = { address: '📍', phone: '📞', link: '🔗', code: '🎫', text: '📝', secret: '🔒', car: '🚗' };
	const PRESETS: { kind: NoteKind; key: string }[] = [
		{ kind: 'address', key: 'stay' },
		{ kind: 'car', key: 'car' },
		{ kind: 'text', key: 'checkin' },
		{ kind: 'secret', key: 'wifi' },
		{ kind: 'secret', key: 'keybox' },
		{ kind: 'code', key: 'booking' },
		{ kind: 'phone', key: 'host' },
		{ kind: 'link', key: 'link' }
	];

	let editingId = $state<string | null>(null);
	let draft = $state<{ kind: NoteKind; label: string; value: string }>({ kind: 'text', label: '', value: '' });
	let car = $state<CarRental>(parseCar(''));
	let otherReturn = $state(false);
	const revealed = $state<Record<string, boolean>>({});

	function add(kind: NoteKind, label: string) {
		const id = clientRowId();
		send({ op: 'noteAdd', id, kind, label, value: '' });
		edit({ id, kind, label, value: '' });
	}

	function edit(n: TripNote) {
		editingId = n.id;
		draft = { kind: n.kind, label: n.label, value: n.value };
		car = parseCar(n.kind === 'car' ? n.value : '');
		otherReturn = !!car.return_address;
	}

	function save() {
		if (!editingId) return;
		const value = draft.kind === 'car' ? JSON.stringify({ ...car, return_address: otherReturn ? car.return_address : '' }) : draft.value;
		send({ op: 'noteUpdate', id: editingId, patch: { ...draft, value } });
		editingId = null;
	}

	const when = (v: string) => {
		if (!v) return '';
		const d = new Date(v);
		return Number.isNaN(d.getTime())
			? v
			: new Intl.DateTimeFormat(i18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
	};
	const carFilled = (n: TripNote) => {
		const c = parseCar(n.value);
		return Object.values(c).some(Boolean);
	};

	function remove(n: TripNote) {
		if (!confirm(t('notes.confirm_delete', { label: n.label || t(`notes.kind.${n.kind}`) }))) return;
		send({ op: 'noteDelete', id: n.id });
		if (editingId === n.id) editingId = null;
	}

	async function copy(value: string) {
		await copyText(value);
		toast(t('common.copied'), 'info', 1500);
	}

	const safeLink = (v: string) => (/^https?:\/\//i.test(v.trim()) ? v.trim() : /^[\w-]+(\.[\w-]+)+/.test(v.trim()) ? `https://${v.trim()}` : null);
	const mapsUrl = (v: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(v)}`;
	const naviUrl = (v: string) => `geo:0,0?q=${encodeURIComponent(v)}`;
	const telUrl = (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`;
</script>

<section class="card notes">
	<h2>📝 {t('notes.title')}</h2>
	{#if !notes.length}<p class="small muted">{t('notes.empty')}</p>{/if}

	<ul class="list">
		{#each notes as n (n.id)}
			<li class="note">
				{#if editingId === n.id}
					<div class="edit">
						<div class="row wrap">
							<select bind:value={draft.kind} aria-label={t('notes.kind_label')}>
								{#each NOTE_KINDS as k}<option value={k}>{ICON[k]} {t(`notes.kind.${k}`)}</option>{/each}
							</select>
							<input class="grow" bind:value={draft.label} placeholder={t('notes.label')} aria-label={t('notes.label')} />
						</div>
						{#if draft.kind === 'car'}
							<div class="grid-2 car-form">
								<label class="f">{t('notes.car.company')}<input bind:value={car.company} placeholder="Sixt, Europcar …" /></label>
								<label class="f">{t('notes.car.booking')}<input bind:value={car.booking} autocomplete="off" /></label>
								<label class="f">{t('notes.car.pickup_at')}<input type="datetime-local" bind:value={car.pickup_at} /></label>
								<label class="f">{t('notes.car.return_at')}<input type="datetime-local" bind:value={car.return_at} /></label>
							</div>
							<label class="f">{t('notes.car.pickup_address')}<textarea rows="2" bind:value={car.pickup_address} placeholder={t('notes.placeholder.address')}></textarea></label>
							<label class="check"><input type="checkbox" bind:checked={otherReturn} /> {t('notes.car.other_return')}</label>
							{#if otherReturn}
								<label class="f">{t('notes.car.return_address')}<textarea rows="2" bind:value={car.return_address} placeholder={t('notes.placeholder.address')}></textarea></label>
							{/if}
						{:else if draft.kind === 'text' || draft.kind === 'address'}
							<textarea rows="3" bind:value={draft.value} placeholder={t(`notes.placeholder.${draft.kind}`)}></textarea>
						{:else}
							<input
								bind:value={draft.value}
								type={draft.kind === 'phone' ? 'tel' : draft.kind === 'link' ? 'url' : 'text'}
								autocomplete="off"
								placeholder={t(`notes.placeholder.${draft.kind}`)}
								onkeydown={(e) => e.key === 'Enter' && save()}
							/>
						{/if}
						<div class="row">
							<button class="btn danger small" onclick={() => remove(n)}>🗑</button>
							<div class="grow"></div>
							<button class="btn small" onclick={() => (editingId = null)}>{t('common.back')}</button>
							<button class="btn primary small" onclick={save}>{t('common.save')}</button>
						</div>
					</div>
				{:else}
					<div class="icon">{ICON[n.kind]}</div>
					<div class="body grow">
						<div class="label tiny">{n.label || t(`notes.kind.${n.kind}`)}</div>
						{#if n.kind === 'car' && carFilled(n)}
							{@const c = parseCar(n.value)}
							<div class="car">
								{#if c.company || c.booking}
									<div class="row wrap">
										{#if c.company}<strong>{c.company}</strong>{/if}
										{#if c.booking}<span class="mono">{c.booking}</span><button class="btn ghost icon mini" title={t('common.copy')} onclick={() => copy(c.booking)}>📋</button>{/if}
									</div>
								{/if}
								{#each [{ key: 'pickup', at: c.pickup_at, addr: c.pickup_address }, { key: 'return', at: c.return_at, addr: c.return_address || c.pickup_address, same: !c.return_address && !!c.pickup_address }] as leg}
									{#if leg.at || leg.addr}
										<div class="leg">
											<div class="tiny label">{t(`notes.car.${leg.key}`)}{#if leg.at}&nbsp;· <span class="when">{when(leg.at)}</span>{/if}</div>
											{#if leg.addr}
												<div class="pre small">{leg.key === 'return' && leg.same ? t('notes.car.same_place') : leg.addr}</div>
												{#if !(leg.key === 'return' && leg.same)}
													<div class="row tiny links">
														<a href={mapsUrl(leg.addr)} target="_blank" rel="noopener">🗺️ {t('notes.map')}</a>
														<a href={naviUrl(leg.addr)}>🧭 {t('notes.navigate')}</a>
													</div>
												{/if}
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{:else if !n.value || n.kind === 'car'}
							<button class="link-btn muted small" onclick={() => edit(n)}>{t('notes.add_value')}</button>
						{:else if n.kind === 'secret'}
							<span class="value mono">{revealed[n.id] ? n.value : '•'.repeat(Math.min(12, Math.max(6, n.value.length)))}</span>
						{:else if n.kind === 'code'}
							<span class="value mono">{n.value}</span>
						{:else if n.kind === 'phone'}
							<a class="value" href={telUrl(n.value)}>{n.value}</a>
						{:else if n.kind === 'link' && safeLink(n.value)}
							<a class="value" href={safeLink(n.value)} target="_blank" rel="noopener noreferrer">{n.value}</a>
						{:else}
							<span class="value pre">{n.value}</span>
						{/if}
						{#if n.kind === 'address' && n.value}
							<div class="row tiny links">
								<a href={mapsUrl(n.value)} target="_blank" rel="noopener">🗺️ {t('notes.map')}</a>
								<a href={naviUrl(n.value)}>🧭 {t('notes.navigate')}</a>
							</div>
						{/if}
					</div>
					<div class="actions">
						{#if n.kind === 'secret' && n.value}
							<button class="btn ghost icon" title={revealed[n.id] ? t('notes.hide') : t('notes.show')} onclick={() => (revealed[n.id] = !revealed[n.id])}>{revealed[n.id] ? '🙈' : '👁'}</button>
						{/if}
						{#if n.value && n.kind !== 'car'}<button class="btn ghost icon" title={t('common.copy')} onclick={() => copy(n.value)}>📋</button>{/if}
						<button class="btn ghost icon" title={t('notes.edit')} onclick={() => edit(n)}>✏️</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="presets chips">
		{#each PRESETS as p}
			<button class="chip" onclick={() => add(p.kind, t(`notes.preset.${p.key}`))}>+ {ICON[p.kind]} {t(`notes.preset.${p.key}`)}</button>
		{/each}
	</div>
	<p class="tiny muted">{t('notes.hint')}</p>
</section>

<style>
	h2 {
		font-size: 1.05rem;
	}
	.list {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
	}
	.note {
		display: flex;
		gap: 0.6rem;
		align-items: flex-start;
		padding: 0.55rem 0;
		border-bottom: 1px solid var(--border);
	}
	.icon {
		font-size: 1.2rem;
		line-height: 1.6;
	}
	.body {
		min-width: 0;
	}
	.label {
		font-weight: 700;
		color: var(--text-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.value {
		overflow-wrap: anywhere;
	}
	.mono {
		font-family: ui-monospace, monospace;
		font-size: 1rem;
		letter-spacing: 0.04em;
	}
	.pre {
		white-space: pre-wrap;
	}
	.links {
		gap: 0.9rem;
		margin-top: 0.2rem;
	}
	.actions {
		display: flex;
	}
	.actions .btn {
		min-width: 2rem;
		min-height: 2rem;
	}
	.edit {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.edit select {
		width: auto;
	}
	.link-btn {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		cursor: pointer;
		text-decoration: underline dotted;
	}
	.car-form {
		gap: 0.5rem;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.78rem;
		margin: 0;
	}
	.car {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.15rem;
	}
	.leg {
		border-left: 3px solid var(--accent-soft);
		padding-left: 0.6rem;
	}
	.when {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text);
	}
	.mini {
		min-width: 1.6rem !important;
		min-height: 1.6rem !important;
		padding: 0;
	}
	.presets {
		margin-bottom: 0.4rem;
	}
	.presets .chip {
		font-size: 0.8rem;
	}
</style>
