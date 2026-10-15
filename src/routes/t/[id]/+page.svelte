<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { api, ApiError, clientId, describeError, live } from '$lib/api';
	import { toast } from '$lib/toast.svelte';
	import { countryFlag } from '$lib/data/countries';
	import { todoDue } from '$lib/generate';
	import { formatDate, formatRange, timeAgo, useI18n } from '$lib/i18n';
	import { applyLocal, clientRowId, loadQueue, OFFLINE_OPS, saveQueue, type Op, type TripState } from '$lib/offline';
	import { childrenMap, mergeNodes } from '$lib/tree';
	import type { TripItem, TripNote, TripPhase, TripTodo } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import ItemEditor from '$lib/components/ItemEditor.svelte';
	import Ring from '$lib/components/Ring.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import WarningList from '$lib/components/WarningList.svelte';
	import WeatherCard from '$lib/components/WeatherCard.svelte';
	import ShareDialog from '$lib/components/ShareDialog.svelte';
	import TripInfo from '$lib/components/TripInfo.svelte';

	let { data } = $props();
	const i18n = useI18n();
	const { t } = i18n;

	type View = 'category' | 'bag' | 'person';
	type TemplateInfo = (typeof data.template)[string];

	// derived from page data (resets on navigation), but locally writable for live updates
	let items = $derived<TripItem[]>(data.items);
	let todos = $derived<TripTodo[]>(data.todos);
	let tripName = $derived(data.trip.name);
	let phase = $derived<TripPhase>(data.trip.phase);
	let todosEnabled = $derived(data.trip.todos_enabled);
	let notes = $derived<TripNote[]>(data.trip.notes);
	let template = $derived<Record<string, TemplateInfo>>(data.template);
	let todoTemplateIds = $derived(new Set<string>(data.todoTemplateIds));
	let activity = $derived(data.activity);
	let presence = $state<{ id: string; name: string; color: string }[]>([]);
	let online = $state(true);
	let queue = $state<Op[]>([]);
	let view = $state<View>('category');
	let personFilter = $state<string | null>(null);
	let hideChecked = $state(false);
	let editingId = $state<string | null>(null);
	/** compact list: the editor changes the same item of all travellers in the row */
	let editingGroup = $state<string[]>([]);
	let deleting = $state<{ kind: 'item' | 'todo'; id: string; name: string; ids?: string[] } | null>(null);
	/** compact checklist (one row per item, one box per traveller) – per device, on by default */
	let compact = $state(true);
	let showShare = $state(false);
	let showActivity = $state(false);
	let showWarnings = $state(true);
	let showTodos = $state(true);
	/** "info" is a per-device view; packing / return phase is shared with everybody */
	let tab = $state<'list' | 'info'>('list');
	let errorMsg = $state('');
	const drafts = $state<Record<string, string>>({});
	let quickAdd = $state('');
	let newTodo = $state('');
	let newTodoDays = $state(1);

	// drag & drop (mouse / trackpad only – on touch screens dragging fights with scrolling)
	let canDrag = $state(false);
	let dragIds = $state<string[]>([]);
	let dropKey = $state<string | null>(null);

	function dragStart(e: DragEvent, list: TripItem[]) {
		dragIds = list.map((i) => i.id);
		e.dataTransfer?.setData('text/plain', dragIds[0]);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function dragEnd() {
		dragIds = [];
		dropKey = null;
	}
	function dragOver(e: DragEvent, key: string) {
		if (!dragIds.length) return;
		e.preventDefault();
		e.stopPropagation();
		dropKey = key;
	}
	/** Dropping onto a card: category → move, bag → change bag, person → change person. */
	function drop(e: DragEvent, target: { kind: 'group' | 'bag' | 'person'; id: string | null }) {
		e.preventDefault();
		e.stopPropagation();
		const moving = items.filter((i) => dragIds.includes(i.id));
		dragEnd();
		for (const it of moving) {
			if (target.kind === 'group' && it.parent_id !== target.id && it.id !== target.id) send({ op: 'move', id: it.id, parent_id: target.id });
			if (target.kind === 'bag' && (it.bag_id ?? null) !== target.id) send({ op: 'update', id: it.id, patch: { bag_id: target.id } });
			if (target.kind === 'person' && (it.person_id ?? null) !== target.id) send({ op: 'update', id: it.id, patch: { person_id: target.id } });
		}
	}

	const returning = $derived(phase === 'return');
	const tree = $derived(childrenMap(items));
	const bagById = $derived(new Map(data.bags.map((b) => [b.id, b])));
	const personById = $derived(new Map(data.persons.map((p) => [p.id, p])));
	const editing = $derived(items.find((i) => i.id === editingId) ?? null);
	const travellers = $derived(data.persons.filter((p) => data.trip.settings.persons.includes(p.id)));
	/** In return mode consumables are used up – they don't count. */
	const relevant = (it: TripItem) => !returning || !it.consumable;
	const isDone = (it: TripItem) => (returning ? it.returned : it.checked);
	const allItems = $derived(items.filter((i) => i.kind === 'item'));
	const counted = $derived(allItems.filter(relevant));
	const done = $derived(counted.filter(isDone).length);
	const today = new Date().toISOString().slice(0, 10);
	const daysUntil = $derived(Math.round((Date.parse(data.trip.start_date) - Date.parse(today)) / 86_400_000));
	const homeward = $derived(!returning && today >= data.trip.end_date.slice(0, 10) && Date.parse(today) - Date.parse(data.trip.end_date) < 3 * 86_400_000);
	const sortedTodos = $derived([...todos].sort((a, b) => b.days_before - a.days_before || a.name.localeCompare(b.name)));
	const todosDone = $derived(todos.filter((x) => x.done).length);

	// ── sync ────────────────────────────────────────────────────────────────
	const getState = (): TripState => ({ items, todos, name: tripName, phase, notes });
	function setState(s: TripState) {
		items = s.items;
		todos = s.todos;
		tripName = s.name;
		phase = s.phase;
		notes = s.notes;
	}

	onMount(() => {
		canDrag = window.matchMedia('(pointer: fine)').matches;
		try {
			view = (localStorage.getItem('pw_view') as View) || 'category';
			hideChecked = localStorage.getItem('pw_hide_checked') === '1';
			compact = localStorage.getItem('pw_compact') !== '0';
		} catch {
			/* storage unavailable */
		}
		const tripId = data.trip.id;
		// replay changes made offline (page may come from the offline cache)
		queue = loadQueue(tripId);
		if (queue.length) {
			let st = getState();
			for (const op of queue) st = applyLocal(st, op, data.user?.id ?? null);
			setState(st);
			flush();
		}
		const onOnline = () => flush();
		window.addEventListener('online', onOnline);
		const close = live(
			`/api/trips/${tripId}/live`,
			{
				ops: (msg) => {
					if (msg.client === clientId) return;
					applyResult(msg);
				},
				presence: (list) => (presence = list),
				deleted: () => goto('/')
			},
			(state) => {
				const wasOffline = !online;
				online = state;
				if (state && (wasOffline || queue.length)) flush();
			}
		);
		return () => {
			close();
			window.removeEventListener('online', onOnline);
		};
	});

	$effect(() => {
		try {
			localStorage.setItem('pw_view', view);
			localStorage.setItem('pw_hide_checked', hideChecked ? '1' : '0');
			localStorage.setItem('pw_compact', compact ? '1' : '0');
		} catch {
			/* ignore */
		}
	});

	async function resync() {
		if (queue.length) return;
		try {
			const res = await fetch(`/api/trips/${data.trip.id}`);
			if (!res.ok) return;
			const fresh = await res.json();
			items = fresh.items;
			todos = fresh.todos;
			activity = fresh.activity;
			tripName = fresh.trip.name;
			phase = fresh.trip.phase;
			todosEnabled = fresh.trip.todos_enabled;
			notes = fresh.trip.notes ?? [];
		} catch {
			/* offline */
		}
	}

	interface OpResult {
		upsert: TripItem[];
		removed: string[];
		activity?: (typeof activity)[number];
		template?: { upsert: ({ id: string } & TemplateInfo)[]; removed: string[] };
		trip?: { name?: string; phase?: TripPhase; todos_enabled?: boolean; notes?: TripNote[]; reload?: boolean };
		todos?: { upsert: TripTodo[]; removed: string[] };
		todoTemplate?: { upsert: { id: string }[]; removed: string[] };
	}

	function applyResult(r: OpResult) {
		items = mergeNodes(items, r.upsert, r.removed);
		if (r.todos) todos = mergeNodes(todos, r.todos.upsert, r.todos.removed);
		if (r.activity) activity = [r.activity, ...activity].slice(0, 100);
		if (r.trip?.name) tripName = r.trip.name;
		if (r.trip?.phase) phase = r.trip.phase;
		if (r.trip && 'todos_enabled' in r.trip) todosEnabled = !!r.trip.todos_enabled;
		if (r.trip?.notes) notes = r.trip.notes;
		// destination / dates changed: weather, hints and header come from the server
		if (r.trip?.reload) invalidateAll();
		if (r.template) {
			const next = { ...template };
			for (const id of r.template.removed) delete next[id];
			for (const n of r.template.upsert) next[n.id] = { name: n.name, bag_id: n.bag_id, note: n.note, needs_power: n.needs_power, consumable: n.consumable };
			template = next;
		}
		if (r.todoTemplate) {
			const next = new Set(todoTemplateIds);
			r.todoTemplate.removed.forEach((id) => next.delete(id));
			r.todoTemplate.upsert.forEach((x) => next.add(x.id));
			todoTemplateIds = next;
		}
	}

	const post = (op: Op) => api<OpResult>(`/api/trips/${data.trip.id}`, { ...op, client: clientId });

	function enqueue(op: Op) {
		queue = [...queue, op];
		saveQueue(data.trip.id, queue);
	}

	let flushing = false;
	/** Replays queued offline changes in order. */
	async function flush() {
		if (flushing || !queue.length) return;
		flushing = true;
		try {
			while (queue.length) {
				try {
					applyResult(await post(queue[0]));
				} catch (err) {
					if (!(err instanceof ApiError)) break; // still offline
					// rejected by the server (e.g. item deleted meanwhile) – drop it
				}
				queue = queue.slice(1);
				saveQueue(data.trip.id, queue);
			}
		} finally {
			flushing = false;
		}
		if (!queue.length) await resync();
	}

	async function send(op: Op) {
		errorMsg = '';
		const offlineable = OFFLINE_OPS.has(op.op);
		if (offlineable) setState(applyLocal(getState(), op, data.user?.id ?? null));
		if (offlineable && queue.length) {
			enqueue(op); // keep order behind earlier offline changes
			flush();
			return null;
		}
		try {
			const res = await post(op);
			applyResult(res);
			return res;
		} catch (err) {
			if (err instanceof ApiError) {
				toast(describeError(err, t));
				await resync();
			} else if (offlineable) {
				online = false;
				enqueue(op);
			} else {
				toast(t('offline.needs_connection'));
			}
			return null;
		}
	}

	function toggle(it: TripItem) {
		if (returning) {
			if (!it.consumable) send({ op: 'return', id: it.id, returned: !it.returned });
			return;
		}
		if (!it.checked && navigator.vibrate) navigator.vibrate(10);
		send({ op: 'check', id: it.id, checked: !it.checked });
	}

	function setDone(it: TripItem, value: boolean) {
		if (returning) {
			if (!it.consumable && it.returned !== value) send({ op: 'return', id: it.id, returned: value });
		} else if (it.checked !== value) send({ op: 'check', id: it.id, checked: value });
	}

	/** The "all" box of a compact row: checks everybody, or – if all are done – unchecks everybody. */
	function toggleAll(list: TripItem[]) {
		const rel = list.filter(relevant);
		if (!rel.length) return;
		const all = rel.every(isDone);
		if (!all && !returning && navigator.vibrate) navigator.vibrate(10);
		rel.forEach((it) => setDone(it, !all));
	}

	function openEditor(list: TripItem[]) {
		editingId = list[0].id;
		editingGroup = list.map((i) => i.id);
	}
	function closeEditor() {
		editingId = null;
		editingGroup = [];
	}
	/** In a compact row, changes apply to the item of every traveller (bag and person stay personal). */
	function patchEditing(patch: Partial<TripItem>) {
		const ids = editingGroup.length ? editingGroup : editingId ? [editingId] : [];
		for (const id of ids) send({ op: 'update', id, patch });
	}

	function templateState(it: TripItem): 'linked' | 'differs' | 'new' | 'auto' {
		if (it.origin === 'auto') return 'auto';
		const tpl = it.template_id ? template[it.template_id] : undefined;
		if (!tpl) return 'new';
		// personal items are moved into each traveller's own bag on purpose – that is no deviation
		const tplBag = tpl.bag_id ? bagById.get(tpl.bag_id) : undefined;
		const bagDiffers = (tpl.bag_id ?? null) !== (it.bag_id ?? null) && !(tplBag?.person_id && it.person_id);
		if (tpl.name !== it.name || bagDiffers || tpl.note !== it.note) return 'differs';
		return 'linked';
	}

	function requestDelete(it: TripItem, ids: string[] = [it.id]) {
		const linked = it.template_id && template[it.template_id] && data.canEditTemplate;
		if (linked) deleting = { kind: 'item', id: it.id, name: it.name, ids };
		else if (confirm(ids.length > 1 ? t('trip.confirm_delete_all', { name: it.name, count: ids.length }) : t('trip.confirm_delete', { name: it.name }))) {
			ids.forEach((id) => send({ op: 'delete', id }));
			closeEditor();
		}
	}

	function requestTodoDelete(td: TripTodo) {
		const linked = td.template_id && todoTemplateIds.has(td.template_id) && data.canEditTemplate;
		if (linked) deleting = { kind: 'todo', id: td.id, name: td.name };
		else if (confirm(t('trip.confirm_delete', { name: td.name }))) send({ op: 'todoDelete', id: td.id });
	}

	async function confirmDelete(alsoTemplate: boolean) {
		if (!deleting) return;
		const { kind, id, ids } = deleting;
		deleting = null;
		closeEditor();
		if (kind === 'item' && ids && ids.length > 1) {
			// the template entry is shared – remove it once, the other copies only from the trip
			for (const [i, rid] of ids.entries()) await send({ op: 'delete', id: rid, alsoTemplate: alsoTemplate && i === 0 });
			return;
		}
		await send({ op: kind === 'item' ? 'delete' : 'todoDelete', id, alsoTemplate });
	}

	async function addItem(parentId: string | null, name: string, patch: Record<string, unknown> = {}) {
		if (!name.trim()) return;
		await send({ op: 'add', id: clientRowId(), parent_id: parentId, kind: 'item', name, patch });
	}

	async function addTodo() {
		const name = newTodo.trim();
		if (!name) return;
		newTodo = '';
		await send({ op: 'todoAdd', id: clientRowId(), name, days_before: newTodoDays });
	}

	function rename() {
		const name = prompt(t('trip.rename'), tripName);
		if (name && name.trim() && name !== tripName) send({ op: 'rename', name });
	}

	function setPhase(p: TripPhase) {
		if (p !== phase) send({ op: 'phase', phase: p });
	}

	async function deleteTrip() {
		if (!confirm(t('trip.confirm_delete_trip', { name: tripName }))) return;
		const res = await fetch(`/api/trips/${data.trip.id}`, { method: 'DELETE' });
		if (res.ok) goto('/');
	}

	function dueInfo(td: TripTodo): { label: string; cls: string } {
		const due = todoDue(data.trip.start_date, td.days_before);
		const diff = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
		const date = formatDate(due, i18n.locale, { weekday: 'short', day: 'numeric', month: 'short' });
		if (td.done) return { label: date, cls: '' };
		if (diff < 0) return { label: `${t('todo.overdue')} · ${date}`, cls: 'overdue' };
		if (diff === 0) return { label: t('todo.today'), cls: 'today' };
		return { label: diff === 1 ? t('todo.tomorrow') : date, cls: diff <= 2 ? 'soon' : '' };
	}

	// ── filtering / grouping ────────────────────────────────────────────────
	const matches = (it: TripItem) =>
		(!hideChecked || !isDone(it) || !relevant(it)) && (personFilter === null || (personFilter === '' ? !it.person_id : it.person_id === personFilter));

	function countIn(id: string): { total: number; done: number } {
		let total = 0;
		let d = 0;
		for (const c of tree.get(id) ?? []) {
			if (c.kind === 'item') {
				if (!relevant(c)) continue;
				total++;
				if (isDone(c)) d++;
			} else {
				const sub = countIn(c.id);
				total += sub.total;
				d += sub.done;
			}
		}
		return { total, done: d };
	}

	function hasVisible(id: string): boolean {
		return (tree.get(id) ?? []).some((c) => (c.kind === 'item' ? matches(c) : hasVisible(c.id)));
	}

	const flatGroups = $derived.by(() => {
		if (view === 'category') return [];
		const key = view === 'bag' ? 'bag_id' : 'person_id';
		const source = view === 'bag' ? data.bags : travellers.length ? travellers : data.persons;
		const kindIcon: Record<string, string> = { pet: '🐾 ', baby: '👶 ', child: '🧒 ' };
		const groups = source.map((s) => ({
			id: s.id,
			name: 'icon' in s ? `${s.icon} ${s.name}` : `${kindIcon[(s as { kind?: string }).kind ?? ''] ?? ''}${s.name}`,
			color: s.color,
			items: allItems.filter((i) => i[key] === s.id)
		}));
		groups.push({ id: '', name: view === 'bag' ? t('trip.no_bag') : t('trip.shared'), color: '', items: allItems.filter((i) => !i[key] || !source.some((s) => s.id === i[key])) });
		// every traveller (pets too) gets a card – also as a drop target when still empty
		return groups.filter((g) => g.items.length || (view === 'person' && g.id !== ''));
	});

	// ── compact checklist ───────────────────────────────────────────────────
	const compactOn = $derived(compact && view === 'category' && personFilter === null);
	const personOrder = $derived(new Map(data.persons.map((p, i) => [p.id, i])));
	type Entry = { kind: 'group'; node: TripItem } | { kind: 'row'; key: string; items: TripItem[] };
	/** The same item (same name, same category) of several travellers becomes one row – whether it comes from one per-traveller entry or from separate personal entries. */
	const entriesByParent = $derived.by(() => {
		const out = new Map<string | null, Entry[]>();
		for (const [pid, list] of tree) {
			const entries: Entry[] = [];
			const byKey = new Map<string, { kind: 'row'; key: string; items: TripItem[] }>();
			for (const c of list) {
				if (c.kind === 'group') {
					entries.push({ kind: 'group', node: c });
					continue;
				}
				const k = c.person_id && personById.has(c.person_id) ? c.name.trim().toLowerCase() : null;
				const existing = k ? byKey.get(k) : undefined;
				// one box per traveller and row: a second copy for the same person gets its own row
				if (existing && !existing.items.some((i) => i.person_id === c.person_id)) {
					existing.items.push(c);
					continue;
				}
				const e = { kind: 'row' as const, key: c.id, items: [c] };
				if (k && !existing) byKey.set(k, e);
				entries.push(e);
			}
			for (const e of entries) if (e.kind === 'row') e.items.sort((a, b) => (personOrder.get(a.person_id ?? '') ?? 99) - (personOrder.get(b.person_id ?? '') ?? 99));
			out.set(pid, entries);
		}
		return out;
	});
	function collectPersons(id: string | null, acc: Set<string>) {
		for (const c of tree.get(id) ?? []) {
			if (c.kind === 'group') collectPersons(c.id, acc);
			else if (c.person_id && personById.has(c.person_id)) acc.add(c.person_id);
		}
	}
	const itemById = $derived(new Map(items.map((i) => [i.id, i])));
	/** The top-level card a nested group belongs to (its columns are shared by all nested rows). */
	function rootOf(g: TripItem): string {
		let cur = g;
		while (cur.parent_id && itemById.get(cur.parent_id)) cur = itemById.get(cur.parent_id)!;
		return cur.id;
	}
	/** Columns of a card: everybody who has a personal item somewhere inside it. */
	function columnsFor(id: string): typeof data.persons {
		const acc = new Set<string>();
		collectPersons(id, acc);
		return data.persons.filter((p) => acc.has(p.id));
	}

	// sticky card headers sit right below the (sticky) toolbar
	let toolbarEl = $state<HTMLElement | null>(null);
	let stickTop = $state(0);
	$effect(() => {
		const el = toolbarEl;
		if (!el) return;
		const measure = () => (stickTop = (parseFloat(getComputedStyle(el).top) || 0) + el.offsetHeight);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		window.addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	const ringsPerson = $derived(
		travellers
			.map((p) => {
				const own = counted.filter((i) => i.person_id === p.id);
				return { p, total: own.length, done: own.filter(isDone).length };
			})
			.filter((r) => r.total)
	);
	const ringsBag = $derived(
		data.bags
			.map((b) => {
				const own = counted.filter((i) => i.bag_id === b.id);
				return { b, total: own.length, done: own.filter(isDone).length };
			})
			.filter((r) => r.total)
	);
	const pendingTemplate = $derived(items.filter((i) => i.kind === 'item' && templateState(i) !== 'linked' && templateState(i) !== 'auto'));
</script>

<svelte:head><title>{tripName} · Packwise</title></svelte:head>

<div class="container trip-page" class:return-mode={returning}>
	<header class="trip-head">
		<div class="row between top">
			<div class="grow">
				<h1>
					<span class="flag">{countryFlag(data.trip.country)}</span>
					<button class="title-btn" onclick={rename} title={t('trip.rename')}>{tripName}</button>
				</h1>
				<p class="muted small meta">
					{#if data.trip.destination}{data.trip.destination}{' · '}{/if}{formatRange(data.trip.start_date, data.trip.end_date, i18n.locale)}
					{#if daysUntil > 0} · <strong>{t('trips.in_days', { count: daysUntil })}</strong>{/if}
				</p>
			</div>
			<div class="row no-print actions">
				<div class="presence row" title={t('trip.online_now')}>
					{#each presence as p (p.id)}<Avatar name={p.name} color={p.color} size={26} />{/each}
					<span class="dot" class:off={!online} title={online ? t('trip.live') : t('trip.offline')}></span>
				</div>
				{#if queue.length}<span class="badge pending" title={t('offline.pending_hint')}>⏳ {queue.length}</span>{/if}
				<button class="btn" onclick={() => (showShare = true)}>🔗 <span class="hide-sm">{t('trip.share')}</span></button>
			</div>
		</div>

		<div class="seg phase no-print" role="tablist">
			<button role="tab" aria-selected={tab === 'list' && !returning} class:on={tab === 'list' && !returning} onclick={() => { tab = 'list'; setPhase('pack'); }}>🧳 {t('trip.phase_pack')}</button>
			<button role="tab" aria-selected={tab === 'list' && returning} class:on={tab === 'list' && returning} onclick={() => { tab = 'list'; setPhase('return'); }}>🏠 {t('trip.phase_return')}</button>
			<button role="tab" aria-selected={tab === 'info'} class:on={tab === 'info'} class="info" onclick={() => (tab = 'info')}>ℹ️ {t('trip.tab_info')}</button>
		</div>

		<div class="rings row wrap no-print">
			<div class="ring-main row">
				<Ring value={done} total={counted.length} size={64} />
				<div>
					<strong>{returning ? t('trip.return_progress', { done, total: counted.length }) : t('trips.items_progress', { done, total: counted.length })}</strong>
					<div class="tiny muted">{returning ? t('trip.returned') : t('trip.packed')}</div>
				</div>
			</div>
			{#each ringsPerson as r (r.p.id)}
				<button class="ring-chip" class:on={personFilter === r.p.id} onclick={() => (personFilter = personFilter === r.p.id ? null : r.p.id)}>
					<Ring value={r.done} total={r.total} size={38} color={r.p.color} label={r.p.name} />
					<span class="tiny">{r.p.name}</span>
				</button>
			{/each}
			{#each ringsBag as r (r.b.id)}
				<div class="ring-chip static">
					<Ring value={r.done} total={r.total} size={38} color={r.b.color} label={r.b.name} />
					<span class="tiny">{r.b.icon} {r.b.name}</span>
				</div>
			{/each}
		</div>
	</header>

	{#if tab === 'info'}
		<TripInfo trip={data.trip} {notes} homeCountry={data.homeCountry} canEdit={data.canDelete} {send} />
	{:else}
	{#if data.trip.weather || data.trip.warnings.length}
		<div class="info-grid no-print">
			{#if data.trip.weather}<WeatherCard weather={data.trip.weather} compact />{/if}
			{#if data.trip.warnings.length}
				<div>
					<button class="btn ghost small" onclick={() => (showWarnings = !showWarnings)}>
						{showWarnings ? '▾' : '▸'} {t('trip.hints', { count: data.trip.warnings.length })}
					</button>
					{#if showWarnings}<WarningList warnings={data.trip.warnings} />{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if !online || queue.length}
		<div class="alert warning no-print small">📴 {queue.length ? t('offline.pending', { count: queue.length }) : t('offline.banner')}</div>
	{/if}

	{#if homeward}
		<div class="alert success no-print row wrap">
			<span class="grow">🏠 {t('trip.homeward')}</span>
			<button class="btn small primary" onclick={() => setPhase('return')}>{t('trip.start_return')}</button>
		</div>
	{/if}

	{#if returning}
		<div class="alert return no-print row wrap small">
			<span class="grow">🏠 {t('trip.return_hint')}</span>
			<button class="btn small ghost" onclick={() => confirm(t('trip.confirm_reset_return')) && send({ op: 'resetReturn' })}>↺ {t('trip.reset_return')}</button>
		</div>
	{/if}

	{#if todosEnabled && !returning}
		<section class="card todos" class:all-done={todos.length > 0 && todosDone === todos.length}>
			<div class="row between">
				<button class="todo-head grow" onclick={() => (showTodos = !showTodos)}>
					<h2><span class="no-print">{showTodos ? '▾' : '▸'}</span> ✅ {t('todo.title')}</h2>
				</button>
				<span class="gcount tiny" class:complete={todos.length > 0 && todosDone === todos.length}>{todosDone}/{todos.length}</span>
			</div>
			{#if showTodos}
				{#each sortedTodos as td (td.id)}
					{@const due = dueInfo(td)}
					{@const person = td.person_id ? personById.get(td.person_id) : null}
					<div class="item todo" class:checked={td.done}>
						<button class="box" onclick={() => send({ op: 'todoCheck', id: td.id, done: !td.done })} aria-pressed={td.done} aria-label={td.name}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
						</button>
						<span class="label static-label"><span class="nm">{td.name}</span>{#if td.note}<span class="note tiny">{td.note}</span>{/if}</span>
						<span class="due tiny {due.cls}">{due.label}</span>
						{#if data.canEditTemplate && (!td.template_id || !todoTemplateIds.has(td.template_id))}
							<button class="tpl-btn new no-print" onclick={() => send({ op: 'todoPromote', id: td.id })} title={t('trip.promote')}>↑ {t('trip.to_template')}</button>
						{/if}
						{#if person}<Avatar name={person.name} color={person.color} size={24} />{/if}
						<button class="btn ghost icon no-print del" title={t('common.delete')} onclick={() => requestTodoDelete(td)}>✕</button>
					</div>
				{/each}
				<form class="add-row row no-print" onsubmit={(e) => { e.preventDefault(); addTodo(); }}>
					<span class="plus">+</span>
					<input class="grow" placeholder={t('todo.new')} bind:value={newTodo} />
					<input class="days" type="number" min="0" max="365" bind:value={newTodoDays} aria-label={t('todo.due')} />
					<span class="tiny muted">{t('todo.days_short')}</span>
				</form>
			{/if}
		</section>
	{/if}

	{#if pendingTemplate.length && data.canEditTemplate}
		<div class="alert no-print small">📋 {t('trip.pending_template', { count: pendingTemplate.length })}</div>
	{/if}

	<div class="toolbar row wrap no-print" bind:this={toolbarEl}>
		<div class="seg">
			{#each [['category', '📂'], ['bag', '🧳'], ['person', '👤']] as [v, icon]}
				<button class:on={view === v} onclick={() => (view = v as View)}>{icon} <span class="hide-sm">{t(`trip.view_${v}`)}</span></button>
			{/each}
		</div>
		{#if view === 'category'}
			<button class="btn ghost small" class:on={compact} aria-pressed={compact} onclick={() => (compact = !compact)} title={compact ? t('trip.compact_off') : t('trip.compact_on')}>
				{compact ? '▦' : '☰'} <span class="hide-sm">{compact ? t('trip.compact') : t('trip.single')}</span>
			</button>
		{/if}
		<select class="filter" bind:value={personFilter} aria-label={t('trip.filter_person')}>
			<option value={null}>👥 {t('trip.everyone')}</option>
			{#each data.persons as p}<option value={p.id}>{p.name}</option>{/each}
			<option value="">{t('trip.shared')}</option>
		</select>
		<label class="check small"><input type="checkbox" bind:checked={hideChecked} /> {returning ? t('trip.hide_returned') : t('trip.hide_checked')}</label>
		<div class="grow"></div>
		{#if !todosEnabled}
			<button class="btn ghost small" onclick={() => send({ op: 'todos', enabled: true })}>✅ <span class="hide-sm">{t('todo.enable')}</span></button>
		{/if}
		<button class="btn ghost small" onclick={() => (showActivity = true)}>🕘 <span class="hide-sm">{t('trip.activity')}</span></button>
		<button class="btn ghost small" onclick={() => window.print()}>🖨 <span class="hide-sm">{t('trip.print')}</span></button>
	</div>

	{#if errorMsg}<div class="alert danger">{errorMsg}</div>{/if}

	{#snippet itemRow(it: TripItem)}
		{@const bag = it.bag_id ? bagById.get(it.bag_id) : null}
		{@const person = it.person_id ? personById.get(it.person_id) : null}
		{@const state = templateState(it)}
		{@const used = returning && it.consumable}
		<div
			class="item"
			class:checked={isDone(it) && !used}
			class:used
			class:has-bag={!!bag}
			class:dragging={dragIds.includes(it.id)}
			style={bag ? `--bag:${bag.color}` : ''}
			draggable={canDrag}
			ondragstart={(e) => dragStart(e, [it])}
			ondragend={dragEnd}
			role="listitem"
		>
			<button class="box" onclick={() => toggle(it)} aria-pressed={isDone(it)} aria-label={it.name} disabled={used}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			</button>
			<button class="label" onclick={() => openEditor([it])}>
				<span class="nm">{it.name}</span>
				{#if it.qty > 1}<span class="badge qty">×{it.qty}</span>{/if}
				{#if it.needs_power}<span class="tiny">⚡</span>{/if}
				{#if used}<span class="badge">🧴 {t('trip.used_up')}</span>{:else if returning && !it.checked}<span class="tiny muted">{t('trip.not_packed')}</span>{/if}
				{#if it.note}<span class="note tiny">{it.note}</span>{/if}
			</button>
			{#if data.canEditTemplate && state === 'new'}
				<button class="tpl-btn new no-print" onclick={() => send({ op: 'promote', id: it.id })} title={t('trip.promote')}>↑ {t('trip.to_template')}</button>
			{:else if data.canEditTemplate && state === 'differs'}
				<button class="tpl-btn no-print" onclick={() => send({ op: 'syncTemplate', id: it.id })} title={t('trip.sync')}>⟳</button>
			{:else if state === 'auto'}
				<span class="auto tiny no-print" title={it.reason}>✨</span>
			{/if}
			{#if bag && view !== 'bag'}<span class="bag-ico" title={bag.name}>{bag.icon}</span>{/if}
			{#if person && view !== 'person'}<Avatar name={person.name} color={person.color} size={24} />{/if}
		</div>
	{/snippet}

	{#snippet colHead(cols: typeof data.persons)}
		<div class="cells head" class:many={cols.length >= 5} aria-hidden="true">
			<span class="cell all-label">{t('trip.all')}</span>
			{#each cols as p (p.id)}<span class="cell" title={p.name}><Avatar name={p.name} color={p.color} size={22} /></span>{/each}
		</div>
	{/snippet}

	{#snippet compactRow(list: TripItem[], cols: typeof data.persons)}
		{@const it = list[0]}
		{@const personal = !!it.person_id}
		{@const bag = !personal && it.bag_id ? bagById.get(it.bag_id) : null}
		{@const state = templateState(it)}
		{@const used = returning && it.consumable}
		{@const rel = list.filter(relevant)}
		{@const allDone = rel.length > 0 && rel.every(isDone)}
		{@const sameQty = list.every((i) => i.qty === it.qty)}
		<div
			class="item compact"
			class:checked={allDone && !used}
			class:used
			class:has-bag={!!bag}
			class:dragging={dragIds.includes(it.id)}
			style={bag ? `--bag:${bag.color}` : ''}
			draggable={canDrag}
			ondragstart={(e) => dragStart(e, list)}
			ondragend={dragEnd}
			role="listitem"
		>
			<button class="label" onclick={() => openEditor(list)}>
				<span class="nm">{it.name}</span>
				{#if sameQty && it.qty > 1}<span class="badge qty">×{it.qty}</span>{/if}
				{#if it.needs_power}<span class="tiny">⚡</span>{/if}
				{#if used}<span class="badge">🧴 {t('trip.used_up')}</span>{/if}
				{#if it.note}<span class="note tiny">{it.note}</span>{/if}
			</button>
			{#if data.canEditTemplate && state === 'new'}
				<button class="tpl-btn new no-print" onclick={() => send({ op: 'promote', id: it.id })} title={t('trip.promote')}>↑ {t('trip.to_template')}</button>
			{:else if data.canEditTemplate && state === 'differs'}
				<button class="tpl-btn no-print" onclick={() => list.forEach((i) => send({ op: 'syncTemplate', id: i.id }))} title={t('trip.sync')}>⟳</button>
			{:else if state === 'auto'}
				<span class="auto tiny no-print" title={it.reason}>✨</span>
			{/if}
			{#if bag}<span class="bag-ico" title={bag.name}>{bag.icon}</span>{/if}
			<div class="cells" class:many={cols.length >= 5}>
				<button class="box all" class:on={allDone} onclick={() => (personal ? toggleAll(list) : toggle(it))} aria-pressed={allDone} aria-label={personal ? `${it.name}: ${t('trip.all')}` : it.name} disabled={used}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
				</button>
				{#each cols as p (p.id)}
					{@const pi = list.find((i) => i.person_id === p.id)}
					{#if pi}
						<button class="box" class:on={isDone(pi)} onclick={() => toggle(pi)} aria-pressed={isDone(pi)} aria-label={`${it.name}: ${p.name}`} title={p.name} disabled={used}>
							<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
						</button>
					{:else}
						<span class="cell none">{personal ? '–' : ''}</span>
					{/if}
				{/each}
			</div>
		</div>
	{/snippet}

	{#snippet groupBlock(g: TripItem, depth: number)}
		{#if hasVisible(g.id) || (!hideChecked && personFilter === null)}
			{@const c = countIn(g.id)}
			{@const cols = compactOn ? columnsFor(depth === 1 ? g.id : rootOf(g)) : []}
			<section
				class="group depth-{depth}"
				class:drop={dropKey === g.id}
				ondragover={(e) => dragOver(e, g.id)}
				ondragleave={() => dropKey === g.id && (dropKey = null)}
				ondrop={(e) => drop(e, { kind: 'group', id: g.id })}
				aria-label={g.name}
			>
				<div class="ghead row" class:stick={compactOn && depth === 1}>
					<h2 class="grow"><button class="gname" onclick={() => openEditor([g])} title={t('trip.edit_group')}>{g.name}</button></h2>
					{#if data.canEditTemplate && templateState(g) === 'new' && g.origin !== 'auto'}
						<button class="tpl-btn new no-print" onclick={() => send({ op: 'promote', id: g.id })}>↑ {t('trip.to_template')}</button>
					{:else if data.canEditTemplate && templateState(g) === 'differs'}
						<button class="tpl-btn no-print" onclick={() => send({ op: 'syncTemplate', id: g.id })} title={t('trip.sync')}>⟳</button>
					{/if}
					<span class="gcount tiny" class:complete={c.total > 0 && c.done === c.total}>{c.done}/{c.total}</span>
					{#if compactOn && depth === 1}{@render colHead(cols)}{/if}
				</div>
				{#if compactOn}
					{#each entriesByParent.get(g.id) ?? [] as e (e.kind === 'group' ? e.node.id : e.key)}
						{#if e.kind === 'group'}
							{@render groupBlock(e.node, depth + 1)}
						{:else if e.items.some(matches)}
							{@render compactRow(e.items, cols)}
						{/if}
					{/each}
				{:else}
					{#each tree.get(g.id) ?? [] as child (child.id)}
						{#if child.kind === 'group'}
							{@render groupBlock(child, depth + 1)}
						{:else if matches(child)}
							{@render itemRow(child)}
						{/if}
					{/each}
				{/if}
				<form class="add-row row no-print" onsubmit={async (e) => { e.preventDefault(); const n = drafts[g.id] ?? ''; drafts[g.id] = ''; await addItem(g.id, n); }}>
					<span class="plus">+</span>
					<input class="grow" placeholder={t('template.add_item')} bind:value={drafts[g.id]} />
				</form>
			</section>
		{/if}
	{/snippet}

	{#if canDrag}<p class="tiny muted no-print drag-hint">↕ {t('trip.drag_hint')}</p>{/if}
	<div class="list" role="list" style="--stick:{stickTop}px">
		{#if compactOn}
			{#each entriesByParent.get(null) ?? [] as e (e.kind === 'group' ? e.node.id : e.key)}
				{#if e.kind === 'group'}
					{@render groupBlock(e.node, 1)}
				{:else if e.items.some(matches)}
					{@const cols = data.persons.filter((p) => e.items.some((i) => i.person_id === p.id))}
					<section class="group depth-1 loose">
						{#if cols.length}<div class="ghead row stick loose-head"><span class="grow"></span>{@render colHead(cols)}</div>{/if}
						{@render compactRow(e.items, cols)}
					</section>
				{/if}
			{/each}
		{:else if view === 'category'}
			{#each tree.get(null) ?? [] as top (top.id)}
				{#if top.kind === 'group'}
					{@render groupBlock(top, 1)}
				{:else if matches(top)}
					<section class="group depth-1 loose">{@render itemRow(top)}</section>
				{/if}
			{/each}
		{:else}
			{#each flatGroups as g (g.id)}
				<section
					class="group depth-1"
					style={g.color ? `--bag:${g.color}` : ''}
					class:tinted={!!g.color}
					class:drop={dropKey === `flat:${g.id}`}
					ondragover={(e) => dragOver(e, `flat:${g.id}`)}
					ondragleave={() => dropKey === `flat:${g.id}` && (dropKey = null)}
					ondrop={(e) => drop(e, { kind: view === 'bag' ? 'bag' : 'person', id: g.id || null })}
					aria-label={g.name}
				>
					<div class="ghead row">
						<h2 class="grow">{g.name}</h2>
						<span class="gcount tiny">{g.items.filter((i) => relevant(i) && isDone(i)).length}/{g.items.filter(relevant).length}</span>
					</div>
					{#each g.items.filter(matches) as it (it.id)}{@render itemRow(it)}{/each}
				</section>
			{/each}
		{/if}
	</div>

	<form class="card quick no-print row" onsubmit={async (e) => { e.preventDefault(); const n = quickAdd; quickAdd = ''; await addItem(null, n, view === 'person' && personFilter ? { person_id: personFilter } : {}); }}>
		<input class="grow" placeholder={t('trip.quick_add')} bind:value={quickAdd} />
		<button class="btn primary">+</button>
	</form>
	{/if}

	{#if data.canDelete}
		<div class="danger-zone no-print">
			<button class="btn ghost small" onclick={deleteTrip}>🗑 {t('trip.delete')}</button>
		</div>
	{/if}
</div>

{#if editing}
	<ItemEditor
		item={editing}
		persons={data.persons}
		bags={data.bags}
		templateState={templateState(editing)}
		canEditTemplate={data.canEditTemplate}
		groupNames={editingGroup.length > 1 ? editingGroup.map((id) => personById.get(items.find((i) => i.id === id)?.person_id ?? '')?.name ?? '?') : []}
		onpatch={patchEditing}
		ondelete={() => requestDelete(editing, editingGroup.length ? editingGroup : [editing.id])}
		onpromote={() => send({ op: 'promote', id: editing.id })}
		onsync={() => (editingGroup.length ? editingGroup : [editing.id]).forEach((id) => send({ op: 'syncTemplate', id }))}
		onclose={closeEditor}
	/>
{/if}

{#if deleting}
	<Sheet title={t('trip.delete_title', { name: deleting.name })} onclose={() => (deleting = null)}>
		<p>{deleting.kind === 'todo' ? t('todo.delete_question') : t('trip.delete_question')}</p>
		<div class="stack">
			<button class="btn" onclick={() => confirmDelete(false)}>🧳 {t('trip.delete_only_trip')}</button>
			<button class="btn danger" onclick={() => confirmDelete(true)}>📋 {t('trip.delete_also_template')}</button>
		</div>
	</Sheet>
{/if}

{#if showShare}
	<ShareDialog url={`${page.url.origin}/t/${data.trip.id}`} name={tripName} onclose={() => (showShare = false)} />
{/if}

{#if showActivity}
	<Sheet title={t('trip.activity')} onclose={() => (showActivity = false)}>
		{#if !activity.length}<p class="muted">{t('trip.no_activity')}</p>{/if}
		<ul class="activity">
			{#each activity as a}
				<li>
					<strong>{a.actor}</strong>
					{t(`activity.${a.action}`)}
					<em>{a.subject}</em>
					<span class="tiny muted">· {timeAgo(a.at, i18n.locale)}</span>
				</li>
			{/each}
		</ul>
	</Sheet>
{/if}

<style>
	.trip-head {
		margin-bottom: 0.9rem;
	}
	.return-mode {
		--accent: #0d9488;
		--accent-soft: color-mix(in srgb, #0d9488 14%, transparent);
	}
	.phase {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px;
		margin-top: 0.6rem;
	}
	.phase button {
		border: none;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.3rem 0.85rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.phase button.on {
		background: var(--accent);
		color: #fff;
	}
	.phase button.info.on {
		background: var(--text-2);
		color: var(--bg);
	}
	.pending {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.alert.return {
		background: var(--accent-soft);
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.todos {
		margin-bottom: 0.9rem;
	}
	.todos.all-done {
		opacity: 0.8;
	}
	.todo-head {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		text-align: left;
		padding: 0;
		cursor: pointer;
	}
	.todo-head h2 {
		font-size: 1rem;
		margin: 0.2rem 0;
	}
	.static-label {
		cursor: default;
	}
	.due {
		white-space: nowrap;
		color: var(--text-3);
		font-weight: 600;
	}
	.due.soon {
		color: var(--warning);
	}
	.due.today,
	.due.overdue {
		color: var(--danger);
	}
	.todo .del {
		min-width: 1.9rem;
		min-height: 1.9rem;
		opacity: 0.5;
	}
	.add-row .days {
		width: 4.2rem;
		background: var(--surface-2);
	}
	.item.used {
		opacity: 0.5;
	}
	.box:disabled {
		cursor: not-allowed;
		border-style: dashed;
	}
	.top {
		align-items: flex-start;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.15rem;
	}
	.flag {
		font-size: 1.8rem;
	}
	.title-btn {
		background: none;
		border: none;
		font: inherit;
		color: inherit;
		padding: 0;
		cursor: text;
		text-align: left;
	}
	.meta {
		margin: 0;
	}
	.presence {
		gap: 0;
	}
	.presence :global(.avatar) {
		margin-left: -6px;
		border: 2px solid var(--bg);
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--success);
		margin-left: 0.4rem;
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 25%, transparent);
	}
	.dot.off {
		background: var(--danger);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 25%, transparent);
	}
	.rings {
		margin-top: 0.9rem;
		gap: 0.6rem;
	}
	.ring-main {
		gap: 0.7rem;
		margin-right: 0.6rem;
	}
	.ring-chip {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.35rem;
		color: var(--text-2);
		font: inherit;
		cursor: pointer;
	}
	.ring-chip.static {
		cursor: default;
	}
	.ring-chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.info-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
		gap: 0.75rem;
		align-items: start;
		margin-bottom: 0.5rem;
	}
	@media (max-width: 700px) {
		.info-grid {
			grid-template-columns: 1fr;
		}
	}
	.toolbar {
		position: sticky;
		top: 3.3rem;
		z-index: 5;
		background: var(--bg);
		padding: 0.5rem 0;
		margin-bottom: 0.5rem;
		gap: 0.5rem;
	}
	.seg {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px;
	}
	.seg button {
		border: none;
		background: none;
		color: var(--text-2);
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.3rem 0.75rem;
		border-radius: 999px;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	.filter {
		width: auto;
		padding: 0.35rem 0.6rem;
		font-size: 0.85rem;
	}
	.trip-page {
		max-width: 1320px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	/* two columns from laptop width – cards flow like a masonry */
	@media (min-width: 1000px) {
		.list {
			display: block;
			columns: 2;
			column-gap: 1rem;
		}
		.list > .group {
			break-inside: avoid;
			margin-bottom: 1rem;
		}
	}
	.group.depth-1 {
		display: block;
		background: var(--surface);
		border: 1px solid color-mix(in srgb, var(--text-3) 30%, var(--border));
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 0 0.6rem 0.4rem;
		/* clip (not hidden) so the sticky card header still sticks to the viewport */
		overflow: clip;
	}
	.group.depth-1 > .ghead {
		margin: 0 -0.6rem 0.35rem;
		padding: 0.55rem 0.8rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
	}
	.group.tinted {
		border-top: 4px solid var(--bag);
	}
	.group.tinted > .ghead {
		background: color-mix(in srgb, var(--bag) var(--tint), var(--surface-2));
	}
	.group.depth-2,
	.group.depth-3,
	.group.depth-4 {
		margin-top: 0.6rem;
		padding-left: 0.6rem;
		border-left: 3px solid color-mix(in srgb, var(--accent) 35%, var(--border));
	}
	.group.drop {
		outline: 2px dashed var(--accent);
		outline-offset: 2px;
		background: color-mix(in srgb, var(--accent) 6%, var(--surface));
	}
	/* compact checklist: card header with the travellers stays visible while scrolling */
	.group.depth-1 > .ghead.stick {
		position: sticky;
		top: var(--stick, 0px);
		z-index: 3;
		/* same right edge as the boxes of the rows (card padding + row padding) */
		padding-right: 0.95rem;
	}
	.cells {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
		--cell: 1.75rem;
	}
	.cells.many {
		--cell: 1.45rem;
		gap: 0.2rem;
	}
	.cells .box,
	.cells .cell {
		width: var(--cell);
		height: var(--cell);
	}
	.cells .cell {
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.cells.head .cell :global(.avatar) {
		width: min(22px, var(--cell)) !important;
		height: min(22px, var(--cell)) !important;
	}
	/* the "all" box is set apart from the travellers' boxes */
	.cells .box.all,
	.cells .all-label {
		margin-right: 0.3rem;
	}
	.cells .box.all {
		border-radius: 50%;
	}
	.all-label {
		font-size: 0.62rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--text-2);
		overflow: hidden;
	}
	.cell.none {
		color: var(--text-3);
	}
	.box.on {
		background: var(--success);
		border-color: var(--success);
	}
	.box.on svg {
		stroke-dashoffset: 0;
		stroke: #fff;
	}
	.item.compact {
		gap: 0.4rem;
	}
	.loose-head {
		min-height: 0;
		padding-top: 0.3rem !important;
		padding-bottom: 0.3rem !important;
	}
	.gname {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		text-align: left;
		cursor: pointer;
	}
	.gname:hover {
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.ghead h2 {
		font-size: 1.05rem;
		font-weight: 800;
		margin: 0;
	}
	.depth-2 > .ghead h2,
	.depth-3 > .ghead h2,
	.depth-4 > .ghead h2 {
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
	}
	.item[draggable='true'] {
		cursor: grab;
	}
	.item.dragging {
		opacity: 0.4;
	}
	.drag-hint {
		margin: 0 0 0.5rem;
	}
	.gcount {
		color: var(--text-3);
		font-weight: 700;
	}
	.gcount.complete {
		color: var(--success);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.2rem 0.35rem;
		border-radius: var(--radius-sm);
		min-height: 2.75rem;
		transition: opacity 0.2s;
	}
	.item.has-bag {
		background: color-mix(in srgb, var(--bag) var(--tint), transparent);
		border-left: 3px solid var(--bag);
		margin: 3px 0;
	}
	.box {
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 8px;
		border: 2px solid var(--text-3);
		background: var(--surface);
		display: grid;
		place-items: center;
		cursor: pointer;
		padding: 0;
		transition: background 0.15s, border-color 0.15s, transform 0.1s;
	}
	.box:active {
		transform: scale(0.9);
	}
	.box svg {
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: var(--on-accent);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 24;
		stroke-dashoffset: 24;
		transition: stroke-dashoffset 0.2s;
	}
	.checked .box {
		background: var(--success);
		border-color: var(--success);
	}
	.checked .box svg {
		stroke-dashoffset: 0;
		stroke: #fff;
	}
	.label {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
		background: none;
		border: none;
		color: var(--text);
		font: inherit;
		text-align: left;
		padding: 0.35rem 0;
		cursor: pointer;
	}
	.checked .nm {
		text-decoration: line-through;
		color: var(--text-3);
	}
	.checked {
		opacity: 0.8;
	}
	.note {
		width: 100%;
		color: var(--text-3);
	}
	.qty {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.tpl-btn {
		border: 1px dashed var(--accent);
		background: none;
		color: var(--accent);
		border-radius: 999px;
		font: inherit;
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.tpl-btn:hover {
		background: var(--accent-soft);
	}
	.auto {
		opacity: 0.7;
	}
	.add-row {
		padding: 0 0.35rem;
	}
	.add-row .plus {
		color: var(--text-3);
		font-weight: 700;
		width: 1.75rem;
		text-align: center;
	}
	.add-row input {
		background: transparent;
		border-color: transparent;
		padding: 0.35rem;
		font-size: 0.9rem;
	}
	.add-row input:focus {
		background: var(--surface-2);
	}
	.quick {
		margin-top: 1rem;
	}
	.danger-zone {
		margin-top: 2rem;
		text-align: center;
	}
	.activity {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.activity li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	@media (max-width: 640px) {
		.hide-sm {
			display: none;
		}
		.toolbar {
			top: 3.1rem;
		}
	}
	@media print {
		.group.depth-1 > .ghead.stick {
			position: static;
		}
		.gcount {
			display: none;
		}
		.box,
		.cells :global(.avatar) {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
		.item {
			min-height: 0;
			padding: 0.05rem 0;
			break-inside: avoid;
		}
		.box {
			width: 0.9rem;
			height: 0.9rem;
			border-radius: 3px;
			border-width: 1px;
		}
		/* cards may continue in the next column / on the next page (only rows stay whole),
		   so big categories don't leave half-empty pages behind */
		.group.depth-1 {
			box-shadow: none;
			margin-bottom: 0.6rem;
			break-inside: auto;
		}
		.ghead {
			break-after: avoid;
		}
		.list {
			display: block;
			columns: 2;
			column-gap: 1.5rem;
		}
	}
</style>
