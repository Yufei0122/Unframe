import path from 'node:path';
import { readAIConfig } from '../server/ai/config.js';
import { applyInteractivePerformanceProfile, ensureOllama, pullOllamaModel, ensureNode, startMobileWeb, installShutdown, keepRunning, planningModel, root, run, stopOwned, warmOllamaModel } from './ai-runtime.mjs';

installShutdown();
try {
  if (process.argv.slice(2).some(arg => !['--web', '--verify', '--timing'].includes(arg))) throw new Error('Usage: node scripts/ai-routes.mjs [--web] [--verify] [--timing]');
  const migrated = applyInteractivePerformanceProfile();
  if (migrated.length) console.log(`Using updated inference settings for this run (${migrated.join(', ')}).`);
  console.log('Planning chat/routes: no automatic timeout or 15-second acceptance limit; Ctrl+C cancels.');
  await ensureOllama();
  await pullOllamaModel(planningModel); // Independent lightweight route model; no CLIP/vision/index dependency.
  await warmOllamaModel(planningModel, { planning: true });
  const config = readAIConfig();
  const retry = config.planningRetryNumPredict > config.planningNumPredict ? `one retry up to ${config.planningRetryNumPredict} tokens only after truncation` : 'retry disabled at the maximum output budget';
  console.log(`Planning output: up to ${config.planningNumPredict} tokens; ${retry}; context ${config.planningNumCtx}.`);
  await ensureNode({ planningOnly: true });
  if (process.argv.includes('--timing')) await run(process.execPath, [path.join(root, 'scripts', 'validate-ai-visit.mjs'), '--timing']);
  if (process.argv.includes('--verify')) await run(process.execPath, [path.join(root, 'scripts', 'validate-ai-visit.mjs')]);
  if (process.argv.includes('--web')) await startMobileWeb();
  if (!process.argv.includes('--timing') || process.argv.includes('--web')) {
    console.log('Local route services are ready. Real inference is verified only by a passing route acceptance report.');
    await keepRunning();
  }
} catch (error) {
  console.error(`Route startup/acceptance failed: ${error.message}`);
  process.exitCode = 1;
} finally { await stopOwned(); }
