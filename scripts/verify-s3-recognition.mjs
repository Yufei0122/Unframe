// Read-only live verification. No vector writes, local-vector fallback or mocked inference.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { readAIConfig } from '../server/ai/config.js';
import { createEmbeddingService, createEmbeddingStore, referenceImageUrl, referenceArtworks, referenceCatalogueHash, normalizedVector } from '../server/ai/embeddings.js';
import { createS3VectorStore, serializeMetadataFilter } from '../server/ai/s3-vectors.js';
import { createAIHandler } from '../server/ai/handler.js';
import { normalizeImage } from '../server/ai/images.js';
import { catalogues } from '../server/ai/catalogues.js';

if (process.argv.slice(2).join(' ') !== '--execute-aws') {
  console.error('Usage: node scripts/verify-s3-recognition.mjs --execute-aws');
  process.exit(1);
}
const config = readAIConfig();
const artwork = catalogues.get('met').collection.find(a => a.id === 'water-lilies');
const report = { startedAt: new Date().toISOString(), artwork: { id: artwork.id, title: artwork.title, image: `mobile/assets/${artwork.image}` },
  configuration: { vectorStore: config.vectorStore, region: config.awsRegion, indexArn: config.vectorIndexArn?.replace(/:\d{12}:/, ':<account>:') ?? null,
    version: config.vectorVersion, threshold: config.threshold, model: config.embeddingModel, pretrained: config.embeddingPretrained, dimensions: config.dimension }, checks: [], queries: [] };
