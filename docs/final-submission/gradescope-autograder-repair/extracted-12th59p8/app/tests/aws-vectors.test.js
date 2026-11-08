import test from 'node:test';
import assert from 'node:assert/strict';
import { readAIConfig } from '../server/ai/config.js';
import { createS3VectorStore, cosineDistanceToSimilarity, serializeMetadataFilter } from '../server/ai/s3-vectors.js';
import { createRecognitionService } from '../server/ai/recognition.js';
import { createArtworkAnalysis } from '../server/ai/artwork-analysis.js';
import { referenceCatalogueHash, referenceArtworks } from '../server/ai/embeddings.js';
import { catalogues } from '../server/ai/catalogues.js';

const config = readAIConfig({ S3_VECTOR_INDEX_ARN: 'arn:aws:s3vectors:ap-southeast-2:123456789012:bucket/test/index/test', VECTOR_STORE: 's3vectors' });
const vector = [1, ...Array(511).fill(0)];
const metadata = (artworkId, museumId = 'met') => ({ artworkId, museumId, model: config.embeddingModel, pretrained: config.embeddingPretrained, version: config.vectorVersion, catalogueHash: referenceCatalogueHash() });
const index = { index: { dimension: 512, distanceMetric: 'cosine', dataType: 'float32' } };

test('cosine distance maps to similarity, never probability; malformed values rejected', () => {
  assert.equal(cosineDistanceToSimilarity(0), 1);
  assert.equal(cosineDistanceToSimilarity(1), 0);
  assert.equal(cosineDistanceToSimilarity(2), -1);
  assert.ok(Math.abs(cosineDistanceToSimilarity(.2) - .8) < 1e-12);
  for (const value of [NaN, Infinity, -.1, 2.1, '0.2', undefined]) assert.throws(() => cosineDistanceToSimilarity(value));
});

test('metadata filter serialization omits empty filters and supports one equality condition', () => {
  assert.equal(serializeMetadataFilter({}), undefined);
  assert.deepEqual(serializeMetadataFilter({ museumId: 'met' }), { museumId: { $eq: 'met' } });
});

test('S3 QueryVectors payload uses explicit AND for all five recognition filters and validates identity', async () => {
  const commands = [];
  const store = createS3VectorStore(config, { send: async command => {
    commands.push(command);
    return command.constructor.name === 'GetIndexCommand' ? index : { distanceMetric: 'cosine', vectors: [{ distance: .1, metadata: metadata('water-lilies') }] };
  } });
  assert.equal((await store.search(vector, { museumId: 'met' }))[0].similarity, .9);
  assert.deepEqual(commands[1].input.filter, { $and: [
    { model: { $eq: 'ViT-B-32' } },
    { pretrained: { $eq: 'laion2b_s34b_b79k' } },
    { version: { $eq: config.vectorVersion } },
    { catalogueHash: { $eq: referenceCatalogueHash() } },
    { museumId: { $eq: 'met' } },
  ] });
  assert.deepEqual(commands[1].input.queryVector, { float32: vector });
  assert.equal(commands[1].input.returnDistance, true);
  assert.equal(commands[1].input.returnMetadata, true);
  await store.search(vector, { museumId: 'met' });
  assert.equal(commands.filter(x => x.constructor.name === 'GetIndexCommand').length, 1);
  for (const altered of [
    ...['museumId', 'model', 'pretrained', 'version', 'catalogueHash'].map(key => ({ ...metadata('water-lilies'), [key]: 'incompatible' })),
    metadata('invented'), { ...metadata('water-lilies'), artworkId: undefined },
  ]) {
    const bad = createS3VectorStore(config, { send: async cmd => cmd.constructor.name === 'GetIndexCommand' ? index : { distanceMetric: 'cosine', vectors: [{ distance: 0, metadata: altered }] } });
    await assert.rejects(bad.search(vector, { museumId: 'met' }), { code: 'INVALID_VECTOR_METADATA' });
  }
});

