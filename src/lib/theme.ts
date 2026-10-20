/**
 * The browser chrome (status bar, title bar of the installed app) follows the page: light,
 * dark or true black. Called after the theme changes and when the system switches.
 */
export const THEME_COLORS = { light: '#ffffff', dark: '#171a23', amoled: '#000000' } as const;

export function effectiveTheme(pref: string, systemDark: boolean): keyof typeof THEME_COLORS {
	if (pref === 'dark' || pref === 'amoled') return pref;
	if (pref === 'light') return 'light';
	return systemDark ? 'dark' : 'light';
}

export function applyThemeColor() {
	if (typeof document === 'undefined') return;
	const pref = document.documentElement.dataset.theme || 'system';
	const theme = effectiveTheme(pref, matchMedia('(prefers-color-scheme: dark)').matches);
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_COLORS[theme];
}
