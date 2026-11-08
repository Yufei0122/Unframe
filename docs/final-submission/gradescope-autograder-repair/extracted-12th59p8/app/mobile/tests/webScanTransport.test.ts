import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebScanTransport, scanJobStatusLabel } from '../src/webScanTransport';
import type { JobStatus } from '../src/recognitionJobs';

const blob = new Blob(['image'], { type: 'image/jpeg' });
test('web jobs mode uses distinct recognition/analysis jobs, raw PUT and unchanged results without local fallback', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  let operation = '', number = 0;
  const recognised = { matched: false, candidates: [], requiresConfirmation: true };
  const analysed = { identityStatus: 'uncertain', description: 'Uncertain.' };
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/a3/jobs')) {
      const input = JSON.parse(init?.body as string); operation = input.operation;
      assert.equal(input.museumId, 'goma'); assert.equal(input.sizeBytes, blob.size);
      return Response.json({ jobId: String(++number), readToken: 'private', status: 'WAITING_UPLOAD', upload: { url: 'https://upload.example/photo', headers: { 'Content-Type': blob.type, 'If-None-Match': '*' } } });
    }
    if (String(url).includes('upload.example')) { assert.equal(init?.body, blob); assert.equal(init?.method, 'PUT'); return new Response(); }
    return Response.json({ jobId: String(number), status: 'SUCCEEDED', operation, result: operation === 'recognise' ? recognised : analysed });
  }) as typeof fetch;
  const transport = createWebScanTransport({ mode: 'jobs', baseUrl: 'https://api.example', fetchImpl: fetchMock, requestLocal: async () => assert.fail('No local fallback') });
  const statuses: JobStatus[] = [];
  assert.deepEqual(await transport.recognise(blob, 'goma', new AbortController().signal, s => statuses.push(s)), recognised);
  assert.equal(number, 1); // Recognition does not automatically invoke vision.
  assert.deepEqual(await transport.analyse(blob, 'goma', new AbortController().signal), analysed);
  assert.equal(number, 2); assert.deepEqual(statuses, ['WAITING_UPLOAD', 'SUCCEEDED']);
  assert.equal((requests[2].init?.headers as Record<string, string>)['X-Job-Token'], 'private');
});

test('web job cancellation stops pending polling and a new scan uses a fresh signal', async () => {
  let polls = 0;
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/a3/jobs')) return Response.json({ jobId: '1', readToken: 'private', status: 'WAITING_UPLOAD', upload: { url: 'https://upload.example/photo', headers: {} } });
    if (String(url).includes('upload.example')) return new Response();
    polls++;
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  }) as typeof fetch;
  const transport = createWebScanTransport({ mode: 'jobs', baseUrl: '', fetchImpl: fetchMock, requestLocal: async () => assert.fail() });
  const controller = new AbortController();
  const pending = transport.recognise(blob, 'met', controller.signal);
  await new Promise(resolve => setTimeout(resolve, 5)); controller.abort(); await assert.rejects(pending, /cancelled/);
  assert.equal(polls, 1);
  await assert.rejects(transport.recognise(blob, 'met', controller.signal)); assert.equal(polls, 1);
  assert.match(scanJobStatusLabel('RETRYING'), /Retrying/); assert.match(scanJobStatusLabel('PROCESSING'), /Checking/);
});

test('local web mode remains available explicitly and cloud failures do not fall back', async () => {
  let calls = 0;
  const local = createWebScanTransport({ mode: 'local', baseUrl: '', requestLocal: async (path, body) => {
    calls++; assert.equal(path, 'artworks/recognise?museumId=met'); assert.ok(body instanceof FormData);
    return { matched: false, candidates: [], requiresConfirmation: true };
  } });
  await local.recognise(blob, 'met', new AbortController().signal); assert.equal(calls, 1);
  const cloud = createWebScanTransport({ mode: 'jobs', baseUrl: '', requestLocal: async () => assert.fail(), fetchImpl: (async () => { throw new Error('offline'); }) as typeof fetch });
  await assert.rejects(cloud.recognise(blob, 'met', new AbortController().signal), /offline/);
  assert.throws(() => createWebScanTransport({ mode: 'typo', baseUrl: '', requestLocal: async () => assert.fail() }));
});
