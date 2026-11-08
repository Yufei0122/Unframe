import type { ArtworkAnalysis, RecognitionResult } from '../../shared/ai-types';
import { browserJobImage, createRecognitionJobClient, type JobStatus } from './recognitionJobs';

// Web-only boundary: native capture and temporary-file ownership are untouched.
export function createWebScanTransport({ mode, baseUrl, requestLocal, fetchImpl = fetch }: {
  mode: string; baseUrl: string;
  requestLocal: (path: string, body: FormData, signal: AbortSignal) => Promise<RecognitionResult | ArtworkAnalysis>;
  fetchImpl?: typeof fetch;
}) {
  if (!['local', 'jobs'].includes(mode)) throw new Error('EXPO_PUBLIC_RECOGNITION_MODE must be local or jobs.');
  const client = mode === 'jobs' ? createRecognitionJobClient(baseUrl, fetchImpl) : null;
  const run = async (blob: Blob, museumId: string, operation: 'recognise' | 'analyse', signal: AbortSignal, onStatus?: (status: JobStatus) => void) => {
    signal.throwIfAborted();
    if (client) return client.run(browserJobImage(blob, fetchImpl), museumId, operation, signal, onStatus);
    const form = new FormData(); form.append('image', blob, 'artwork.jpg');
    return requestLocal(`artworks/${operation}${operation === 'recognise' ? '?museumId=' + encodeURIComponent(museumId) : ''}`, form, signal);
  };
  return {
    jobs: Boolean(client),
    recognise: (blob: Blob, museumId: string, signal: AbortSignal, onStatus?: (status: JobStatus) => void) => run(blob, museumId, 'recognise', signal, onStatus) as Promise<RecognitionResult>,
    analyse: (blob: Blob, museumId: string, signal: AbortSignal, onStatus?: (status: JobStatus) => void) => run(blob, museumId, 'analyse', signal, onStatus) as Promise<ArtworkAnalysis>,
  };
}

export function scanJobStatusLabel(status: JobStatus | null) {
  if (status === 'WAITING_UPLOAD') return 'Uploading your photo and waiting to start…';
  if (status === 'PROCESSING') return 'Checking your photo…';
  if (status === 'RETRYING') return 'Retrying your photo…';
  return 'Waiting for your photo result…';
}
