import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export function readAIConfig(env = process.env) {
  const threshold = Number(env.ARTWORK_MATCH_THRESHOLD || '0.80');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('ARTWORK_MATCH_THRESHOLD must be between 0 and 1');
  return {
    project: env.GOOGLE_CLOUD_PROJECT || '', location: env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    geminiLocation: env.GEMINI_LOCATION || 'global', geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash',
    embeddingModel: env.VERTEX_MULTIMODAL_EMBEDDING_MODEL || 'multimodalembedding@001',
    dimension: 1408, threshold, timeoutMs: 25000,
    embeddingsFile: path.resolve(env.ARTWORK_EMBEDDINGS_FILE || path.join(env.UNFRAME_DATA_DIR || path.join(root, 'data'), 'artwork-embeddings.json')),
    allowedOrigins: (env.AI_ALLOWED_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:8082,http://127.0.0.1:8082,http://127.0.0.1:8091').split(',').map(s => s.trim()).filter(Boolean),
  };
}
export class AIError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function requireInput(condition, message) { if (!condition) throw new AIError(400, 'INVALID_INPUT', message); }
export function logFailure(stage, error) {
  // Never log provider payloads, prompts, images, tokens or credential paths.
  console.warn(JSON.stringify({ event: 'ai_failure', stage, code: error instanceof AIError ? error.code : 'UNEXPECTED_ERROR' }));
}
