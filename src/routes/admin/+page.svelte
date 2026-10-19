<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { timeAgo, useI18n } from '$lib/i18n';
	import { countryFlag } from '$lib/data/countries';
	import Avatar from '$lib/components/Avatar.svelte';
	import CopyField from '$lib/components/CopyField.svelte';
	import SmtpSettings from '$lib/components/SmtpSettings.svelte';

	let { data, form } = $props();
	type Result = { error?: string; household?: string; for?: string; done?: string; link?: string; linkFor?: string; mailed?: boolean };
	const f = $derived(form as Result | null);
	const i18n = useI18n();
	const { t } = i18n;

	let open = $state<string | null>(null);
	let query = $state('');

	const users = $derived(
		data.users.filter((u) => !query.trim() || `${u.name} ${u.email ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
	);
	const stats = $derived({
		users: data.users.length,
		active: data.users.filter((u) => u.email && u.has_password).length,
		admins: data.users.filter((u) => u.is_admin).length,
		households: data.households.length
	});
	/** households nobody is a member of any more (e.g. after deleting an account) */
	const orphaned = $derived(data.households.filter((h) => !h.members));
	const inUse = $derived(data.households.filter((h) => h.members));

	const confirmSubmit =
		(message: string): SubmitFunction =>
		({ cancel }) => {
			if (!confirm(message)) cancel();
			return async ({ update }) => update({ reset: false });
		};
	const keep: SubmitFunction = () => async ({ update }) => update({ reset: false });
	const status = (u: (typeof data.users)[number]) => (!u.email ? 'no_login' : u.has_password ? 'active' : 'pending');
</script>

<svelte:head><title>{t('admin.title')} · Packwise</title></svelte:head>

<div class="container">
	<h1>🛡️ {t('admin.title')}</h1>
	<p class="muted small">{t('admin.registration', { mode: data.registration })} · SMTP: {data.smtp ? '✅' : '—'}</p>
	<p class="alert small">🛡️ {t('admin.role_hint')}</p>
	{#if !data.originSet}<p class="alert warning small">⚠️ {t('admin.origin_hint')}</p>{/if}

	<div class="stats">
		<div class="stat"><strong>{stats.users}</strong><span class="tiny muted">{t('admin.stat_users')}</span></div>
		<div class="stat"><strong>{stats.active}</strong><span class="tiny muted">{t('admin.stat_active')}</span></div>
		<div class="stat"><strong>{stats.admins}</strong><span class="tiny muted">{t('admin.stat_admins')}</span></div>
		<div class="stat"><strong>{stats.households}</strong><span class="tiny muted">{t('admin.stat_households')}</span></div>
	</div>

	{#if f?.error && !f?.for}<div class="alert danger">{t(f.error, { household: f.household ?? '' })}</div>{/if}
	{#if f?.done === 'merged' || f?.done === 'deleted'}<div class="alert success">{t(`admin.done.${f.done}`)}</div>{/if}
	{#if f?.link && !f?.linkFor}
		<div class="alert success"><p>{t('admin.link_hint')}</p><CopyField value={f.link} /></div>
	{/if}
	{#if f?.done === 'created'}
		<div class="alert success">
			<p>{t('admin.done.created')}</p>
			{#if f.link}
				<p class="small">{f.mailed ? t('admin.link_mailed') : t('admin.link_hint')}</p>
				<CopyField value={f.link} />
			{/if}
		</div>
	{/if}

	<section class="card">
		<div class="row between wrap">
			<h2>👤 {t('admin.users')}</h2>
			<input class="search" type="search" bind:value={query} placeholder={t('admin.search')} aria-label={t('admin.search')} />
		</div>
		<ul class="users">
			{#each users as u (u.id)}
				{@const st = status(u)}
				{@const others = data.users.filter((o) => o.id !== u.id)}
<li class="user" class:open={open === u.id}>
					<button class="head" aria-expanded={open === u.id} onclick={() => (open = open === u.id ? null : u.id)}>
						<Avatar name={u.name} color={u.color} avatar={u.avatar} size={34} />
						<div class="grow who">
							<div>
								<strong>{u.name}</strong>
								{#if u.id === data.user?.id}<span class="badge">{t('admin.you')}</span>{/if}
								{#if u.is_admin}<span class="badge admin">Admin</span>{/if}
								<span class="badge {st}">{t(`admin.status.${st}`)}</span>
							</div>
							<div class="tiny muted">
								{u.email ?? t('admin.no_email')}
								· {u.memberships.length ? u.memberships.map((m) => m.name).join(', ') : t('admin.no_household')}
								{#if u.last_login}· {t('admin.last_login', { when: timeAgo(u.last_login, i18n.locale) })}{/if}
							</div>
						</div>
						<span class="chev" aria-hidden="true">{open === u.id ? '▴' : '▾'}</span>
					</button>

					{#if open === u.id}
						<div class="panel">
							{#if f?.for === u.id && f?.error}<div class="alert danger">{t(f.error, { household: f.household ?? '' })}</div>{/if}
							{#if f?.for === u.id && f?.done}<div class="alert success">{t(`admin.done.${f.done}`)}</div>{/if}

							<h3>{t('admin.account')}</h3>
							<form method="POST" action="?/update" use:enhance={keep} class="grid-2">
								<input type="hidden" name="id" value={u.id} />
								<div class="field"><label for="n-{u.id}">{t('settings.name')}</label><input id="n-{u.id}" name="name" value={u.name} required /></div>
								<div class="field">
									<label for="e-{u.id}">{t('auth.email')}</label>
									<input id="e-{u.id}" name="email" type="email" value={u.email ?? ''} placeholder={t('admin.email_placeholder')} />
								</div>
								<div class="full"><button class="btn small primary">{t('common.save')}</button></div>
							</form>
							{#if !u.email}<p class="tiny muted">{t('admin.no_email_hint')}</p>{/if}

							<h3>{t('admin.password')}</h3>
							<p class="tiny muted">{t('admin.password_hint')}</p>
							<form method="POST" action="?/password" use:enhance class="row wrap">
								<input type="hidden" name="id" value={u.id} />
								<input class="grow" name="password" type="password" minlength="8" required autocomplete="new-password" placeholder={t('admin.new_password')} aria-label={t('admin.new_password')} />
								<button class="btn small">{t('admin.set_password')}</button>
							</form>
							<form method="POST" action="?/link" use:enhance={keep} class="row wrap link-form">
								<input type="hidden" name="id" value={u.id} />
								<button class="btn small" disabled={!u.email}>🔗 {u.has_password ? t('admin.reset_link_btn') : t('admin.invite_link_btn')}</button>
								{#if data.smtp && u.email}<label class="check tiny"><input type="checkbox" name="mail" checked /> {t('admin.send_mail')}</label>{/if}
							</form>
							{#if f?.linkFor === u.id && f?.link}
								<div class="alert success small">
									<p>{f.mailed ? t('admin.link_mailed') : t('admin.link_hint')}</p>
									<CopyField value={f.link} />
								</div>
							{/if}

							<h3>{t('admin.households')}</h3>
							{#if u.memberships.length}
								<ul class="memberships">
									{#each u.memberships as m (m.household_id)}
										<li class="row">
											<span class="grow">🏠 {m.name}</span>
											{#if m.role === 'owner'}<span class="badge">{t('household.creator')}</span>{/if}
											<form method="POST" action="?/member" use:enhance={confirmSubmit(t('admin.confirm_remove', { name: u.name, household: m.name }))}>
												<input type="hidden" name="user_id" value={u.id} />
												<input type="hidden" name="household_id" value={m.household_id} />
<button class="btn ghost icon" title={t('admin.remove_from')}>✕</button>
											</form>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="small muted">{t('admin.no_household')}</p>
							{/if}
							<p class="tiny muted">{t('admin.memberships_hint')}</p>

							{#if u.id !== data.user?.id}
								<h3>{t('admin.more')}</h3>
								<div class="row wrap">
									<form method="POST" action="?/admin" use:enhance={keep}>
										<input type="hidden" name="id" value={u.id} />
										<button class="btn small" disabled={!u.is_admin && !u.email}>{u.is_admin ? t('admin.revoke') : t('admin.make_admin')}</button>
									</form>
									{#if u.last_login}
										<form method="POST" action="?/logout" use:enhance={keep}>
											<input type="hidden" name="id" value={u.id} />
											<button class="btn small">{t('admin.logout_everywhere')}</button>
										</form>
									{/if}
								</div>
								<!-- only profiles without their own login can be merged (left over from none/local) -->
								{#if others.length && !u.has_password}
									<form
										method="POST"
										action="?/merge"
										class="row wrap merge"
										use:enhance={({ formData, cancel }) => {
											const into = data.users.find((o) => o.id === formData.get('into'));
											if (!confirm(t('admin.confirm_merge', { from: u.name, into: into?.name ?? '' }))) cancel();
											return async ({ update }) => update();
										}}
									>
										<input type="hidden" name="id" value={u.id} />
										<label class="tiny muted" for="m-{u.id}">{t('admin.merge_into')}</label>
										<select id="m-{u.id}" name="into" class="grow">
											{#each others as o (o.id)}<option value={o.id}>{o.name}{o.email ? ` (${o.email})` : ''}</option>{/each}
										</select>
										<button class="btn small">{t('admin.merge')}</button>
									</form>
									<p class="tiny muted">{t('admin.merge_hint')}</p>
								{/if}
								<form method="POST" action="?/delete" use:enhance={confirmSubmit(t('admin.confirm_delete', { name: u.name }))}>
									<input type="hidden" name="id" value={u.id} />
									<button class="btn small danger">🗑 {t('admin.delete_user')}</button>
								</form>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<SmtpSettings view={data.smtpSettings} result={form} />

	<section class="card">
		<h2>➕ {t('admin.create_user')}</h2>
		<form method="POST" action="?/create" use:enhance>
			<div class="grid-2">
				<div class="field"><label for="cn">{t('settings.name')}</label><input id="cn" name="name" required /></div>
				<div class="field"><label for="ce">{t('auth.email')}</label><input id="ce" name="email" type="email" required /></div>
				<div class="field">
					<label for="cp">{t('auth.password')} <span class="muted tiny">({t('admin.optional')})</span></label>
					<input id="cp" name="password" type="password" minlength="8" autocomplete="new-password" />
					<p class="tiny muted">{t('admin.password_optional_hint')}</p>
				</div>
			</div>
			<p class="tiny muted">{t('admin.own_household')}</p>
			{#if data.smtp}<label class="check small"><input type="checkbox" name="mail" checked /> {t('admin.send_mail')}</label>{/if}
			<button class="btn primary">{t('admin.create_user')}</button>
		</form>
	</section>

	<section class="card">
		<h2>🏠 {t('admin.households')}</h2>
		<p class="tiny muted">{t('admin.households_hint')}</p>
		<ul class="households">
			{#each inUse as h (h.id)}
				<li class="row wrap">
					<span>{h.home_country ? countryFlag(h.home_country) : '🏠'}</span>
					<div class="grow">
						<strong>{h.name}</strong>
						<div class="tiny muted">{h.member_names}</div>
					</div>
					<span class="tiny muted" title="{t('admin.stat_users')} · {t('nav.trips')}">{t('admin.hh_counts', { members: h.members, trips: h.trips })}</span>
				</li>
			{/each}
		</ul>
	</section>

	{#if orphaned.length}
		<section class="card">
			<h2>🏚️ {t('admin.orphaned')}</h2>
			<p class="tiny muted">{t('admin.orphaned_hint')}</p>
			<ul class="households">
				{#each orphaned as h (h.id)}
					<li class="row wrap">
						<span>{h.home_country ? countryFlag(h.home_country) : '🏠'}</span>
						<div class="grow">
							<strong>{h.name}</strong>
							<div class="tiny muted">{t('admin.orphaned_trips', { count: h.trips })} · {t('admin.created_on', { date: new Date(h.created_at).toLocaleDateString(i18n.locale) })}</div>
						</div>
						<form method="POST" action="?/deleteHousehold" use:enhance={confirmSubmit(t('admin.confirm_delete_household', { name: h.name, count: h.trips }))}>
							<input type="hidden" name="id" value={h.id} />
							<button class="btn small danger">🗑 {t('common.delete')}</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 0.75rem 0 1rem;
	}
	.stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.6rem 0.4rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.stat strong {
		font-size: 1.4rem;
	}
	.search {
		width: auto;
		min-width: 12rem;
	}
	.users,
	.memberships,
	.households {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.user {
		border-bottom: 1px solid var(--border);
	}
	.user:last-child {
		border-bottom: none;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		padding: 0.65rem 0.2rem;
		cursor: pointer;
	}
	.who {
		min-width: 0;
	}
	.who .tiny {
		overflow-wrap: anywhere;
	}
	.chev {
		color: var(--text-3);
	}
	.badge.admin {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.badge.active {
		background: color-mix(in srgb, var(--success, #16a34a) 15%, transparent);
	}
	.badge.pending,
	.badge.no_login {
		background: color-mix(in srgb, var(--warning, #d97706) 18%, transparent);
	}
	.panel {
		padding: 0.2rem 0.2rem 1rem 0.2rem;
	}
	h3 {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
		margin: 1rem 0 0.45rem;
	}
	.link-form {
		margin-top: 0.5rem;
		align-items: center;
	}
	.memberships li,
	.households li {
		padding: 0.3rem 0;
		align-items: center;
	}
	.full {
		grid-column: 1 / -1;
	}
	.merge {
		margin-top: 0.6rem;
		align-items: center;
	}
	.merge select {
		min-width: 10rem;
	}
	.households li {
		border-bottom: 1px solid var(--border);
	}
	.households li:last-child {
		border-bottom: none;
	}
	@media (max-width: 560px) {
		.stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.search {
			width: 100%;
		}
	}
</style>
