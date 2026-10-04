/** Copies text, falling back to execCommand on insecure (plain-HTTP LAN) origins. */
export async function copyText(value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		return;
	} catch {
		/* clipboard API needs HTTPS */
	}
	const el = document.createElement('textarea');
	el.value = value;
	el.style.position = 'fixed';
	el.style.opacity = '0';
	document.body.appendChild(el);
	el.select();
	document.execCommand('copy');
	el.remove();
}
