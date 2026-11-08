import { readFile } from 'node:fs/promises';
try {
  const stamp = Number(await readFile('/tmp/unframe-worker-ready', 'utf8'));
  const allowance = Number(process.env.WORKER_JOB_TIMEOUT_MS || 180000) + 90000;
  if (!Number.isFinite(stamp) || Date.now() - stamp > allowance) throw new Error('STALE_WORKER');
  const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('OPENCLIP_NOT_READY');
} catch { process.exitCode = 1; }