async function check(name, action) {
  try { const detail = await action(); report.checks.push({ name, status: 'PASS', ...(detail === undefined ? {} : { detail }) }); return true; }
  catch (error) { report.checks.push({ name, status: 'FAIL', error: error.code || error.name, httpStatus: error.$metadata?.httpStatusCode,
    requestId: error.$metadata?.requestId, ...(error.name === 'ValidationException' ? { message: error.message } : {}) }); return false; }
}
const client = new S3VectorsClient({ region: config.awsRegion, maxAttempts: 1 });
// Reject endpoint overrides before any signed request is sent.
client.middlewareStack.add(next => async args => {
  assert.equal(args.request.protocol, 'https:');
  assert.equal(args.request.hostname, 's3vectors.ap-southeast-2.api.aws');
  return next(args);
}, { step: 'build', name: 'verifyRealAWSEndpoint' });
const readOnlyClient = { async send(command, options) {
  assert.ok(['GetIndexCommand', 'QueryVectorsCommand'].includes(command.constructor.name));
  const response = await client.send(command, { ...options, abortSignal: options?.abortSignal ?? AbortSignal.timeout(30000) });
  if (command.constructor.name === 'GetIndexCommand') {
    const index = response.index;
    report.index = { dimension: index?.dimension, distanceMetric: index?.distanceMetric, dataType: index?.dataType,
      nonFilterableMetadataKeys: index?.metadataConfiguration?.nonFilterableMetadataKeys ?? [], requestId: response.$metadata?.requestId };
    for (const key of ['museumId', 'model', 'pretrained', 'version', 'catalogueHash']) assert.ok(!report.index.nonFilterableMetadataKeys.includes(key));
  } else {
    report.queries.push({ endpoint: 's3vectors.ap-southeast-2.api.aws', requestId: response.$metadata?.requestId,
      httpStatus: response.$metadata?.httpStatusCode, filter: command.input.filter, distanceMetric: response.distanceMetric,
      results: response.vectors?.map(v => ({ artworkId: v.metadata?.artworkId, museumId: v.metadata?.museumId, distance: v.distance, similarity: 1 - v.distance })) });
  }
  return response;
} };
try {
  const configured = await check('S3 store selected and expected configuration', () => {
    assert.equal(config.vectorStore, 's3vectors');
    assert.match(config.vectorIndexArn ?? '', /^arn:aws:s3vectors:ap-southeast-2:\d{12}:bucket\/[^/]+\/index\/[^/]+$/);
    assert.equal(config.awsRegion, 'ap-southeast-2'); assert.equal(config.vectorVersion, 'openclip-v1');
    assert.equal(config.threshold, .80); assert.equal(config.dimension, 512);
    assert.equal(config.embeddingModel, 'ViT-B-32'); assert.equal(config.embeddingPretrained, 'laion2b_s34b_b79k');
    const selected = createEmbeddingStore(config);
    assert.equal(typeof selected.search, 'function'); assert.equal(selected.load, undefined);
  });
  const credentials = await check('AWS credentials resolve without exposing secrets', async () => {
    const c = await client.config.credentials();
    assert.ok(c.accessKeyId && c.secretAccessKey);
    assert.ok(!c.expiration || c.expiration > new Date());
    return { temporary: Boolean(c.sessionToken), expiresAt: c.expiration?.toISOString(), sources: Object.keys(c.$source ?? {}) };
  });
  let vector, image;
  const embeddings = createEmbeddingService(config);
  const embedded = await check('Real OpenCLIP normalized 512D reference embedding', async () => {
    image = await normalizeImage(await readFile(referenceImageUrl(artwork)));
    vector = await embeddings.generate(image);
    assert.ok(normalizedVector(vector, 512));
    return { dimensions: vector.length, norm: Math.hypot(...vector) };
  });
  if (configured && credentials && embedded) {
    const store = createS3VectorStore(config, readOnlyClient);
    const identity = { model: config.embeddingModel, pretrained: config.embeddingPretrained, version: config.vectorVersion, catalogueHash: referenceCatalogueHash() };
    await check('15 catalogue references available under current identity filters', async () => {
      const results = await store.search(vector, { topK: 100 });
      assert.deepEqual(new Set(results.map(r => `${r.museumId}:${r.artworkId}`)), new Set(referenceArtworks().map(r => `${r.museumId}:${r.artwork.id}`)));
      assert.equal(results.length, 15);
      return { count: results.length };
    });
    for (const museumId of ['met', 'goma']) {
      await check(`${museumId}: real recognition, ranking, threshold, cap, confirmation and museum isolation`, async () => {
        const collection = catalogues.get(museumId).collection;
        // Exercise the actual multipart HTTP handler, normalization and recognition service.
        const server = createServer(createAIHandler({ config, store }));
        let result, httpStatus;
        try {
          server.listen(0, '127.0.0.1');
          await once(server, 'listening');
          const form = new FormData();
          form.set('image', new Blob([await readFile(referenceImageUrl(artwork))], { type: 'image/jpeg' }), artwork.image);
          const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/artworks/recognise?museumId=${museumId}`,
            { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
          httpStatus = response.status;
          result = await response.json();
          assert.equal(httpStatus, 200);
        } finally {
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
        }
        const query = report.queries.at(-1);
        assert.deepEqual(query.filter, { $and: Object.entries({ ...identity, museumId }).map(([key, value]) => ({ [key]: { $eq: value } })) });
        assert.ok(query.results.length > 0);
        assert.ok(query.results.every(r => r.museumId === museumId && collection.some(a => a.id === r.artworkId)));
        assert.ok(result.candidates.length <= 3); assert.equal(result.requiresConfirmation, true);
        assert.ok(result.candidates.every((c, i, all) => c.similarity >= .8 && (i === 0 || all[i - 1].similarity >= c.similarity)));
        for (const candidate of result.candidates) assert.ok(query.results.some(r => r.artworkId === candidate.artwork.id && Math.abs(candidate.similarity - (1 - r.distance)) < 1e-12));
        if (museumId === 'met') assert.equal(result.candidates[0]?.artwork.id, artwork.id);
        else {
          assert.ok(query.results.every(r => r.artworkId !== artwork.id));
          assert.equal(result.matched, false);
          assert.deepEqual(result.candidates, []);
        }
        return { httpStatus, matched: result.matched, artworkId: result.artwork?.id,
          candidates: result.candidates.map(c => ({ artworkId: c.artwork.id, similarity: c.similarity })), requiresConfirmation: result.requiresConfirmation };
      });
    }
    // Change one filter at a time: successful empty responses prove AWS applies it.
    for (const key of ['museumId', 'model', 'pretrained', 'version', 'catalogueHash']) {
      await check(`AWS rejects matches with a different ${key} filter`, async () => {
        const response = await readOnlyClient.send(new QueryVectorsCommand({ indexArn: config.vectorIndexArn, queryVector: { float32: vector }, topK: 3,
          filter: serializeMetadataFilter({ ...identity, museumId: 'met', [key]: '__unframe_verification_no_match__' }), returnMetadata: true, returnDistance: true }));
        assert.deepEqual(response.vectors, []);
      });
    }
  } else {
    report.checks.push({ name: 'Live AWS recognition and filter verification', status: 'SKIP', reason: 'Requires configured S3 store/index, usable AWS credentials and a real embedding.' });
  }
} finally {
  client.destroy();
  report.passed = report.checks.every(c => c.status === 'PASS');
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
