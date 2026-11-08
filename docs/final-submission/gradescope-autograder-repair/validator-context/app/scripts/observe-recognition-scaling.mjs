// Bounded read-only observation. Start before the separately authorized load:jobs command.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const exec = promisify(execFile), dir = 'verification/2026-10-31/recognition-final';
const began = Date.now(), samples = [];
let sawScaleOut = false;
async function aws(args) {
  return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })).stdout);
}
try {
  for (;;) {
    const service = (await aws(['ecs', 'describe-services', '--cluster', 'n12281212-strobe-a2', '--services', 'a3-n12281212-unframe-worker', '--query', 'services[].{desired:desiredCount,running:runningCount,pending:pendingCount}']))[0];
    const queues = {};
    for (const suffix of ['recognition', 'recognition-dlq']) queues[suffix] = (await aws(['sqs', 'get-queue-attributes', '--queue-url', `https://sqs.ap-southeast-2.amazonaws.com/901444280953/a3-n12281212-unframe-${suffix}`, '--attribute-names', 'ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible', 'ApproximateNumberOfMessagesDelayed'])).Attributes;
    const sample = { at: new Date().toISOString(), ...service, queues };
    samples.push(sample); sawScaleOut ||= service.running > 1;
    await writeFile(`${dir}/F14-F16-observations.json`, JSON.stringify({ startedAt: new Date(began).toISOString(), sawScaleOut, samples }, null, 2));
    console.log(JSON.stringify(sample));
    const elapsed = Date.now() - began, q = queues.recognition;
    const empty = Object.values(q).every(v => v === '0');
    if (elapsed >= 20 * 60000 || (elapsed >= (sawScaleOut ? 16 : 5) * 60000 && empty && service.running === 1 && service.desired === 1 && service.pending === 0)) break;
    await delay(elapsed < 60000 ? 10000 : 30000);
  }
  const bytes = await readFile(`${dir}/load-submissions.txt`);
  const log = bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const jobs = log.split(/\r?\n/).flatMap(line => { try { const e = JSON.parse(line); return e.event === 'job_uploaded' ? [e.jobId] : []; } catch { return []; } });
  if (jobs.length > 30) throw new Error('Unexpected job count');
  const results = [];
  for (const jobId of jobs) {
    const input = { TableName: 'a3-n12281212-unframe-jobs', Key: { jobId: { S: jobId } }, ConsistentRead: true,
      ProjectionExpression: '#j,#s,#a,#r,#c', ExpressionAttributeNames: { '#j': 'jobId', '#s': 'status', '#a': 'attempts', '#r': 'result', '#c': 'completedAt' } };
    // Contains only a public job UUID and field projection, no capability token.
    await writeFile(`${dir}/load-read-input.json`, JSON.stringify(input));
    const item = (await aws(['dynamodb', 'get-item', '--cli-input-json', `file://${dir}/load-read-input.json`])).Item;
    results.push({ jobId, status: item?.status?.S, attempts: Number(item?.attempts?.N), artworkId: item?.result?.M?.artwork?.M?.id?.S, similarity: Number(item?.result?.M?.similarity?.N), completedAt: Number(item?.completedAt?.N) });
  }
  await writeFile(`${dir}/load-results.json`, JSON.stringify({ jobs: results, total: results.length, succeeded: results.filter(j => j.status === 'SUCCEEDED').length, sawScaleOut, finishedAt: new Date().toISOString() }, null, 2));
} catch (error) { console.error(error.stderr?.match(/An error occurred \(([^)]+)\)/)?.[1] || error.message); process.exitCode = 1; }
