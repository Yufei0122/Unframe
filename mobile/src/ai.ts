import { resolveAPIBase, resolveAITimeoutMs } from './apiConfig';
// Model services remain behind Node. Expo configuration contains only public client settings.
export const AI_TIMEOUT_MS = resolveAITimeoutMs(process.env.EXPO_PUBLIC_AI_TIMEOUT_MS, 330000);
export const CLIP_TIMEOUT_MS = resolveAITimeoutMs(process.env.EXPO_PUBLIC_CLIP_TIMEOUT_MS, 150000);
export async function requestAI<T>(path: string, body: FormData | object, signal: AbortSignal): Promise<T> {
  const location = typeof window !== 'undefined' && window.location?.hostname ? window.location : undefined;
  const base = resolveAPIBase(process.env.EXPO_PUBLIC_API_URL, location);
  const multipart = body instanceof FormData;
  let response;
  try {
    response = await fetch(`${base}/api/ai/${path}`, { method: 'POST', headers: multipart ? undefined : { 'Content-Type': 'application/json' }, body: multipart ? body : JSON.stringify(body), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Cannot reach the AI server. Check that it is running and the API URL is reachable from this device.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('The AI server returned an invalid response. Check the API URL.'); }
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'AI request failed. Please try again.');
  return result as T;
}
