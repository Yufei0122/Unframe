/** Native has no browser origin: its server must be reachable from the device. */
export function resolveAPIBase(configured: string | undefined, location?: { hostname: string; protocol: string }) {
  if (configured?.trim()) {
    const base = configured.trim().replace(/\/+$/, '');
    let url: URL;
    try { url = new URL(base); } catch { throw new Error('EXPO_PUBLIC_API_URL must be a full http:// or https:// server URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
      throw new Error('EXPO_PUBLIC_API_URL must be a full http:// or https:// server URL without credentials, query or fragment.');
    }
    return base;
  }
  if (!location) throw new Error('Set EXPO_PUBLIC_API_URL to an AI server URL reachable from this device and restart Expo. Use a deployed backend or HTTPS development proxy.');
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? `${location.protocol}//${location.hostname}:3000` : '';
}

/** Keep every interactive request bounded; invalid settings fall back to the feature deadline. */
export function resolveAITimeoutMs(configured: string | undefined, fallback: number) {
  const value = Number(configured);
  return Number.isInteger(value) && value >= 1000 && value <= 900000 ? value : fallback;
}
