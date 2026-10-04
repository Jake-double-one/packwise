/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
	return next;
}

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
