import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { AIError } from './config.js';
import { createLocalClient } from './local-http.js';
import { catalogues } from './catalogues.js';

export const validVector = (v, dimension) => Array.isArray(v) && v.length === dimension && v.every(Number.isFinite) && v.some(n => n !== 0);
export const normalizedVector = (v, dimension) => validVector(v, dimension) && Math.abs(Math.hypot(...v) - 1) <= 0.001;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const referenceArtworks = () => [...catalogues].flatMap(([museumId, { collection }]) => collection.map(artwork => ({ museumId, artwork })));
const catalogueHash = () => sha256(JSON.stringify(referenceArtworks().map(({ museumId, artwork }) => ({ museumId, artworkId: artwork.id, image: artwork.image }))));
export const referenceImageUrl = artwork => new URL(`../../mobile/assets/${artwork.image}`, import.meta.url);

export function cosineSimilarity(a, b) {
  if (!validVector(a, b?.length) || !validVector(b, a.length)) throw new AIError(502, 'INVALID_VECTOR', 'Artwork vectors need rebuilding.');
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  return Math.max(-1, Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b))));
}
export function validateEmbeddingIdentity(data, config) {
  if (data?.model !== config.embeddingModel || data?.pretrained !== config.embeddingPretrained || data?.dimensions !== config.dimension || data?.normalized !== true) throw new AIError(502, 'OPENCLIP_MODEL_MISMATCH', 'OpenCLIP must use ViT-B-32 / laion2b_s34b_b79k with normalized 512-dimensional embeddings.');
}
export function createEmbeddingService(config, client = createLocalClient(config, 'OPENCLIP')) {
  return { async generate(image) {
    const data = await client.request('/embed', { imageBase64: image.toString('base64'), mimeType: 'image/jpeg' });
    validateEmbeddingIdentity(data, config);
    if (!normalizedVector(data.embedding, config.dimension)) throw new AIError(502, 'INVALID_VECTOR', 'OpenCLIP returned an invalid or non-normalized image embedding.');
    return data.embedding;
  } };
}
export function createEmbeddingStore(config) {
  const incompatible = () => new AIError(503, 'INDEX_INCOMPATIBLE', 'Artwork index does not match the local OpenCLIP model, catalogue, or sources. Run npm.cmd run ai:index; legacy vectors cannot be reused.');
  const validateRecords = records => {
    const references = referenceArtworks();
    if (!Array.isArray(records) || records.length !== references.length || new Set(records.map(r => `${r?.museumId}:${r?.artworkId}`)).size !== records.length || records.some(r => !r || !references.some(({ museumId, artwork }) => r.museumId === museumId && r.artworkId === artwork.id) || !normalizedVector(r.vector, config.dimension) || !/^[a-f0-9]{64}$/.test(r.sourceHash) || !/^[a-f0-9]{64}$/.test(r.imageHash))) throw incompatible();
  };
  return {
    async load({ verifySources = false } = {}) {
      let data;
      try { data = JSON.parse(await readFile(config.embeddingsFile, 'utf8')); }
      catch (error) { throw new AIError(503, 'INDEX_UNAVAILABLE', error.code === 'ENOENT' ? 'Artwork recognition needs a collection index. Run npm.cmd run ai:index.' : 'Artwork index cannot be read. Rebuild the collection index.'); }
      if (data.version !== 2 || data.provider !== 'openclip' || data.model !== config.embeddingModel || data.pretrained !== config.embeddingPretrained || data.dimension !== config.dimension || data.normalized !== true || data.catalogueHash !== catalogueHash()) throw incompatible();
      validateRecords(data.records);
      if (verifySources) {
        for (const { museumId, artwork } of referenceArtworks()) {
          let bytes;
          try { bytes = await readFile(referenceImageUrl(artwork)); }
          catch { throw new AIError(503, 'INDEX_SOURCE_UNAVAILABLE', 'A catalogue reference image cannot be read. Restore its bundled asset and rebuild the index.'); }
          if (data.records.find(r => r.museumId === museumId && r.artworkId === artwork.id).sourceHash !== sha256(bytes)) throw incompatible();
        }
      }
      return data.records;
    },
    async save(records) {
      validateRecords(records);
      await mkdir(path.dirname(config.embeddingsFile), { recursive: true });
      const temp = `${config.embeddingsFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, JSON.stringify({ version: 2, provider: 'openclip', model: config.embeddingModel, pretrained: config.embeddingPretrained, dimension: config.dimension, normalized: true, catalogueHash: catalogueHash(), generatedAt: new Date().toISOString(), records }), { flag: 'wx' });
        // Same-directory rename is the only replacement. A failed build/write keeps the old index.
        await rename(temp, config.embeddingsFile);
      } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    },
  };
}
