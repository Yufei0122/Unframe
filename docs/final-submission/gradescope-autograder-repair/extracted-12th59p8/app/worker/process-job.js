import { randomUUID } from 'node:crypto';
import { validJobId } from '../server/cloud/jobs.js';
import { catalogues } from '../server/ai/catalogues.js';
import { normalizeImage, MAX_IMAGE_BYTES } from '../server/ai/images.js';
import { jobContext } from '../server/ai/job-context.js';
import { diagnosticStage, errorDiagnostics } from '../server/ai/diagnostics.js';

export function parseJobMessage(body, config) {
  if (typeof body !== 'string' || body.length > 262144) throw new Error('INVALID_MESSAGE');
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('INVALID_MESSAGE'); }
  if (data?.Event === 's3:TestEvent' && data.Bucket === config.bucket) return null;
  // S3 direct notifications contain one object event. Reject batches to keep the visibility budget bounded.
  if (!Array.isArray(data?.Records) || data.Records.length !== 1) throw new Error('INVALID_S3_EVENT');
  const record = data.Records[0];
  if (record.eventSource !== 'aws:s3' || !record.eventName?.startsWith('ObjectCreated:') || record.s3?.bucket?.name !== config.bucket) throw new Error('INVALID_S3_EVENT');
  const object = record.s3.object;
  let key;
  try { key = decodeURIComponent(object.key.replaceAll('+', ' ')); } catch { throw new Error('INVALID_IMAGE_KEY'); }
  const jobId = key.startsWith(config.prefix) ? key.slice(config.prefix.length).split('/')[0] : '';
  if (!validJobId(jobId) || key !== `${config.prefix}${jobId}/image` || !Number.isSafeInteger(object.size) || object.size < 1 || object.size > MAX_IMAGE_BYTES
    || (object.versionId !== undefined && typeof object.versionId !== 'string') || typeof object.eTag !== 'string') throw new Error('INVALID_IMAGE_EVENT');
  return { jobId, key, bucket: config.bucket, size: object.size, etag: object.eTag, versionId: object.versionId };
}

export function createMessageProcessor({ config, repository, uploads, infer, acknowledge, log = record => console.info(JSON.stringify(record)), now = () => Math.floor(Date.now() / 1000) }) {
  return async function processMessage(message, shutdownSignal) {
    let event, claimed, completed = false, stage = 'message_parse';
    const started = performance.now();
    const run = (nextStage, action) => { stage = nextStage; return diagnosticStage(nextStage, action); };
    const owner = randomUUID();
    const deadline = AbortSignal.timeout(config.timeoutMs);
    const signal = shutdownSignal ? AbortSignal.any([shutdownSignal, deadline]) : deadline;
    try {
      event = parseJobMessage(message.Body, config);
      if (!event) {
        log({ event: 's3_notification_test', jobId: null });
        await run('sqs_delete', () => acknowledge(message.ReceiptHandle, signal)); return;
      }
      log({ event: 'job_received', jobId: event.jobId });
      const job = await run('dynamodb_get', () => repository.get(event.jobId, signal));
      stage = 'job_validate';
      if (!job || job.imageKey !== event.key || job.bucket !== event.bucket || job.sizeBytes !== event.size || !catalogues.has(job.museumId)
        || !['recognise', 'analyse'].includes(job.operation) || !['image/jpeg', 'image/png', 'image/webp'].includes(job.contentType)) throw new Error('JOB_MISMATCH');
      // Completion is durable before cleanup. Redelivery after a cleanup/ack failure does not run inference again.
      if (job.status === 'SUCCEEDED') {
        completed = true;
        await run('s3_delete_object', () => uploads.remove(event, signal));
        await run('sqs_delete', () => acknowledge(message.ReceiptHandle, signal));
        log({ event: 'job_duplicate_cleaned', jobId: event.jobId }); return;
      }
      if (job.status === 'FAILED' || job.expiresAt <= now()) throw new Error('JOB_NOT_PROCESSABLE');
      claimed = await run('dynamodb_claim', () => repository.claim(event.jobId, owner, now(), signal));
      log({ event: 'job_processing', jobId: event.jobId, attempt: claimed.attempts, operation: job.operation });
      const bytes = await run('s3_get_object', () => uploads.read(job, event, signal));
      const image = await run('image_normalize', () => normalizeImage(bytes, job.contentType));
      signal.throwIfAborted();
      const result = await run('inference', () => jobContext.run({ jobId: event.jobId }, () => infer(job, image, signal)));
      signal.throwIfAborted();
      await run('dynamodb_complete', () => repository.complete(event.jobId, owner, result, now(), signal));
      completed = true;
      log({ event: 'job_result_saved', jobId: event.jobId });
      // Delete the input before acknowledging. Failed cleanup retains the queue message for retry.
      await run('s3_delete_object', () => uploads.remove(event, signal));
      await run('sqs_delete', () => acknowledge(message.ReceiptHandle, signal));
      log({ event: 'job_completed', jobId: event.jobId });
    } catch (error) {
      if (claimed && !completed) {
        try { await repository.fail(event.jobId, owner, claimed.attempts, now()); }
        catch (stateError) { log({ event: 'job_state_update_failed', jobId: event.jobId, ...errorDiagnostics(stateError, 'dynamodb_fail') }); }
      }
      log({ event: completed ? 'job_cleanup_retry' : 'job_failed', jobId: event?.jobId || null,
        code: error?.name === 'ConditionalCheckFailedException' ? 'JOB_LEASE_CONFLICT' : signal.aborted ? 'JOB_CANCELLED_OR_TIMED_OUT' : 'PROCESSING_FAILED',
        ...errorDiagnostics(error, stage), attempt: claimed?.attempts || null, elapsedMs: Math.round(performance.now() - started) });
      // No acknowledgement or input deletion on processing failure. SQS redrive policy handles poison messages.
      throw error;
    }
  };
}
