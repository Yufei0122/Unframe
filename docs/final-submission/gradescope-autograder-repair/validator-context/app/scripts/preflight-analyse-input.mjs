// Read-only real S3 Vectors preflight. Does not create a job or invoke Bedrock.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readAIConfig } from '../server/ai/config.js';
import { createEmbeddingService, referenceArtworks } from '../server/ai/embeddings.js';
import { createS3VectorStore } from '../server/ai/s3-vectors.js';
import { normalizeImage } from '../server/ai/images.js';
const directory = 'verification/2026-10-31/bedrock-v4-live';
await mkdir(directory, { recursive: true });
const exec = promisify(execFile);
const cli = async args => JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'], { windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024 })).stdout);
assert.equal((await cli(['sts', 'get-caller-identity'])).Account, '901444280953');
const taskBytes = await readFile('artifacts/bedrock-v4-deployment/task-before.json');
const task = JSON.parse(taskBytes[0] === 255 ? taskBytes.subarray(2).toString('utf16le') : taskBytes.toString('utf8').replace(/^\uFEFF/, ''));
const environment = Object.fromEntries(task.taskDefinition.containerDefinitions.find(c => c.name === 'unframe-worker').environment.map(e => [e.name, e.value]));
const config = readAIConfig({ ...environment, AWS_REGION: 'ap-southeast-2', OPENCLIP_URL: 'http://127.0.0.1:8001' });
const image = 'mobile/assets/met-exterior.jpg';
const embedding = await createEmbeddingService(config).generate(await normalizeImage(await readFile(image), 'image/jpeg'));
const client = { async send(command) {
  const operation = { GetIndexCommand: 'get-index', QueryVectorsCommand: 'query-vectors' }[command.constructor.name];
  assert.ok(operation);
  const file = `${directory}/preflight-${operation}.json`;
  await writeFile(file, JSON.stringify(command.input));
  return cli(['s3vectors', operation, '--cli-input-json', `file://${file}`]);
} };
const store = createS3VectorStore(config, client);
await store.check();
const ranked = (await store.search(embedding, { topK: Math.min(100, referenceArtworks().length) })).sort((a, b) => b.similarity - a.similarity);
const best = ranked[0];
const shortcut = Boolean(best && best.similarity >= config.threshold && best.similarity - (ranked[1]?.similarity ?? -1) >= .05);
const evidence = { checkedAt: new Date().toISOString(), image, model: config.embeddingModel, pretrained: config.embeddingPretrained,
  dimensions: embedding.length, norm: Math.hypot(...embedding), vectorStore: 'real AWS S3 Vectors', threshold: config.threshold,
  candidates: ranked.slice(0, 3).map(r => ({ artworkId: r.artworkId, museumId: r.museumId, similarity: r.similarity })),
  catalogueShortcut: shortcut, bedrockInvocations: 0, jobsCreated: 0 };
await writeFile(`${directory}/input-preflight.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
assert.equal(shortcut, false, 'Choose a different public image before submitting the single job');
