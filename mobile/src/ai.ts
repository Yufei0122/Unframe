import { resolveAPIBase, resolveAITimeoutMs } from './apiConfig';
import { fetch as streamFetch } from 'expo/fetch';
import { readPlanningVisit } from './planningStream';
import type { PlanningReply } from '../../shared/ai-types';
// Model services remain behind Node. Expo configuration contains only public client settings.
export const AI_TIMEOUT_MS = resolveAITimeoutMs(process.env.EXPO_PUBLIC_AI_TIMEOUT_MS, 50000);
export const CLIP_TIMEOUT_MS = resolveAITimeoutMs(process.env.EXPO_PUBLIC_CLIP_TIMEOUT_MS, 5000);
export const VISION_TIMEOUT_MS = resolveAITimeoutMs(process.env.EXPO_PUBLIC_VISION_TIMEOUT_MS, 130000);
export async function requestPlanningVisit(body: object, signal: AbortSignal, onAnswer: (answer: PlanningReply) => void) {
  const location = typeof window !== 'undefined' && window.location?.hostname ? window.location : undefined;
  const base = resolveAPIBase(process.env.EXPO_PUBLIC_API_URL, location);
  let response;
  try {
    // Expo's fetch supports response streams on web and native. Cancellation has no deadline.
    response = await streamFetch(`${base}/api/ai/routes/visit`, { method: 'POST', credentials: 'omit', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('Cannot reach the AI server. Check that it is running and the API URL is reachable from this device.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Could not plan your visit. Please retry.');
  }
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('Restart the updated AI server to use the new visit planner.');
  return readPlanningVisit(response.body, signal, onAnswer);
}
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
