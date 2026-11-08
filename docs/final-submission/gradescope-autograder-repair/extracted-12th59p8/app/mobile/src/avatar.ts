export const MAX_AVATAR_LENGTH = 700_000;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Persist only our small, re-encoded JPEG, never an expiring blob or remote URL.
export function isAvatarDataUri(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_AVATAR_LENGTH
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function avatarCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.max(1, Math.floor(Math.min(width, height) / clamp(zoom, 1, 3)));
  return { originX: Math.round((width - side) * clamp(x, 0, 1)), originY: Math.round((height - side) * clamp(y, 0, 1)), width: side, height: side };
}
