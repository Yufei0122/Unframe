import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { AIError } from './config.js';
export const validVector = (v, dimension) => Array.isArray(v) && v.length === dimension && v.every(Number.isFinite) && v.some(n => n !== 0);
export function cosineSimilarity(a, b) {
  if (!validVector(a, b?.length) || !validVector(b, a.length)) throw new AIError(502, 'INVALID_VECTOR', 'Artwork vectors need rebuilding.');
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  return Math.max(-1, Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b))));
}
export function createEmbeddingService(config, google) {
  return { async generate(image) {
    const data = await google.post(config.embeddingModel, config.location, 'predict', { instances: [{ image: { bytesBase64Encoded: image.toString('base64'), mimeType: 'image/jpeg' } }], parameters: { dimension: config.dimension } });
    const vector = data.predictions?.[0]?.imageEmbedding;
    if (!validVector(vector, config.dimension)) throw new AIError(502, 'INVALID_VECTOR', 'Google returned an invalid image embedding.');
    return vector;
  } };
}
export function createEmbeddingStore(config) {
  return {
    async load() {
      let data;
      try { data = JSON.parse(await readFile(config.embeddingsFile, 'utf8')); }
      catch (error) { throw new AIError(503, 'INDEX_UNAVAILABLE', error.code === 'ENOENT' ? 'Artwork recognition needs a collection index. Run npm run ai:index on the server.' : 'Artwork index cannot be read. Rebuild the collection index.'); }
      if (data.version !== 1 || data.model !== config.embeddingModel || data.dimension !== config.dimension || !Array.isArray(data.records) || data.records.some(r => typeof r.artworkId !== 'string' || !validVector(r.vector, config.dimension))) throw new AIError(503, 'INDEX_INCOMPATIBLE', 'Artwork index is incompatible. Run npm run ai:index again.');
      return data.records;
    },
    async save(records) {
      await mkdir(path.dirname(config.embeddingsFile), { recursive: true });
      const temp = `${config.embeddingsFile}.tmp`;
      await writeFile(temp, JSON.stringify({ version: 1, model: config.embeddingModel, dimension: config.dimension, generatedAt: new Date().toISOString(), records }));
      await rename(temp, config.embeddingsFile);
    },
  };
}
