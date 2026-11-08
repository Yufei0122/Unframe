// Executed inside the Node 22 Lambda Linux image; no credentials or AWS calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire('/var/task/package.json');
const sharp = require('sharp');
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
assert.equal(process.versions.node.split('.')[0], '22');
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
assert.equal((await sharp(png).metadata()).format, 'png');
Object.assign(process.env, { AI_PROVIDER: 'bedrock', JOBS_TABLE_NAME: 'local-smoke-table', JOB_IMAGES_BUCKET: 'local-smoke-bucket', AWS_REGION: 'ap-southeast-2' });
const { jobsHandler } = await import('/var/task/server/cloud/handlers.js');
const { planningHandler } = await import('/var/task/server/cloud/planning.js');
assert.equal((await jobsHandler({ httpMethod: 'OPTIONS', path: '/a3/jobs' })).statusCode, 204);
assert.equal((await planningHandler({ httpMethod: 'GET', path: '/api/ai/planning/status' })).statusCode, 200);
assert.equal((await planningHandler({ httpMethod: 'POST', path: '/api/ai/routes/visit', headers: { 'content-type': 'application/json' }, body: '{' })).statusCode, 400);
console.log('PASS: Linux x64 Node 22, native Sharp, jobsHandler and planningHandler imports/API parsing; no AWS calls.');
