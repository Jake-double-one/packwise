/**
 * "Install as app": Chrome on Android and desktop announce that the page is installable
 * with a `beforeinstallprompt` event – caught here as early as possible, so the settings
 * page can offer a real button instead of explaining the browser menu.
 */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const install = $state<{ prompt: (() => Promise<void>) | null }>({ prompt: null });

export function captureInstallPrompt() {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		const ev = e as BeforeInstallPromptEvent;
		install.prompt = async () => {
			await ev.prompt();
			if ((await ev.userChoice).outcome === 'accepted') install.prompt = null;
		};
	});
	window.addEventListener('appinstalled', () => (install.prompt = null));
}

/** Opened from the home screen (or as a desktop app)? */
export const isStandalone = () =>
	typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
