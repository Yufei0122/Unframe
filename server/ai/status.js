import { createLocalClient } from './local-http.js';
import { validateEmbeddingIdentity } from './embeddings.js';
import { inspectVisionModel } from './vision.js';
import { planningConfiguration } from './planning-status.js';

export async function inspectLocalServices(config, { clip = createLocalClient(config, 'OPENCLIP'), ollamaClient = createLocalClient(config, 'OLLAMA') } = {}) {
  const [openclip, ollama, vision] = await Promise.all([
    (async () => {
      try { const health = await clip.request('/health', undefined, 5000); validateEmbeddingIdentity(health, config); return { available: true }; }
      catch (error) { return { available: false, code: error.code || 'OPENCLIP_UNAVAILABLE' }; }
    })(),
    (async () => {
      try {
        const tags = await ollamaClient.request('/api/tags', undefined, 5000);
        const local = name => Array.isArray(tags.models) && tags.models.some(model => (model.name === name || model.model === name) && !model.remote_model && !model.remote_host);
        const modelAvailable = local(config.ollamaModel), planningModelAvailable = local(config.planningModel);
        return { available: true, modelAvailable, planningModelAvailable, ...(!modelAvailable || !planningModelAvailable ? { code: 'OLLAMA_MODEL_MISSING' } : {}) };
      } catch (error) { return { available: false, modelAvailable: false, code: error.code || 'OLLAMA_UNAVAILABLE' }; }
    })(),
    (async () => {
      try { return await inspectVisionModel(config, ollamaClient); }
      catch (error) { return { available: false, model: config.visionModel, code: error.code || 'VISION_UNAVAILABLE' }; }
    })(),
  ]);
  return { openclip, ollama, vision };
}

export async function getAIStatus({ config, store, collection, museumId, clip, ollamaClient, services, verifySources = false }) {
  const serviceStatus = services || await inspectLocalServices(config, { clip, ollamaClient });
  const index = { available: false, indexedArtworks: 0, totalArtworks: collection.length };
  try {
    const records = await store.load({ verifySources });
    index.indexedArtworks = new Set(records.filter(r => (!r.museumId || r.museumId === museumId) && collection.some(a => a.id === r.artworkId)).map(r => r.artworkId)).size;
    index.available = index.indexedArtworks === collection.length && collection.length > 0;
    if (!index.available) index.code = index.indexedArtworks ? 'INDEX_INCOMPLETE' : 'EMPTY_INDEX';
  } catch (error) { index.code = ['INDEX_UNAVAILABLE', 'INDEX_INCOMPATIBLE', 'INDEX_SOURCE_UNAVAILABLE'].includes(error.code) ? error.code : 'INDEX_UNAVAILABLE'; }
  const recognitionReady = index.available && serviceStatus.openclip.available;
  const ready = recognitionReady && serviceStatus.ollama.available && serviceStatus.ollama.modelAvailable && serviceStatus.ollama.planningModelAvailable;
  const problems = [];
  if (!serviceStatus.openclip.available) problems.push('OpenCLIP is unavailable or has the wrong model. Run npm.cmd run ai:up.');
  if (!serviceStatus.ollama.available) problems.push('Ollama is unavailable. Run npm.cmd run ai:up.');
  else if (!serviceStatus.ollama.modelAvailable) problems.push('Install the local Qwen model with npm.cmd run ai:setup.');
  else if (!serviceStatus.ollama.planningModelAvailable) problems.push('Install the lightweight route model with npm.cmd run ai:routes.');
  if (!index.available) problems.push('Build the complete museum index with npm.cmd run ai:index.');
  return {
    museumId, ready, recognitionReady, planningReady: serviceStatus.ollama.available && serviceStatus.ollama.planningModelAvailable,
    analysisReady: serviceStatus.vision?.available === true, liveVerified: false,
    analysisMessage: serviceStatus.vision?.available ? 'General visual analysis is available. Public reference search needs internet access; identities remain unconfirmed.' : 'General visual analysis needs a local vision model. Run npm.cmd run ai:setup:vision, then ai:doctor -- --vision.',
    configuration: { valid: true, ...planningConfiguration(config), embeddingModel: config.embeddingModel, embeddingPretrained: config.embeddingPretrained, dimension: config.dimension, visionModel: config.visionModel, analysisVersion: 3, visionTimeoutMs: config.visionTimeoutMs, visionNumPredict: config.visionNumPredict, visionNumCtx: config.visionNumCtx, analysisBudgetMs: config.analysisBudgetMs, explanationTimeoutMs: config.explanationTimeoutMs, recognitionBudgetMs: config.recognitionBudgetMs, responseBudgetMs: config.responseBudgetMs },
    services: serviceStatus, index,
    message: problems.length ? problems.join(' ') : 'Local services, model and index are ready. Run npm.cmd run ai:doctor -- --smoke for real inference checks.',
  };
}
