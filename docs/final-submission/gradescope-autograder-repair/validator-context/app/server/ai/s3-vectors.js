import { S3VectorsClient, QueryVectorsCommand, GetIndexCommand, PutVectorsCommand } from '@aws-sdk/client-s3vectors';
import { AIError } from './config.js';
import { normalizedVector, referenceArtworks, referenceCatalogueHash } from './embeddings.js';

export function cosineDistanceToSimilarity(distance) {
  if (!Number.isFinite(distance) || distance < 0 || distance > 2) throw new AIError(502, 'INVALID_VECTOR_DISTANCE', 'Invalid cosine distance from vector index.');
  return Math.max(-1, Math.min(1, 1 - distance));
}

export function serializeMetadataFilter(fields) {
  const conditions = Object.entries(fields).map(([key, value]) => ({ [key]: { $eq: value } }));
  if (!conditions.length) return undefined;
  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

export function createS3VectorStore(config, client = new S3VectorsClient({ region: config.awsRegion })) {
  if (!config.vectorIndexArn) throw new Error('S3_VECTOR_INDEX_ARN is required');
  if (config.dimension !== 512 || config.embeddingModel !== 'ViT-B-32' || config.embeddingPretrained !== 'laion2b_s34b_b79k') throw new Error('S3 Vectors requires the existing 512-dimensional OpenCLIP model');
  const identity = { model: config.embeddingModel, pretrained: config.embeddingPretrained, version: config.vectorVersion || 'openclip-v1', catalogueHash: referenceCatalogueHash() };
  let ready;
  async function check(signal) {
    // Cache only successful checks. A transient failure must be retryable.
    ready ||= client.send(new GetIndexCommand({ indexArn: config.vectorIndexArn }), { abortSignal: signal }).then(({ index }) => {
      if (index?.dimension !== 512 || index.distanceMetric !== 'cosine' || index.dataType !== 'float32') throw new AIError(503, 'INDEX_INCOMPATIBLE', 'Use a float32, 512-dimensional cosine S3 Vector index.');
    }).catch(error => { ready = undefined; throw error; });
    await ready;
  }
  return {
    check,
    async search(vector, { museumId, topK = 3, signal } = {}) {
      if (!normalizedVector(vector, 512)) throw new AIError(502, 'INVALID_VECTOR', 'Expected normalized OpenCLIP embedding.');
      await check(signal);
      const fields = { ...identity, ...(museumId ? { museumId } : {}) };
      const response = await client.send(new QueryVectorsCommand({ indexArn: config.vectorIndexArn, queryVector: { float32: vector }, topK,
        filter: serializeMetadataFilter(fields), returnDistance: true, returnMetadata: true }), { abortSignal: signal });
      if (response.distanceMetric !== 'cosine' || !Array.isArray(response.vectors)) throw new AIError(502, 'INDEX_INCOMPATIBLE', 'Vector search did not return cosine results.');
      return response.vectors.map(item => {
        const metadata = item.metadata;
        if (!metadata || Object.entries(fields).some(([key, value]) => metadata[key] !== value)
          || !referenceArtworks().some(r => r.museumId === metadata.museumId && r.artwork.id === metadata.artworkId)) {
          throw new AIError(502, 'INVALID_VECTOR_METADATA', 'Vector result does not belong to the configured catalogue/model.');
        }
        return { artworkId: metadata.artworkId, museumId: metadata.museumId, similarity: cosineDistanceToSimilarity(item.distance) };
      });
    },
    async save(records) {
      const references = referenceArtworks();
      if (records.length !== references.length || new Set(records.map(r => `${r.museumId}:${r.artworkId}`)).size !== references.length
        || records.some(r => !normalizedVector(r.vector, 512) || !references.some(x => x.museumId === r.museumId && x.artwork.id === r.artworkId)
          || !/^[a-f0-9]{64}$/.test(r.sourceHash) || !/^[a-f0-9]{64}$/.test(r.imageHash))) throw new Error('Incomplete or incompatible reference index');
      await check();
      // Versioned keys make reindexing idempotent. Publish a new version only after the job completes.
      const vectors = records.map(r => ({ key: `${identity.version}:${identity.catalogueHash}:${r.museumId}:${r.artworkId}`,
        data: { float32: r.vector }, metadata: { ...identity, artworkId: r.artworkId, museumId: r.museumId, sourceHash: r.sourceHash, imageHash: r.imageHash } }));
      for (let i = 0; i < vectors.length; i += 100) await client.send(new PutVectorsCommand({ indexArn: config.vectorIndexArn, vectors: vectors.slice(i, i + 100) }));
    },
  };
}
