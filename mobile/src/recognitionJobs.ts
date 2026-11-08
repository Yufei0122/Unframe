import type { ArtworkAnalysis, RecognitionResult } from '../../shared/ai-types';
import { resolveAPIBase } from './apiConfig';

export type JobOperation = 'recognise' | 'analyse';
export type JobStatus = 'WAITING_UPLOAD' | 'PROCESSING' | 'RETRYING' | 'SUCCEEDED' | 'FAILED';
export type RecognitionJob = { jobId: string; readToken: string; status: 'WAITING_UPLOAD'; upload: { url: string; headers: Record<string, string>; expiresAt: number }; pollAfterMs: number };
export type JobResult = { jobId: string; status: JobStatus; operation: JobOperation; result?: RecognitionResult | ArtworkAnalysis; error?: { code: string; message: string }; pollAfterMs: number };
export type JobImage = { contentType: string; sizeBytes: number;
  // Web supplies Blob; native supplies a file upload callback without changing file ownership/cleanup.
  upload: (url: string, headers: Record<string, string>, signal: AbortSignal) => Promise<void> };

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Recognition cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export function createRecognitionJobClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  const base = baseUrl.trim() ? resolveAPIBase(baseUrl) : '';
  const json = async (path: string, init: RequestInit) => {
    const response = await fetchImpl(base + path, { ...init, credentials: 'omit' });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Recognition job request failed.');
    return data;
  };
  return {
    async create(image: Pick<JobImage, 'contentType' | 'sizeBytes'>, museumId: string, operation: JobOperation, signal: AbortSignal): Promise<RecognitionJob> {
      const job = await json('/a3/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ museumId, operation, contentType: image.contentType, sizeBytes: image.sizeBytes }), signal });
      if (typeof job?.jobId !== 'string' || typeof job.readToken !== 'string' || job.status !== 'WAITING_UPLOAD'
        || typeof job.upload?.url !== 'string' || !job.upload.url.startsWith('https://') || !job.upload.headers) throw new Error('Invalid recognition upload response.');
      return job;
    },
    async poll(job: RecognitionJob, signal: AbortSignal, onStatus?: (status: JobStatus) => void): Promise<RecognitionResult | ArtworkAnalysis> {
      while (!signal.aborted) {
        const state: JobResult = await json(`/a3/jobs/${encodeURIComponent(job.jobId)}`, { headers: { 'X-Job-Token': job.readToken }, signal });
        if (state.jobId !== job.jobId || !['WAITING_UPLOAD', 'PROCESSING', 'RETRYING', 'SUCCEEDED', 'FAILED'].includes(state.status)) throw new Error('Invalid recognition job status.');
        onStatus?.(state.status);
        if (state.status === 'FAILED') throw new Error(state.error?.message || 'Recognition failed.');
        if (state.status === 'SUCCEEDED') {
          if (!state.result || (state.operation === 'recognise' ? !('candidates' in state.result) || !Array.isArray(state.result.candidates) : state.operation !== 'analyse' || !('identityStatus' in state.result))) throw new Error('Invalid recognition job result.');
          return state.result;
        }
        await wait(Math.max(500, Math.min(5000, state.pollAfterMs || 1500)), signal);
      }
      throw new Error('Recognition cancelled.');
    },
    async run(image: JobImage, museumId: string, operation: JobOperation, signal: AbortSignal, onStatus?: (status: JobStatus) => void) {
      signal.throwIfAborted();
      const job = await this.create(image, museumId, operation, signal);
      onStatus?.('WAITING_UPLOAD');
      signal.throwIfAborted();
      await image.upload(job.upload.url, job.upload.headers, signal);
      return this.poll(job, signal, onStatus);
    },
  };
}

export function browserJobImage(blob: Blob, fetchImpl: typeof fetch = fetch): JobImage {
  return { contentType: blob.type, sizeBytes: blob.size, async upload(url, headers, signal) {
    const response = await fetchImpl(url, { method: 'PUT', headers, body: blob, signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Image upload failed. Please retry with a new job.');
  } };
}
