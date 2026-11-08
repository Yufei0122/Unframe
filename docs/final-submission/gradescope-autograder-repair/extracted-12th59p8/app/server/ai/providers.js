import { createOllamaService } from './ollama.js';
import { createVisionService } from './vision.js';
import { createBedrockGenerator, createBedrockVision } from './bedrock.js';

export function createAIProviders(config, { ollamaClient, bedrockClient, gate = { active: false } } = {}) {
  if (config.aiProvider !== 'bedrock') return {
    text: createOllamaService(config, ollamaClient, gate), vision: createVisionService(config, { gate }),
  };
  const generate = createBedrockGenerator(config, { client: bedrockClient, gate });
  // The existing factory owns catalogue prompts/validation, including extractive explanations.
  // Its generator seam bypasses every Ollama request and uses Bedrock model IDs.
  return {
    text: { ...createOllamaService({ ...config, ollamaModel: config.bedrockModel, planningModel: config.bedrockPlanningModel }, undefined, gate, generate), provider: 'bedrock' },
    vision: createBedrockVision(config, generate),
  };
}
