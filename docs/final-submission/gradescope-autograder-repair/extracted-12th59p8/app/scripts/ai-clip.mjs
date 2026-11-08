import { ensureClip, installShutdown, keepRunning, stopOwned } from './ai-runtime.mjs';
installShutdown();
try { await ensureClip(); await keepRunning(); }
catch (error) { console.error(`OpenCLIP: ${error.message}`); process.exitCode = 1; }
finally { await stopOwned(); }
