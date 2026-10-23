import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Every setting is optional and read when the app starts (see lib/server/config.ts for the defaults).
 * The identity schema keeps an unset variable `undefined` instead of making it required.
 */
const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
	DATA_DIR: optional,
	AUTH_MODE: optional,
	APP_PASSWORD: optional,
	REGISTRATION: optional,
	DEFAULT_LANG: optional,
	DEFAULT_COUNTRY: optional,
	ORIGIN: optional,
	MCP_ENABLED: optional,
	MCP_API: optional,
	SECRET_KEY: optional,
	WEATHER_ENABLED: optional,
	SESSION_DAYS: optional,
	SMTP_HOST: optional,
	SMTP_PORT: optional,
	SMTP_SECURE: optional,
	SMTP_USER: optional,
	SMTP_PASS: optional,
	SMTP_FROM: optional
});
