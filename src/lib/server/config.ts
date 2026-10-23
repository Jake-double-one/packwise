import * as env from '$app/env/private';
import path from 'node:path';

export type AuthMode = 'none' | 'local' | 'accounts';
export type RegistrationMode = 'closed' | 'invite' | 'open';

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
	const v = (value ?? '').trim().toLowerCase() as T;
	return allowed.includes(v) ? v : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/** Lazily evaluated so that the environment (declared in src/env.ts) is read at runtime, not build time. */
export const config = {
	get dataDir() {
		return path.resolve(env.DATA_DIR || './data');
	},
	get authMode(): AuthMode {
		return oneOf(env.AUTH_MODE, ['none', 'local', 'accounts'] as const, 'local');
	},
	/** Shared password for AUTH_MODE=local. */
	get appPassword() {
		return env.APP_PASSWORD ?? '';
	},
	get registration(): RegistrationMode {
		return oneOf(env.REGISTRATION, ['closed', 'invite', 'open'] as const, 'invite');
	},
	get defaultLang() {
		return (env.DEFAULT_LANG || 'en').toLowerCase();
	},
	get defaultCountry() {
		return (env.DEFAULT_COUNTRY || '').toUpperCase();
	},
	/** Public base URL, used for links in e-mails. Falls back to the request URL. */
	get origin() {
		return (env.ORIGIN || '').replace(/\/+$/, '');
	},
	/** MCP endpoint (/mcp) for AI assistants, authenticated with personal API tokens. */
	get mcpEnabled() {
		return bool(env.MCP_ENABLED ?? env.MCP_API, false);
	},
	/** Optional key for encrypting API tokens; otherwise a random key is kept in DATA_DIR/secret.key. */
	get secretKey() {
		return env.SECRET_KEY ?? '';
	},
	get weatherEnabled() {
		return bool(env.WEATHER_ENABLED, true);
	},
	get sessionDays() {
		return Number(env.SESSION_DAYS) > 0 ? Number(env.SESSION_DAYS) : 90;
	},
	smtp: {
		get host() {
			return env.SMTP_HOST ?? '';
		},
		get port() {
			return Number(env.SMTP_PORT) || 587;
		},
		get secure() {
			return bool(env.SMTP_SECURE, Number(env.SMTP_PORT) === 465);
		},
		get user() {
			return env.SMTP_USER ?? '';
		},
		get pass() {
			return env.SMTP_PASS ?? '';
		},
		get from() {
			return env.SMTP_FROM || env.SMTP_USER || '';
		},
		get enabled() {
			return !!env.SMTP_HOST;
		}
	}
};
