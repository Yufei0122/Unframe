// Only the public server URL belongs in Expo configuration. Google credentials stay on Node.
const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const base = process.env.EXPO_PUBLIC_API_URL || (local ? `${window.location.protocol}//${window.location.hostname}:3000` : '');
export async function requestAI<T>(path: string, body: FormData | object, signal: AbortSignal): Promise<T> {
  const multipart = body instanceof FormData;
  let response;
  try {
    response = await fetch(`${base}/api/ai/${path}`, { method: 'POST', headers: multipart ? undefined : { 'Content-Type': 'application/json' }, body: multipart ? body : JSON.stringify(body), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Cannot reach the AI server. Start it with npm.cmd start in the project folder.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('The AI server returned an invalid response. Check the API URL.'); }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'AI request failed. Please try again.');
  return result as T;
}
