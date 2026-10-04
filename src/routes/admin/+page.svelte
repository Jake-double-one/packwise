<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '$lib/i18n';
	import Avatar from '$lib/components/Avatar.svelte';
	import CopyField from '$lib/components/CopyField.svelte';

	let { data, form } = $props();
	const { t } = useI18n();
</script>

<svelte:head><title>{t('admin.title')} · Packwise</title></svelte:head>

<div class="container">
	<h1>{t('admin.title')}</h1>
	<p class="muted small">{t('admin.registration', { mode: data.registration })} · SMTP: {data.smtp ? '✅' : '—'}</p>
	{#if form?.error}<div class="alert danger">{t(form.error)}</div>{/if}
	{#if form?.resetLink}
		<div class="alert success">
			<p>{t('admin.reset_link')}</p>
			<CopyField value={form.resetLink} />
		</div>
	{/if}

	<section class="card">
		<h2>{t('admin.users')}</h2>
		<ul class="list">
			{#each data.users as u}
				<li class="row">
					<Avatar name={u.name} color={u.color} />
					<div class="grow">
						<strong>{u.name}</strong>
						{#if u.is_admin}<span class="badge">admin</span>{/if}
						<div class="tiny muted">{u.email}</div>
					</div>
					<form method="POST" action="?/reset" use:enhance><input type="hidden" name="id" value={u.id} /><button class="btn small">{t('admin.reset')}</button></form>
					{#if u.id !== data.user?.id}
						<form method="POST" action="?/admin" use:enhance><input type="hidden" name="id" value={u.id} /><button class="btn small">{u.is_admin ? t('admin.revoke') : t('admin.make_admin')}</button></form>
						<form method="POST" action="?/delete" use:enhance={({ cancel }) => { if (!confirm(t('admin.confirm_delete', { name: u.name }))) cancel(); }}>
							<input type="hidden" name="id" value={u.id} /><button class="btn small danger">{t('common.delete')}</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section class="card">
		<h2>{t('admin.create_user')}</h2>
		<form method="POST" action="?/create" use:enhance>
			<div class="grid-2">
				<div class="field"><label for="n">{t('settings.name')}</label><input id="n" name="name" required /></div>
				<div class="field"><label for="e">{t('auth.email')}</label><input id="e" name="email" type="email" required /></div>
				<div class="field"><label for="p">{t('auth.password')}</label><input id="p" name="password" type="password" minlength="8" required /></div>
			</div>
			<button class="btn primary">{t('admin.create_user')}</button>
		</form>
	</section>
</div>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.list li:last-child {
		border-bottom: none;
	}
</style>
