import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { catalogues } from '../ai/catalogues.js';
import { AIError, requireInput } from '../ai/config.js';
import { MAX_IMAGE_BYTES } from '../ai/images.js';

export const validJobId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function createJobService({ config, repository, uploads, now = () => Math.floor(Date.now() / 1000) }) {
  return {
    async create(input) {
      requireInput(input && typeof input === 'object' && !Array.isArray(input), 'Send a job object.');
      requireInput(Object.keys(input).every(k => ['museumId', 'operation', 'contentType', 'sizeBytes'].includes(k)), 'Unsupported job field.');
      const { museumId = 'met', operation = 'recognise', contentType, sizeBytes } = input;
      requireInput(catalogues.has(museumId), 'Choose a supported museum.');
      requireInput(['recognise', 'analyse'].includes(operation), 'Choose recognise or analyse.');
      requireInput(['image/jpeg', 'image/png', 'image/webp'].includes(contentType), 'Choose JPEG, PNG or WebP.');
      requireInput(Number.isSafeInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= MAX_IMAGE_BYTES, 'Image must be between 1 byte and 5 MB.');
      const jobId = randomUUID(), readToken = randomBytes(32).toString('hex'), createdAt = now();
      const job = { jobId, status: 'WAITING_UPLOAD', operation, museumId, contentType, sizeBytes, imageKey: `${config.prefix}${jobId}/image`,
        bucket: config.bucket, tokenHash: tokenHash(readToken), attempts: 0, createdAt, updatedAt: createdAt, expiresAt: createdAt + config.ttlSeconds };
      const upload = await uploads.presign(job);
      await repository.create(job);
      return { jobId, readToken, status: job.status, upload, pollAfterMs: 1500 };
    },
    async get(jobId, readToken) {
      requireInput(validJobId(jobId), 'Invalid job ID.');
      const job = await repository.get(jobId);
      if (!job || typeof readToken !== 'string' || !/^[a-f0-9]{64}$/.test(readToken) || !/^[a-f0-9]{64}$/.test(job.tokenHash)
        || !timingSafeEqual(Buffer.from(tokenHash(readToken)), Buffer.from(job.tokenHash))) throw new AIError(404, 'JOB_NOT_FOUND', 'Job not found.');
      if (job.expiresAt <= now()) throw new AIError(410, 'JOB_EXPIRED', 'Job expired. Submit another image.');
      return { jobId: job.jobId, status: job.status, operation: job.operation, museumId: job.museumId,
        createdAt: job.createdAt, updatedAt: job.updatedAt, ...(job.status === 'SUCCEEDED' ? { result: job.result } : {}),
        ...(job.error ? { error: job.error } : {}), pollAfterMs: 1500 };
    },
  };
}
