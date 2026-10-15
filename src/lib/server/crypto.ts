import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

/**
 * Secrets stored in the database (API tokens, SMTP password, notification tokens)
 * are AES-256-GCM encrypted with SECRET_KEY, or else a random key kept in DATA_DIR/secret.key.
 */
let key: Buffer | null = null;
function secretKey(): Buffer {
	if (key) return key;
	if (config.secretKey) return (key = createHash('sha256').update(config.secretKey).digest());
	const file = path.join(config.dataDir, 'secret.key');
	if (!fs.existsSync(file)) {
		fs.mkdirSync(config.dataDir, { recursive: true });
		fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
	}
	return (key = createHash('sha256').update(fs.readFileSync(file, 'utf8').trim()).digest());
}

export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

/** null if the key changed since the value was stored */
export function decrypt(stored: string): string | null {
	try {
		const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
		const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}
