import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { runWorker } from './worker.js';
import { errorDiagnostics } from '../server/ai/diagnostics.js';

const shutdown = new AbortController();
const python = spawn(process.env.PYTHON_EXE || '/opt/venv/bin/python', ['-u', 'local-ai/server.py', '--managed-stdin'], { stdio: ['pipe', 'inherit', 'inherit'] });
let exited = false;
python.once('exit', () => { exited = true; shutdown.abort(); });
python.once('error', () => { exited = true; shutdown.abort(); });
for (const name of ['SIGINT', 'SIGTERM']) process.once(name, () => shutdown.abort());
try {
  let ready = false;
  for (let i = 0; i < 120 && !shutdown.signal.aborted; i++) {
    try {
      const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(2000) });
      const value = await response.json();
      if (response.ok && value.model === 'ViT-B-32' && value.pretrained === 'laion2b_s34b_b79k' && value.dimensions === 512 && value.normalized === true) { ready = true; break; }
    } catch { /* Model load is allowed a bounded startup interval. */ }
    await delay(1000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
  if (!ready) throw new Error('OPENCLIP_NOT_READY');
  await runWorker(shutdown.signal);
} catch (error) {
  console.error(JSON.stringify({ event: 'worker_runtime_stopped', jobId: null, ...errorDiagnostics(error, 'worker_start') })); process.exitCode = 1;
} finally {
  python.stdin.end();
  if (!exited) python.kill('SIGTERM');
}
