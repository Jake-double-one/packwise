/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
	// as the browser reads it: tabs and line breaks are dropped, backslashes become slashes
	try {
		const url = new URL(next, 'http://packwise.invalid');
		if (url.origin !== 'http://packwise.invalid') return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}

export function str(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}
