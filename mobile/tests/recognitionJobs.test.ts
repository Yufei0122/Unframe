import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecognitionJobClient, browserJobImage } from '../src/recognitionJobs';
import { saveMuseumRoute, validSavedRoute, profileActivity } from '../src/profileData';
import { initialState, artworks } from '../src/model';

const job = { jobId: 'test', readToken: 'private', status: 'WAITING_UPLOAD', upload: { url: 'https://upload.example/image', headers: { 'Content-Type': 'image/jpeg', 'If-None-Match': '*' }, expiresAt: 123 }, pollAfterMs: 1500 };
test('job client creates, uploads, polls and returns existing recognition contract', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const result = { matched: false, candidates: [], requiresConfirmation: true };
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(String(url).endsWith('/a3/jobs') ? job : String(url).startsWith('https://upload') ? {} : { jobId: 'test', status: 'SUCCEEDED', operation: 'recognise', result }), { status: 200 });
  }) as typeof fetch;
  const client = createRecognitionJobClient('https://api.example', fetchMock);
  assert.deepEqual(await client.run(browserJobImage(new Blob(['image'], { type: 'image/jpeg' }), fetchMock), 'met', 'recognise', new AbortController().signal), result);
  assert.equal(calls[1].init?.method, 'PUT');
  assert.equal((calls[1].init?.headers as Record<string, string>)['If-None-Match'], '*');
  assert.equal((calls[2].init?.headers as Record<string, string>)['X-Job-Token'], 'private');
  assert.equal(calls[1].init?.credentials, 'omit');
});
test('job client reports failure and cancellation without changing capture ownership', async () => {
  const failed = createRecognitionJobClient('', (async () => new Response(JSON.stringify({ jobId: 'test', status: 'FAILED', error: { message: 'Try another image.' } }))) as typeof fetch);
  await assert.rejects(failed.poll(job as never, new AbortController().signal), /Try another image/);
  const controller = new AbortController();
  const pending = createRecognitionJobClient('', (async () => new Response(JSON.stringify({ jobId: 'test', status: 'PROCESSING', pollAfterMs: 500 }))) as typeof fetch);
  await assert.rejects(pending.poll(job as never, controller.signal, () => controller.abort()), /cancelled/);
});

test('Bedrock route snapshots remain valid AI activity without migrating existing local state', () => {
  const route = saveMuseumRoute({ demo: true, mapNotice: 'Demo', estimatedMinutes: 10, estimatedWalkingDistance: 35,
    route: [{ order: 1, artworkId: 'water-lilies', title: 'Water Lilies', galleryId: 'european-paintings', estimatedVisitMinutes: 4 }],
    navigation: [{ from: 'entrance', to: 'water-lilies', nodes: ['entrance', 'great-hall', 'european-paintings', 'water-lilies'], distance: 35, estimatedSeconds: 50 }],
    reasoningSummary: 'Nature', recommendationSource: 'bedrock' }, 'met');
  assert.equal(validSavedRoute(route, artworks.map(a => a.id)), true);
  assert.ok(profileActivity({ ...initialState, savedRoutes: [route] }).some(item => item.ai));
  assert.throws(() => createRecognitionJobClient('https://user:password@example.com'));
});
