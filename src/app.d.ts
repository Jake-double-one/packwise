import type { SessionUser, AppHousehold } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			/** true once the gate (password / session) has been passed */
			unlocked: boolean;
			household: AppHousehold | null;
			locale: string;
			theme: string;
		}
	}
}

export {};
