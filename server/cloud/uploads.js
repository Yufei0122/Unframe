import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_IMAGE_BYTES, readLimited } from '../ai/images.js';

export function createUploads(config, client = new S3Client({ region: config.region, maxAttempts: 2, requestChecksumCalculation: 'WHEN_REQUIRED' }), sign = getSignedUrl) {
  return {
    async presign(job) {
      const headers = { 'Content-Type': job.contentType, 'If-None-Match': '*' };
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: job.imageKey, ContentType: job.contentType, IfNoneMatch: '*' });
      const url = await sign(client, command, { expiresIn: config.uploadSeconds, signableHeaders: new Set(['content-type', 'if-none-match']) });
      return { url, headers, expiresAt: job.createdAt + config.uploadSeconds };
    },
    async read(job, event, signal) {
      const object = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: job.imageKey, ...(event.versionId ? { VersionId: event.versionId } : {}) }), { abortSignal: signal });
      if (!object.Body || object.ContentLength !== job.sizeBytes || object.ContentLength > MAX_IMAGE_BYTES || object.ContentType !== job.contentType
        || (event.etag && object.ETag?.replaceAll('"', '') !== event.etag)) {
        object.Body?.destroy?.(); throw new Error('Uploaded object does not match job');
      }
      const bytes = await readLimited({ headers: { 'content-length': String(object.ContentLength) }, [Symbol.asyncIterator]: () => object.Body[Symbol.asyncIterator]() }, MAX_IMAGE_BYTES);
      if (bytes.length !== job.sizeBytes) throw new Error('Incomplete uploaded object');
      return bytes;
    },
    async remove(event, signal) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: event.key, ...(event.versionId ? { VersionId: event.versionId } : {}) }), { abortSignal: signal });
    },
  };
}
