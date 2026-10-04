<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import CopyField from '$lib/components/CopyField.svelte';

	let { data, form } = $props();
	const { t } = useI18n();
	const kinds = ['adult', 'child', 'baby', 'pet'];
	const kindIcon: Record<string, string> = { adult: '🧑', child: '🧒', baby: '👶', pet: '🐾' };
	const bagIcons = ['🧳', '🎒', '👜', '💼', '🛍️', '📦', '🚗', '🧺'];
	const isOwner = $derived(data.hh?.role === 'owner');
	const canEdit = $derived(data.hh?.role === 'owner' || data.hh?.role === 'member');
	let country = $derived(data.hh?.home_country ?? '');
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>{t('nav.household')} · Packwise</title></svelte:head>

<div class="container">
	{#if data.households.length > 1}
		<div class="switch row wrap">
			{#each data.households as h}
				<form method="POST" action="?/switch" use:enhance>
					<input type="hidden" name="id" value={h.id} />
					<button class="chip" class:on={h.id === data.hh?.id}>🏠 {h.name}</button>
				</form>
			{/each}
		</div>
	{/if}

	<h1>{data.hh?.name ?? t('nav.household')}</h1>
	{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}

	{#if data.hh}
		<section class="card">
			<h2>{t('household.general')}</h2>
			<form method="POST" action="?/update" use:enhance={keep}>
				<div class="grid-2">
					<div class="field">
						<label for="hname">{t('household.name')}</label>
						<input id="hname" name="name" value={data.hh.name} required disabled={!isOwner} />
					</div>
					<div class="field">
						<label for="country">{t('household.home_country')}</label>
						<CountrySelect bind:value={country} />
					</div>
				</div>
				<p class="tiny muted">{t('household.home_country_hint')}</p>
				{#if isOwner}<button class="btn primary">{t('common.save')}</button>{/if}
			</form>
		</section>

		<section class="card">
			<h2>{t('household.persons')}</h2>
			<p class="small muted">{t('household.persons_hint')}</p>
			<ul class="list">
				{#each data.persons as p, i (p.id)}
					<li>
						<form method="POST" action="?/updatePerson" class="row wrap" use:enhance={keep}>
							<input type="hidden" name="id" value={p.id} />
							<!-- Enter in a field must save, not move: the first submit button is the default -->
							<button class="sr-only" tabindex="-1" aria-hidden="true">{t('common.save')}</button>
							{#if canEdit}
								<div class="order">
									<button class="btn ghost icon" formaction="?/movePerson" name="dir" value="up" disabled={i === 0} title={t('common.move_up')}>↑</button>
									<button class="btn ghost icon" formaction="?/movePerson" name="dir" value="down" disabled={i === data.persons.length - 1} title={t('common.move_down')}>↓</button>
								</div>
							{/if}
							<Avatar name={p.name} color={p.color} size={32} />
							<input class="grow name" name="name" value={p.name} aria-label={t('settings.name')} disabled={!canEdit} />
							<select name="kind" value={p.kind} aria-label={t('household.kind')} disabled={!canEdit}>
								{#each kinds as k}<option value={k}>{kindIcon[k]} {t(`kind.${k}`)}</option>{/each}
							</select>
							<input type="color" name="color" value={p.color} aria-label={t('settings.color')} disabled={!canEdit} />
							{#if canEdit}
								<button class="btn small">{t('common.save')}</button>
								{#if p.kind !== 'pet' && !data.bags.some((b) => b.person_id === p.id)}
									<button class="btn small" formaction="?/createBags" title={t('household.create_bags_hint')}>🧳 {t('household.create_bags')}</button>
								{/if}
								<button class="btn small danger" formaction="?/deletePerson" onclick={(e) => { if (!confirm(t('household.confirm_delete_person', { name: p.name }))) e.preventDefault(); }}>✕</button>
							{/if}
						</form>
					</li>
				{/each}
			</ul>
			{#if canEdit}
				<form method="POST" action="?/addPerson" class="row wrap add" use:enhance>
					<input class="grow" name="name" placeholder={t('household.new_person')} required />
					<select name="kind">
						{#each kinds as k}<option value={k}>{kindIcon[k]} {t(`kind.${k}`)}</option>{/each}
					</select>
					<button class="btn primary">+ {t('common.add')}</button>
				</form>
			{/if}
		</section>

		<section class="card">
			<h2>{t('household.bags')}</h2>
			<p class="small muted">{t('household.bags_hint')}</p>
			<ul class="list">
				{#each data.bags as b, i (b.id)}
					<li class="bag" style="--bag:{b.color}">
						<form method="POST" action="?/updateBag" class="row wrap" use:enhance={keep}>
							<input type="hidden" name="id" value={b.id} />
							<!-- Enter in a field must save, not move: the first submit button is the default -->
							<button class="sr-only" tabindex="-1" aria-hidden="true">{t('common.save')}</button>
							{#if canEdit}
								<div class="order">
									<button class="btn ghost icon" formaction="?/moveBag" name="dir" value="up" disabled={i === 0} title={t('common.move_up')}>↑</button>
									<button class="btn ghost icon" formaction="?/moveBag" name="dir" value="down" disabled={i === data.bags.length - 1} title={t('common.move_down')}>↓</button>
								</div>
							{/if}
							<select name="icon" value={b.icon} class="icon" aria-label="Icon" disabled={!canEdit}>
								{#each bagIcons as i}<option value={i}>{i}</option>{/each}
							</select>
							<input class="grow name" name="name" value={b.name} aria-label={t('settings.name')} disabled={!canEdit} />
							{#if b.person_id}
								{@const owner = data.persons.find((p) => p.id === b.person_id)}
								{#if owner}<span title={t('household.bag_owner', { name: owner.name })}><Avatar name={owner.name} color={owner.color} size={26} /></span>{/if}
							{/if}
							<input type="color" name="color" value={b.color} aria-label={t('settings.color')} disabled={!canEdit} />
							{#if canEdit}
								<button class="btn small">{t('common.save')}</button>
								<button class="btn small danger" formaction="?/deleteBag" onclick={(e) => { if (!confirm(t('household.confirm_delete_bag', { name: b.name }))) e.preventDefault(); }}>✕</button>
							{/if}
						</form>
					</li>
				{/each}
			</ul>
			{#if canEdit}
				<form method="POST" action="?/addBag" class="row wrap add" use:enhance>
					<select name="icon" class="icon">{#each bagIcons as i}<option value={i}>{i}</option>{/each}</select>
					<input class="grow" name="name" placeholder={t('household.new_bag')} required />
					<input type="color" name="color" value="#8b5cf6" />
					<button class="btn primary">+ {t('common.add')}</button>
				</form>
			{/if}
		</section>

		{#if data.authMode === 'accounts'}
			<section class="card">
				<h2>{t('household.members')}</h2>
				<ul class="list">
					{#each data.members as m (m.user_id)}
						<li class="row wrap">
							<Avatar name={m.name} color={m.color} />
							<div class="grow"><strong>{m.name}</strong><div class="tiny muted">{m.email}</div></div>
							{#if isOwner}
								<form method="POST" action="?/role" class="row" use:enhance={keep}>
									<input type="hidden" name="user_id" value={m.user_id} />
									<select name="role" value={m.role} onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}>
										{#each ['owner', 'member', 'packer'] as r}<option value={r}>{t(`role.${r}`)}</option>{/each}
									</select>
								</form>
								{#if m.user_id !== data.user?.id}
									<form method="POST" action="?/removeMember" use:enhance>
										<input type="hidden" name="user_id" value={m.user_id} />
										<button class="btn small danger">✕</button>
									</form>
								{/if}
							{:else}
								<span class="badge">{t(`role.${m.role}`)}</span>
							{/if}
						</li>
					{/each}
				</ul>
				{#if isOwner}
					<hr />
					<h3>{t('household.invite')}</h3>
					<p class="small muted">{t('household.invite_hint')}</p>
					<form method="POST" action="?/invite" class="row wrap" use:enhance={keep}>
						<input class="grow" name="email" type="email" placeholder={data.smtp ? t('household.invite_email') : t('household.invite_email_nosmtp')} />
						<select name="role">
							{#each ['member', 'packer', 'owner'] as r}<option value={r}>{t(`role.${r}`)}</option>{/each}
						</select>
						<button class="btn primary">{t('household.create_invite')}</button>
					</form>
					{#if form?.inviteLink}
						<div class="alert success invite">
							{#if form.mailed}<p>{t('household.invite_mailed')}</p>{/if}
							<CopyField value={form.inviteLink} />
							<p class="tiny muted">{t('household.invite_valid')}</p>
						</div>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}

	<section class="card">
		<h2>{t('household.new_household')}</h2>
		<p class="small muted">{t('household.new_household_hint')}</p>
		<form method="POST" action="?/create" class="row wrap" use:enhance>
			<input class="grow" name="name" placeholder={t('household.name')} required />
			<button class="btn">+ {t('household.create')}</button>
		</form>
		{#if isOwner && data.households.length > 1}
			<hr />
			<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm(t('household.confirm_delete', { name: data.hh?.name ?? '' }))) cancel(); }}>
				<button class="btn danger">{t('household.delete')}</button>
			</form>
		{/if}
	</section>
</div>

<style>
	.switch {
		margin-bottom: 1rem;
	}
	.list {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0;
	}
	.list li {
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
	}
	.list li:last-child {
		border-bottom: none;
	}
	.list select,
	.add select {
		width: auto;
	}
	.name {
		min-width: 8rem;
	}
	.icon {
		width: 4rem !important;
	}
	.bag {
		border-left: 4px solid var(--bag) !important;
		padding-left: 0.6rem !important;
		background: color-mix(in srgb, var(--bag) var(--tint), transparent);
		border-radius: 6px;
		margin-bottom: 0.35rem;
	}
	.invite {
		margin-top: 0.75rem;
	}
	.order {
		display: flex;
		flex-direction: column;
	}
	.order .btn {
		min-width: 1.8rem;
		min-height: 1.3rem;
		padding: 0 0.2rem;
		font-size: 0.8rem;
		line-height: 1;
	}
	.order .btn:disabled {
		opacity: 0.2;
	}
</style>
