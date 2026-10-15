/** Stored as an emoji or as `img:<version>` (the picture itself lives in users.avatar_img). */
export function avatarUrl(userId: string, avatar: string | null | undefined): string | null {
	if (!avatar) return null;
	return avatar.startsWith('img:') ? `/api/avatar/${userId}?v=${avatar.slice(4)}` : avatar;
}

/** Small pictures only: the browser resizes to 160 px before uploading. */
export const MAX_AVATAR_CHARS = 200_000;
export const AVATAR_DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;
