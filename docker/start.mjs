// Container entrypoint: makes the data directory writable for PUID:PGID
// (default 1000:1000), drops root privileges and starts the server.
// Written in Node so the image needs no extra packages.
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || '/data';
fs.mkdirSync(dataDir, { recursive: true });

if (typeof process.getuid === 'function' && process.getuid() === 0) {
	const uid = Number(process.env.PUID ?? 1000);
	const gid = Number(process.env.PGID ?? 1000);
	const chown = (p) => {
		try {
			fs.lchownSync(p, uid, gid);
		} catch (err) {
			console.warn(`[packwise] could not chown ${p}: ${err.message}`);
			return;
		}
		if (fs.lstatSync(p).isDirectory()) for (const f of fs.readdirSync(p)) chown(path.join(p, f));
	};
	chown(dataDir);
	process.setgroups([gid]);
	process.setgid(gid);
	process.setuid(uid);
}

await import('../build/index.js');
