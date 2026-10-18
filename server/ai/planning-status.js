import { AIError } from './config.js';
import { createLocalClient } from './local-http.js';

export const planningVersion = 6;

export function planningConfiguration(config) {
  return { provider: 'local', ollamaModel: config.ollamaModel, planningModel: config.planningModel, planningVersion,
    ollamaUrl: config.ollamaUrl, timeoutMs: config.timeoutMs, planningTimeoutMs: 0,
    numCtx: config.planningNumCtx, numGpu: config.ollamaNumGpu,
    numPredict: config.planningNumPredict, retryNumPredict: config.planningRetryNumPredict, keepAlive: config.ollamaKeepAlive };
}

// Route planning depends only on the local text model, not CLIP, vision or an image index.
export async function getPlanningStatus({ config, client = createLocalClient(config, 'OLLAMA') }) {
  const result = { ready: false, liveVerified: false,
    configuration: planningConfiguration(config),
    model: null };
  try {
    const tags = await client.request('/api/tags', undefined, 5000);
    const model = tags?.models?.find(item => item.name === config.planningModel || item.model === config.planningModel);
    if (!model) throw new AIError(503, 'OLLAMA_MODEL_MISSING', 'Install the local route model with npm.cmd run ai:routes.');
    if (model.remote_model || model.remote_host) throw new AIError(503, 'OLLAMA_REMOTE_MODEL', 'The route model must have locally installed weights.');
    const details = await client.request('/api/show', { model: config.planningModel }, 5000);
    if (details?.remote_model || details?.remote_host || !details?.capabilities?.includes('completion')) throw new AIError(503, 'OLLAMA_CAPABILITY', 'The installed model cannot generate local route recommendations.');
    result.model = { name: config.planningModel, digest: typeof model.digest === 'string' ? model.digest : null,
      parameterSize: typeof details.details?.parameter_size === 'string' ? details.details.parameter_size : null,
      quantization: typeof details.details?.quantization_level === 'string' ? details.details.quantization_level : null };
    result.ready = true;
    result.message = 'The local planning model is installed. Run npm.cmd run ai:validate:routes to verify real chat and route generation.';
  } catch (error) {
    result.code = error instanceof AIError ? error.code : 'PLANNING_UNAVAILABLE';
    result.message = error instanceof AIError ? error.message : 'Cannot check the local planning model. Run npm.cmd run ai:routes.';
  }
  return result;
}
