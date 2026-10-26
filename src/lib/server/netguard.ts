import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Packwise talks to servers people enter themselves (ntfy, Gotify, SMTP, push services).
 * Such a request must never reach the container itself, the link-local range (cloud
 * metadata lives at 169.254.169.254) or "nothing". Private LAN ranges stay allowed on
 * purpose – a home server usually runs ntfy or Gotify right next to Packwise.
 */
export function isBlockedIp(ip: string): boolean {
	let v = ip.toLowerCase();
	if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
	if (isIP(v) === 6) v = canonicalIpv6(v);
	// IPv4 mapped into IPv6 (::ffff:127.0.0.1, written ::ffff:7f00:1 too) counts as its IPv4 address
	const mapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (mapped) {
		const [hi, lo] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
		v = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
	}
	if (isIP(v) === 4) {
		const [a, b] = v.split('.').map(Number);
		return a === 0 || a === 127 || (a === 169 && b === 254);
	}
	if (isIP(v) === 6) {
		if (v === '::' || v === '::1') return true;
		const head = parseInt(v.split(':')[0] || '0', 16);
		return (head & 0xffc0) === 0xfe80; // fe80::/10 link-local
	}
	return false;
}

/** One spelling per address (zeros compressed, embedded IPv4 in hex), as the URL parser writes it. */
function canonicalIpv6(v: string): string {
	try {
		return new URL(`http://[${v}]/`).hostname.slice(1, -1);
	} catch {
		return v;
	}
}

export function isBlockedHostname(host: string): boolean {
	const h = host.toLowerCase().replace(/\.$/, '');
	return h === 'localhost' || h.endsWith('.localhost') || h === 'metadata.google.internal';
}

/**
 * True when the host of `url` may be contacted. Resolves names via DNS so that a name
 * pointing at 127.0.0.1 is caught too. Unresolvable names are refused.
 */
export async function hostAllowed(url: string): Promise<boolean> {
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return false;
	}
	return hostnameAllowed(host);
}

export async function hostnameAllowed(host: string): Promise<boolean> {
	if (!host || isBlockedHostname(host)) return false;
	if (isIP(host.replace(/^\[|\]$/g, ''))) return !isBlockedIp(host);
	try {
		const addrs = await lookup(host, { all: true });
		return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address));
	} catch {
		return false;
	}
}
