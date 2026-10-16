import path from 'node:path';
import { ensureOllama, pullOllamaModel, ensureNode, startMobileWeb, installShutdown, keepRunning, root, run, stopOwned } from './ai-runtime.mjs';

installShutdown();
try {
  if (process.argv.slice(2).some(arg => !['--web', '--verify'].includes(arg))) throw new Error('Usage: node scripts/ai-routes.mjs [--web] [--verify]');
  await ensureOllama();
  await pullOllamaModel(); // Reuses installed qwen3:4b. No CLIP/vision/index dependency.
  await ensureNode({ planningOnly: true });
  if (process.argv.includes('--verify')) await run(process.execPath, [path.join(root, 'scripts', 'validate-ai-routes.mjs')]);
  if (process.argv.includes('--web')) await startMobileWeb();
  console.log('Local route services are ready. Real inference is verified only by a passing route acceptance report.');
  await keepRunning();
} catch (error) {
  console.error(`Route startup/acceptance failed: ${error.message}`);
  process.exitCode = 1;
} finally { await stopOwned(); }
