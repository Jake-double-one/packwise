/** Global notifications shown above everything (also above open sheets). */
export interface Toast {
	id: number;
	text: string;
	kind: 'error' | 'info';
}

let next = 1;
export const toasts = $state<Toast[]>([]);

export function toast(text: string, kind: Toast['kind'] = 'error', ms = 6000) {
	const id = next++;
	toasts.push({ id, text, kind });
	setTimeout(() => dismiss(id), ms);
}

export function dismiss(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}
