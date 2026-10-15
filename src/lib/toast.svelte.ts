/** Global notifications shown above everything (also above open sheets). */
export interface Toast {
	id: number;
	text: string;
	kind: 'error' | 'info';
	/** e.g. "Undo" */
	action?: { label: string; run: () => void };
	/** a new toast of the same group replaces the old one (e.g. one undo at a time) */
	group?: string;
}

let next = 1;
export const toasts = $state<Toast[]>([]);

export function toast(text: string, kind: Toast['kind'] = 'error', ms = 6000, extra: Pick<Toast, 'action' | 'group'> = {}) {
	if (extra.group) for (const t of toasts.filter((x) => x.group === extra.group)) dismiss(t.id);
	const id = next++;
	toasts.push({ id, text, kind, ...extra });
	setTimeout(() => dismiss(id), ms);
	return id;
}

export function dismiss(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}
