import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export function readAIConfig(env = process.env) {
  const threshold = Number(env.ARTWORK_MATCH_THRESHOLD || '0.80');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('ARTWORK_MATCH_THRESHOLD must be between 0 and 1');
  const integer = (key, fallback, min, max) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const localUrl = (key, fallback) => {
    let url;
    try { url = new URL(env[key] || fallback); } catch { throw new Error(`${key} must be a local HTTP URL`); }
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error(`${key} must point to a loopback model service without credentials or a path`);
    return url.origin;
  };
  const ollamaModel = env.OLLAMA_MODEL || 'qwen3:4b';
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(ollamaModel) || /cloud/i.test(ollamaModel)) throw new Error('OLLAMA_MODEL must be a locally installed model');
  const planningModel = env.OLLAMA_PLANNING_MODEL || 'qwen3:1.7b';
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(planningModel) || /cloud/i.test(planningModel)) throw new Error('OLLAMA_PLANNING_MODEL must be a locally installed model');
  const visionModel = env.OLLAMA_VISION_MODEL || 'qwen3-vl:4b';
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(visionModel) || /cloud/i.test(visionModel)) throw new Error('OLLAMA_VISION_MODEL must be a locally installed vision model');
  const ollamaNumCtx = integer('OLLAMA_NUM_CTX', 2048, 2048, 32768);
  const planningNumPredict = integer('OLLAMA_PLANNING_NUM_PREDICT', 1024, 128, 4096);
  return {
    clipUrl: localUrl('OPENCLIP_URL', 'http://127.0.0.1:8001'),
    ollamaUrl: localUrl('OLLAMA_URL', 'http://127.0.0.1:11434'), ollamaModel, planningModel,
    visionModel, visionTimeoutMs: integer('OLLAMA_VISION_TIMEOUT_MS', 14000, 1000, 720000),
    responseBudgetMs: integer('AI_RESPONSE_BUDGET_MS', 15000, 1000, 60000),
    recognitionBudgetMs: integer('AI_RECOGNITION_BUDGET_MS', 5000, 1000, 15000),
    publicSearch: env.ARTWORK_PUBLIC_SEARCH !== 'false',
    embeddingModel: 'ViT-B-32', embeddingPretrained: 'laion2b_s34b_b79k',
    dimension: 512, threshold,
    timeoutMs: integer('OLLAMA_TIMEOUT_MS', 14000, 1000, 1800000),
    clipTimeoutMs: integer('OPENCLIP_TIMEOUT_MS', 4500, 1000, 600000),
    ollamaNumCtx,
    planningNumCtx: integer('OLLAMA_PLANNING_NUM_CTX', Math.max(4096, ollamaNumCtx), 2048, 32768),
    ollamaNumGpu: integer('OLLAMA_NUM_GPU', -1, -1, 999),
    ollamaNumPredict: integer('OLLAMA_NUM_PREDICT', 256, 128, 4096),
    planningNumPredict,
    planningRetryNumPredict: Math.min(4096, Math.max(1024, planningNumPredict * 2)),
    ollamaKeepAlive: env.OLLAMA_KEEP_ALIVE || '10m',
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
