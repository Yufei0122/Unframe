// One opt-in Analyse job; capability tokens and presigned URLs remain in memory.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resultDigest } from './evidence-result.mjs';
import { browserJobImage, createRecognitionJobClient } from '../mobile/src/recognitionJobs';

if (!process.argv.includes('--execute')) {
  console.log('Not executed. --execute submits exactly one live Analyse job.');
} else {
  const directory = process.env.UNFRAME_ANALYSE_EVIDENCE_DIR || 'verification/2026-10-31/aws-final';
  const file = `${directory}/F12-analyse.json`;
  const base = 'https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob';
  const evidence: any = { apiBase: base, operation: 'analyse', museumId: 'met', image: process.env.UNFRAME_ANALYSE_IMAGE || 'mobile/assets/water-lilies.jpg',
    startedAt: new Date().toISOString(), stage: 'before_create', http: [], statuses: [], status: 'PENDING' };
  await mkdir(directory, { recursive: true });
  // Refuse resubmission even after an ambiguous network failure.
  await writeFile(file, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  const save = () => writeFile(file, JSON.stringify(evidence, null, 2));
  const signal = AbortSignal.timeout(300000);
  const started = performance.now();
  const safeFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    evidence.http.push({ stage: evidence.stage, method: init?.method || 'GET', status: response.status,
      cacheControl: response.headers.get('cache-control'), requestId: response.headers.get('apigw-requestid') });
    return response;
  };
  try {
    const image = browserJobImage(new Blob([await readFile(evidence.image)], { type: 'image/jpeg' }), safeFetch);
    const client = createRecognitionJobClient(base, safeFetch);
    evidence.stage = 'create'; await save();
    const job = await client.create(image, 'met', 'analyse', signal);
    evidence.jobId = job.jobId; evidence.stage = 'upload'; await save();
    console.log(JSON.stringify({ event: 'created', jobId: job.jobId }));
    await image.upload(job.upload.url, job.upload.headers, signal);
    evidence.stage = 'poll'; await save();
    const result: any = await client.poll(job, signal, status => {
      if (evidence.statuses.at(-1) !== status) evidence.statuses.push(status);
      if (status === 'RETRYING' || status === 'FAILED') throw new Error('Stop further live jobs and inspect diagnostics.');
    });
    evidence.jobStatus = 'SUCCEEDED';
    // Persist only result shape and a digest, never model-authored descriptions.
    evidence.result = { method: result.method, identityStatus: result.identityStatus, artworkPresence: result.artworkPresence };
    evidence.resultSha256 = resultDigest(result);
    assert.ok(['collection', 'vision', 'empty'].includes(result.method));
    const reread = await client.poll(job, signal);
    assert.deepEqual(reread, result);
    evidence.resultPersistedViaApi = true;
    evidence.bedrockInvocation = result.method === 'collection' ? 'NOT_INVOKED_CATALOGUE_SHORTCUT' : 'REQUIRES_CLOUDWATCH_CORROBORATION';
    evidence.status = result.method === 'collection' ? 'PARTIAL_BEDROCK_NOT_EXERCISED' : 'PENDING_LOG_VERIFICATION';
    evidence.stage = 'complete';
  } catch {
    evidence.status = 'FAIL'; evidence.timedOut = signal.aborted; process.exitCode = 1;
  } finally {
    evidence.elapsedMs = Math.round(performance.now() - started);
    evidence.finishedAt = new Date().toISOString();
    await save();
    console.log(JSON.stringify({ jobId: evidence.jobId, status: evidence.status, stage: evidence.stage, elapsedMs: evidence.elapsedMs, method: evidence.result?.method }));
  }
}
