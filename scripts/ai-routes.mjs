import path from 'node:path';
import { applyInteractivePerformanceProfile, ensureOllama, pullOllamaModel, ensureNode, startMobileWeb, installShutdown, keepRunning, planningModel, root, run, stopOwned, warmOllamaModel } from './ai-runtime.mjs';

installShutdown();
try {
  if (process.argv.slice(2).some(arg => !['--web', '--verify'].includes(arg))) throw new Error('Usage: node scripts/ai-routes.mjs [--web] [--verify]');
  const migrated = applyInteractivePerformanceProfile();
  if (migrated.length) console.log(`Using the 15-second interactive profile for this run (${migrated.join(', ')}). Update .env from .env.example to make it explicit.`);
  await ensureOllama();
  await pullOllamaModel(planningModel); // Independent lightweight route model; no CLIP/vision/index dependency.
  await warmOllamaModel(planningModel);
  await ensureNode({ planningOnly: true });
  if (process.argv.includes('--verify')) await run(process.execPath, [path.join(root, 'scripts', 'validate-qwen-routes.mjs')]);
  if (process.argv.includes('--web')) await startMobileWeb();
  console.log('Local route services are ready. Real inference is verified only by a passing route acceptance report.');
  await keepRunning();
} catch (error) {
  console.error(`Route startup/acceptance failed: ${error.message}`);
  process.exitCode = 1;
} finally { await stopOwned(); }
