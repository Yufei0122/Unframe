import { readCloudConfig } from './config.js';
import { createJobRepository } from './job-repository.js';
import { createUploads } from './uploads.js';
import { createJobService } from './jobs.js';
import { AIError } from '../ai/config.js';

export function createJobsHandler(service, config) {
  return async event => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = headers.origin;
    const cors = origin && config.allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const respond = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }, body: JSON.stringify(data) });
    if (origin && !config.allowedOrigins.includes(origin)) return respond(403, { error: 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' });
    const method = event.requestContext?.http?.method || event.httpMethod;
    let path = event.rawPath || event.path;
    const stage = event.requestContext?.stage;
    // HTTP API v2 can retain a named stage in rawPath. Strip only that exact
    // prefix, and preserve already-unprefixed routes (including a stage named a3).
    if (event.version === '2.0' && stage && stage !== '$default'
      && path?.startsWith(`/${stage}/`) && !/^\/a3\/jobs(?:\/|$)/.test(path)) {
      path = path.slice(stage.length + 1);
    }
    if (method === 'OPTIONS') return { statusCode: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-Job-Token' }, body: '' };
    try {
      if (method === 'POST' && path === '/a3/jobs') {
        if (!headers['content-type']?.includes('application/json')) throw new AIError(415, 'JSON_REQUIRED', 'Send application/json.');
        const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
        if (Buffer.byteLength(raw) > 2048) throw new AIError(413, 'REQUEST_TOO_LARGE', 'Job request is too large.');
        let input;
        try { input = JSON.parse(raw); } catch { throw new AIError(400, 'INVALID_JSON', 'Invalid JSON.'); }
        return respond(201, await service.create(input));
      }
      const match = path?.match(/^\/a3\/jobs\/([^/]+)$/);
      if (method === 'GET' && match) return respond(200, await service.get(match[1], headers['x-job-token']));
      return respond(404, { error: 'Endpoint not found', code: 'NOT_FOUND' });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'job_api_failure', jobId: event.pathParameters?.jobId || null, code: error instanceof AIError ? error.code : 'INTERNAL_ERROR' }));
      return respond(error instanceof AIError ? error.status : 500, { error: error instanceof AIError ? error.message : 'Job request failed.', code: error instanceof AIError ? error.code : 'INTERNAL_ERROR' });
    }
  };
}

let handler;
export async function jobsHandler(event) {
  if (!handler) {
    const config = readCloudConfig();
    handler = createJobsHandler(createJobService({ config, repository: createJobRepository(config), uploads: createUploads(config) }), config);
  }
  return handler(event);
}
