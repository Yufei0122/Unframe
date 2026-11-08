import test from 'node:test';
import assert from 'node:assert/strict';
import { runRecognitionLoad } from '../scripts/load-recognition-jobs.mjs';
const id = '12345678-1234-4234-8234-123456789012';
function fixture() {
  let time = 0;
  const starts = [], events = [], methods = [];
  return { starts, events, methods, options: { base: 'https://api.example', bytes: Buffer.from('public-test-image'), count: 8, concurrency: 2, ratePerSecond: 3,
    now: () => time, sleep: async ms => { time += ms; }, onEvent: e => events.push(e),
    fetchImpl: async (url, options) => {
      methods.push(options.method);
      if (options.method === 'POST') { starts.push(time); assert.equal(JSON.parse(options.body).operation, 'recognise'); }
      return { ok: true, json: async () => ({ jobId: id, readToken: 'SECRET_TOKEN', upload: { url: 'https://s3.example/SECRET_URL', headers: {} } }) };
    } } };
}
test('paced workload has finite count, no catch-up bursts, and sanitized events', async () => {
  const f = fixture(), r = await runRecognitionLoad(f.options);
  assert.equal(r.attempted, 8); assert.equal(r.uploaded, 8);
  for (let i = 1; i < f.starts.length; i++) assert.ok(f.starts[i] - f.starts[i - 1] >= 333.333 - .001);
  assert.ok(!JSON.stringify(f.events).includes('SECRET'));
});
test('deadline bounds submissions', async () => {
  const f = fixture(), r = await runRecognitionLoad({ ...f.options, maxDurationMs: 800 });
  assert.equal(r.attempted, 3);
});
test('stop after create finishes accepted upload but starts no more jobs', async () => {
  const f = fixture(), controller = new AbortController();
  const r = await runRecognitionLoad({ ...f.options, concurrency: 1, signal: controller.signal,
    onEvent: e => { f.events.push(e); if (e.event === 'job_created') controller.abort(); } });
  assert.equal(r.attempted, 1); assert.equal(r.uploaded, 1); assert.deepEqual(f.methods, ['POST', 'PUT']);
});
test('failed create is not retried and stops without leaking error text', async () => {
  const f = fixture();
  const r = await runRecognitionLoad({ ...f.options, concurrency: 1, fetchImpl: async () => { throw new Error('SECRET'); } });
  assert.equal(r.attempted, 1); assert.equal(r.failed, 1); assert.equal(r.created, 0);
  assert.ok(!JSON.stringify(f.events).includes('SECRET'));
});
test('rejects bounds exceeding the authorized envelope', async () => {
  const f = fixture();
  for (const invalid of [{ count: 901 }, { concurrency: 6 }, { ratePerSecond: 4 }, { maxDurationMs: 300001 }, { count: 51, ratePerSecond: 0 }])
    await assert.rejects(runRecognitionLoad({ ...f.options, ...invalid }), /INVALID_LOAD_BOUNDS/);
});
test('simultaneous requests never exceed configured concurrency', async () => {
  const f = fixture(); let active = 0, peak = 0;
  await runRecognitionLoad({ ...f.options, ratePerSecond: 0, fetchImpl: async (...args) => {
    active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve));
    const response = await f.options.fetchImpl(...args); active--; return response;
  } });
  assert.equal(peak, 2);
});
