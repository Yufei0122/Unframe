import { applyInteractivePerformanceProfile, ensureOllama, installShutdown, pullOllamaModel, stopOwned } from './ai-runtime.mjs';
import { readAIConfig } from '../server/ai/config.js';
import { inspectVisionModel } from '../server/ai/vision.js';

installShutdown();
applyInteractivePerformanceProfile();
try {
  const config = readAIConfig();
  await ensureOllama();
  await pullOllamaModel(config.visionModel);
  await inspectVisionModel(config);
  console.log('Local vision model is installed and supports images. Restart ai:up and Expo to load the updated backend and Scan screen. Run ai:doctor -- --vision for real image analysis.');
} catch (error) { console.error(`Vision setup failed: ${error.message}`); process.exitCode = 1; }
finally { await stopOwned(); }