test('global S3 QueryVectors payload keeps all four identity filters without a museum condition', async () => {
  const commands = [];
  const store = createS3VectorStore(config, { send: async command => {
    commands.push(command);
    return command.constructor.name === 'GetIndexCommand' ? index : { distanceMetric: 'cosine', vectors: [] };
  } });
  await store.search(vector);
  assert.deepEqual(commands[1].input.filter, { $and: [
    { model: { $eq: 'ViT-B-32' } },
    { pretrained: { $eq: 'laion2b_s34b_b79k' } },
    { version: { $eq: config.vectorVersion } },
    { catalogueHash: { $eq: referenceCatalogueHash() } },
  ] });
});

test('wrong index metric/dimension and non-normalized vectors fail closed', async () => {
  for (const properties of [{ dimension: 1024 }, { distanceMetric: 'euclidean' }, { dataType: 'invalid' }]) {
    const store = createS3VectorStore(config, { send: async () => ({ index: { ...index.index, ...properties } }) });
    await assert.rejects(store.search(vector), { code: 'INDEX_INCOMPATIBLE' });
  }
  const store = createS3VectorStore(config, { send: async () => assert.fail('No AWS call for invalid vector') });
  await assert.rejects(store.search(vector.map(x => x * 2)), { code: 'INVALID_VECTOR' });
});

test('remote candidate path retains ranking, threshold, cap, filtering, and human confirmation', async () => {
  const collection = catalogues.get('met').collection;
  let called;
  const store = { search: async (_, options) => { called = options; return [
    { artworkId: collection[0].id, similarity: .81 }, { artworkId: collection[0].id, similarity: .95 },
    { artworkId: collection[1].id, similarity: .9 }, { artworkId: collection[2].id, similarity: .8 },
    { artworkId: collection[3].id, similarity: .79 }, { artworkId: 'foreign', similarity: 1 },
  ]; } };
  const service = createRecognitionService({ config, museumId: 'met', collection, store,
    embeddings: { generate: async () => vector }, ollama: { generateArtworkExplanation: () => assert.fail('No explanation before confirmation') } });
  const result = await service.recognise(Buffer.from('image'));
  assert.equal(called.museumId, 'met'); assert.equal(called.topK, collection.length);
  assert.deepEqual(result.candidates.map(x => x.similarity), [.95, .9, .8]);
  assert.equal(result.requiresConfirmation, true); assert.equal(result.aiExplanation, null);
});

test('general analysis uses global remote search and retains distinct-match margin', async () => {
  let visionCalls = 0;
  const first = referenceArtworks()[0];
  for (const [second, expectedMethod] of [[.8, 'collection'], [.89, 'vision']]) {
    const analysis = createArtworkAnalysis({ ...config, publicSearch: false }, {
      store: { search: async (_, options) => { assert.equal(options.museumId, undefined); return [{ artworkId: first.artwork.id, museumId: first.museumId, similarity: .9 }, { similarity: second }]; } },
      embeddings: { generate: async () => vector },
      vision: { analyse: async () => { visionCalls++; return { artworkPresence: 'uncertain', description: 'Uncertain.', visualFeatures: [], visibleText: [], hypotheses: [] }; } },
    });
    assert.equal((await analysis.analyse(Buffer.from('image'))).method, expectedMethod);
  }
  assert.equal(visionCalls, 1);
});

test('index publication uses versioned keys and validates complete catalogue before writing', async () => {
  const commands = [];
  const store = createS3VectorStore(config, { send: async cmd => { commands.push(cmd); return index; } });
  await assert.rejects(store.save([])); assert.equal(commands.length, 0);
  const records = referenceArtworks().map(({ museumId, artwork }) => ({ museumId, artworkId: artwork.id, vector, sourceHash: 'a'.repeat(64), imageHash: 'b'.repeat(64) }));
  await store.save(records);
  const put = commands.find(x => x.constructor.name === 'PutVectorsCommand').input;
  assert.equal(put.vectors.length, 15);
  assert.ok(put.vectors[0].key.startsWith(config.vectorVersion + ':'));
  assert.equal(put.vectors[0].metadata.sourceHash, 'a'.repeat(64));
});
