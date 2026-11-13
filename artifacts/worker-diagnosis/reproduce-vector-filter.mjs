import { readFile } from 'node:fs/promises';
import { S3VectorsClient, QueryVectorsCommand } from '@aws-sdk/client-s3vectors';
import { referenceCatalogueHash } from '../../server/ai/embeddings.js';
const references = JSON.parse(await readFile(new URL('../../data/artwork-embeddings.json', import.meta.url)));
const vector = references.records.find(r => r.artworkId === 'water-lilies' && r.museumId === 'met').vector;
const fields = { model: 'ViT-B-32', pretrained: 'laion2b_s34b_b79k', version: 'openclip-v1', catalogueHash: referenceCatalogueHash(), museumId: 'met' };
const client = new S3VectorsClient({ region: 'ap-southeast-2' });
try {
  for (const [label, filter] of [['deployed-v1', fields], ['corrected', { $and: Object.entries(fields).map(([k, v]) => ({ [k]: { $eq: v } })) }]]) {
    try {
      const r = await client.send(new QueryVectorsCommand({ indexArn: 'arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors/index/a3-n12281212-unframe-vectors', queryVector: { float32: vector }, topK: 3, filter, returnMetadata: true, returnDistance: true }));
      console.log(JSON.stringify({ label, httpStatusCode: r.$metadata.httpStatusCode, requestId: r.$metadata.requestId, metric: r.distanceMetric, candidates: r.vectors.map(v => ({ artworkId: v.metadata.artworkId, museumId: v.metadata.museumId, similarity: 1 - v.distance })) }));
    } catch (e) { console.log(JSON.stringify({ label, exception: e.name, httpStatusCode: e.$metadata?.httpStatusCode, requestId: e.$metadata?.requestId, invalidFilter: e.message === 'Invalid filter' })); }
  }
} finally { client.destroy(); }
