// Explicit one-job live smoke test. Never persist/log presigned URLs or read tokens.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { browserJobImage, createRecognitionJobClient, type JobStatus } from '../mobile/src/recognitionJobs';
import type { RecognitionResult } from '../shared/ai-types';

if (!process.argv.includes('--execute')) {
  console.log('Not executed. Run with --execute only after the corrected ECS task is healthy.');
} else {
  const base = 'https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob';
  const evidenceFile = 'artifacts/live-deployment/recognition-job.json';
  await mkdir('artifacts/live-deployment', { recursive: true });
  // Exclusive creation also prevents a second submission after an ambiguous failure.
  const evidence: Record<string, unknown> = { apiBase: base, image: 'mobile/assets/water-lilies.jpg', museumId: 'met',
    status: 'PENDING', stage: 'before_create', startedAt: new Date().toISOString(), http: [], statuses: [] };
  await writeFile(evidenceFile, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  const save = () => writeFile(evidenceFile, JSON.stringify(evidence, null, 2));
  const signal = AbortSignal.timeout(300000);
  const started = performance.now();
  const safeFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    (evidence.http as unknown[]).push({ stage: evidence.stage, method: init?.method || 'GET', status: response.status });
    return response;
  };
  try {
    const image = browserJobImage(new Blob([await readFile('mobile/assets/water-lilies.jpg')], { type: 'image/jpeg' }), safeFetch);
    const client = createRecognitionJobClient(base, safeFetch);
    evidence.stage = 'create'; await save();
    const job = await client.create(image, 'met', 'recognise', signal);
    assert.match(job.jobId, /^[0-9a-f-]{36}$/i);
    evidence.jobId = job.jobId; evidence.stage = 'upload'; await save();
    console.log(JSON.stringify({ event: 'created', jobId: job.jobId }));
    await image.upload(job.upload.url, job.upload.headers, signal);
    evidence.stage = 'poll'; evidence.uploaded = true; await save();
    const result = await client.poll(job, signal, (status: JobStatus) => {
      const states = evidence.statuses as string[];
      if (states.at(-1) !== status) { states.push(status); console.log(JSON.stringify({ event: 'status', jobId: job.jobId, status })); }
      if (status === 'RETRYING' || status === 'FAILED') throw new Error('Inspect worker diagnostics; do not submit another job.');
    }) as RecognitionResult;
    evidence.stage = 'validate';
    evidence.candidates = result.candidates?.map(c => ({ artworkId: c.artwork.id, similarity: c.similarity }));
    evidence.artworkId = result.artwork?.id;
    evidence.similarity = result.similarity;
    evidence.requiresConfirmation = result.requiresConfirmation;
    assert.equal(result.matched, true); assert.equal(result.artwork?.id, 'water-lilies');
    assert.ok(result.similarity! >= 0.80); assert.equal(result.requiresConfirmation, true);
    assert.ok(result.candidates.length > 0 && result.candidates.length <= 3);
    assert.ok(result.candidates.every((candidate, i, all) => candidate.similarity >= .80 && (!i || all[i - 1].similarity >= candidate.similarity)));
    // Confirm the durable result remains readable through the existing capability API.
    evidence.stage = 'reread';
    const reread = await client.poll(job, signal) as RecognitionResult;
    assert.equal(reread.artwork?.id, 'water-lilies');
    evidence.resultStillAvailable = true; evidence.status = 'PASS'; evidence.jobStatus = 'SUCCEEDED';
  } catch {
    evidence.status = 'FAIL'; evidence.timedOut = signal.aborted;
    // Raw transport errors can contain request URLs; deliberately omit them.
    process.exitCode = 1;
  } finally {
    evidence.elapsedMs = Math.round(performance.now() - started);
    evidence.finishedAt = new Date().toISOString();
    await save(); console.log(JSON.stringify(evidence));
  }
}
