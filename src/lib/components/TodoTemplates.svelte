<script lang="ts">
	import { api, clientId, describeError } from '#lib/api.js';
	import { toast } from '#lib/toast.svelte.js';
	import { useI18n } from '#lib/i18n/index.js';
	import type { Person, Rules, TodoTemplate, TripPhase } from '#lib/types.js';
	import RuleChips from './RuleChips.svelte';
	import RuleSummary from './RuleSummary.svelte';
	import Sheet from './Sheet.svelte';

	/** The page owns the list (and the live connection); this shows the to-dos of one phase and hands results back. */
	let {
		todos: all,
		persons,
		canEdit,
		phase = 'pack',
		onresult
	}: { todos: TodoTemplate[]; persons: Person[]; canEdit: boolean; phase?: TripPhase; onresult: (res: { upsert: TodoTemplate[]; removed: string[] }) => void } = $props();
	const { t } = useI18n();
	const returning = $derived(phase === 'return');

	const todos = $derived(all.filter((td) => td.phase === phase));
	let editingId = $state<string | null>(null);
	let newName = $state('');
	let newDays = $state(1);
	let errorMsg = $state('');
	const sorted = $derived([...todos].sort((a, b) => b.days_before - a.days_before || a.name.localeCompare(b.name)));
	const editing = $derived(todos.find((x) => x.id === editingId) ?? null);

	async function send(body: Record<string, unknown>) {
		errorMsg = '';
		try {
			onresult(await api<{ upsert: TodoTemplate[]; removed: string[] }>('/api/todos', { ...body, client: clientId }));
		} catch (err) {
			toast(describeError(err, t));
		}
	}

	const dueLabel = (d: number) => (d === 0 ? t(returning ? 'todo.return_day' : 'todo.departure_day') : t('todo.days_before', { count: d }));
</script>

{#if errorMsg}<div class="alert danger">{errorMsg}</div>{/if}
<h2 class="phase-title">{returning ? '🏠' : '✅'} {t(returning ? 'todo.title_return' : 'todo.title')}</h2>

<div class="card list">
	{#if !sorted.length}<p class="muted small">{t('todo.empty')}</p>{/if}
	{#each sorted as td (td.id)}
		{@const person = persons.find((p) => p.id === td.person_id)}
		<div class="row todo">
			<span class="due badge">{dueLabel(td.days_before)}</span>
			<button class="name grow" onclick={() => (editingId = td.id)}>
				{td.name}
				{#if person}<span class="tiny muted">· {person.name}</span>{/if}
				<RuleSummary rules={td.rules} />
			</button>
			{#if canEdit}
				<button class="btn ghost icon" title={t('common.delete')} onclick={() => confirm(t('template.confirm_delete_item', { name: td.name })) && send({ op: 'delete', id: td.id })}>🗑</button>
			{/if}
		</div>
	{/each}
	{#if canEdit}
		<form class="row add" onsubmit={(e) => { e.preventDefault(); if (!newName.trim()) return; send({ op: 'add', name: newName, patch: { days_before: newDays, phase } }); newName = ''; }}>
			<input class="grow" placeholder={t('todo.new')} aria-label={`${t('todo.new')} – ${t(returning ? 'todo.title_return' : 'todo.title')}`} bind:value={newName} />
			<label class="days">
				<input type="number" min="0" max="365" bind:value={newDays} />
				<span class="tiny">{t('todo.days_short')}</span>
			</label>
			<button class="btn primary" aria-label={t('common.add')} title={t('common.add')}>+</button>
		</form>
	{/if}
</div>

{#if editing}
	<Sheet title={t('todo.edit')} onclose={() => (editingId = null)}>
		<div class="field">
			<label for="tdname">{t('template.name')}</label>
			<input id="tdname" value={editing.name} disabled={!canEdit} onchange={(e) => send({ op: 'update', id: editing.id, patch: { name: (e.currentTarget as HTMLInputElement).value } })} />
		</div>
		<div class="grid-2">
			<div class="field">
				<label for="tddays">{t(returning ? 'todo.due_return' : 'todo.due')}</label>
				<input id="tddays" type="number" min="0" max="365" value={editing.days_before} disabled={!canEdit} onchange={(e) => send({ op: 'update', id: editing.id, patch: { days_before: +(e.currentTarget as HTMLInputElement).value } })} />
				<p class="tiny muted">{t(returning ? 'todo.due_hint_return' : 'todo.due_hint')}</p>
			</div>
			<div class="field">
				<label for="tdperson">{t('todo.who')}</label>
				<select id="tdperson" value={editing.person_id ?? ''} disabled={!canEdit} onchange={(e) => send({ op: 'update', id: editing.id, patch: { person_id: (e.currentTarget as HTMLSelectElement).value || null } })}>
					<option value="">{t('template.everyone')}</option>
					{#each persons as p}<option value={p.id}>{p.name}</option>{/each}
				</select>
			</div>
		</div>
		<div class="field">
			<label for="tdnote">{t('template.note')}</label>
			<textarea id="tdnote" rows="2" value={editing.note} disabled={!canEdit} onchange={(e) => send({ op: 'update', id: editing.id, patch: { note: (e.currentTarget as HTMLTextAreaElement).value } })}></textarea>
		</div>
		<h3>{t('todo.when')}</h3>
		<RuleChips rules={editing.rules} disabled={!canEdit} onchange={(rules: Rules) => send({ op: 'update', id: editing.id, patch: { rules } })} />
	</Sheet>
{/if}

<style>
	.phase-title {
		font-size: 1rem;
		margin: 1rem 0 0.4rem;
	}
	.list {
		padding: 0.4rem 0.75rem;
	}
	.todo {
		border-bottom: 1px solid var(--border);
		min-height: 2.6rem;
	}
	.due {
		min-width: 5.5rem;
		justify-content: center;
	}
	.name {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		padding: 0.4rem 0;
	}
	.add {
		margin-top: 0.5rem;
	}
	.days {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
	}
	.days input {
		width: 4.5rem;
	}
</style>
