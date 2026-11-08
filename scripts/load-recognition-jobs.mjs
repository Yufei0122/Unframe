import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Same real create/upload workflow; a stop blocks new creates but finishes accepted uploads.
export async function runRecognitionLoad({ base, bytes, contentType = 'image/jpeg', museumId = 'met',
  count = 30, concurrency = 5, ratePerSecond = 0, maxDurationMs = 300000, signal,
  onEvent = event => console.log(JSON.stringify(event)), fetchImpl = fetch,
  now = () => performance.now(), sleep = ms => delay(ms) }) {
  if (!base.startsWith('https://') || !Number.isInteger(count) || count < 1 || count > (ratePerSecond ? 900 : 50)
    || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > (ratePerSecond ? 5 : 10)
    || !Number.isFinite(ratePerSecond) || ratePerSecond < 0 || ratePerSecond > 3
    || !Number.isFinite(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > 300000
    || !bytes?.length || bytes.length > 5 * 1024 * 1024) throw new Error('INVALID_LOAD_BOUNDS');
  base = base.replace(/\/+$/, '');
  const began = now(), pending = new Set();
  let attempted = 0, created = 0, uploaded = 0, failed = 0, nextStart = began, stopped = false;
  async function submit(number) {
    let jobId, stage = 'create';
    try {
      const response = await fetchImpl(base + '/a3/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ museumId, operation: 'recognise', contentType, sizeBytes: bytes.length }), signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('CREATE_FAILED');
      const job = await response.json();
      if (!/^[0-9a-f-]{36}$/.test(job.jobId || '') || !job.upload?.url?.startsWith('https://')) throw new Error('INVALID_CREATE_RESPONSE');
      jobId = job.jobId; created++; onEvent({ event: 'job_created', number, jobId }); stage = 'upload';
      const upload = await fetchImpl(job.upload.url, { method: 'PUT', headers: job.upload.headers, body: bytes, signal: AbortSignal.timeout(30000) });
      if (!upload.ok) throw new Error('UPLOAD_FAILED');
      uploaded++; onEvent({ event: 'job_uploaded', number, jobId });
    } catch {
      failed++; stopped = true;
      onEvent({ event: 'submission_failed', number, ...(jobId ? { jobId } : {}), stage });
    }
  }
  while (attempted < count && !stopped && !signal?.aborted && now() - began < maxDurationMs) {
    if (pending.size >= concurrency) { await Promise.race(pending); continue; }
    if (now() < nextStart) { await sleep(Math.min(100, nextStart - now())); continue; }
    nextStart = now() + (ratePerSecond ? 1000 / ratePerSecond : 0); // no catch-up bursts
    attempted++;
    const work = submit(attempted); pending.add(work); void work.finally(() => pending.delete(work));
  }
  await Promise.all(pending);
  const result = { attempted, created, uploaded, failed, elapsedMs: Math.round(now() - began),
    stopped: stopped || Boolean(signal?.aborted), note: 'Uploads alone do not prove completion or scaling.' };
  onEvent({ event: 'load_finished', ...result }); return result;
}

// Deliberate opt-in: never runs during tests, builds or startup. Uses HTTP API, not AWS credentials.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const args = process.argv.slice(2);
if (!args.includes('--execute')) {
  console.log('Not executed. Later: node scripts/load-recognition-jobs.mjs --execute --url https://YOUR_API --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5');
} else {
  const value = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const base = value('--url', '').replace(/\/+$/, ''), file = value('--image', ''), museumId = value('--museum', 'met');
  const count = Number(value('--count', '30')), concurrency = Number(value('--concurrency', '5'));
  if (!base.startsWith('https://') || !file || !Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error('Use HTTPS URL, image path, count 1-50, concurrency 1-10.');
  const bytes = await readFile(file);
  const contentType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file).toLowerCase()];
  if (!contentType || bytes.length > 5 * 1024 * 1024) throw new Error('Choose JPEG/PNG/WebP up to 5 MB.');
  const shutdown = new AbortController();
  process.once('SIGINT', () => shutdown.abort()); process.once('SIGTERM', () => shutdown.abort());
  const result = await runRecognitionLoad({ base, bytes, contentType, museumId, count, concurrency, signal: shutdown.signal });
  if (result.failed) process.exitCode = 1;
}
}
