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

/** Opened from the home screen: Android colours the navigation bar after the phone's mode. */
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Keeps exactly one theme-color tag (some browsers take the first tag for the bars, whatever its
 * media query). In a browser tab the bars follow the app's theme. In the installed app the Android
 * navigation bar follows the phone (the manifest has no theme_color on purpose), so the status bar
 * and the navigation buttons follow the phone too – otherwise dark buttons would sit on a dark bar.
 * A dark theme on a dark phone keeps its own colour (AMOLED stays black).
 */
export function applyThemeColor() {
	if (typeof document === 'undefined') return;
	const pref = document.documentElement.dataset.theme || 'system';
	const phoneDark = matchMedia('(prefers-color-scheme: dark)').matches;
	let theme = effectiveTheme(pref, phoneDark);
	if (installed() && (theme === 'light') === phoneDark) theme = phoneDark ? 'dark' : 'light';
	const tags = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
	const tag = tags[0] ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
	for (const extra of tags.slice(1)) extra.remove();
	tag.removeAttribute('media');
	tag.content = THEME_COLORS[theme];
}
