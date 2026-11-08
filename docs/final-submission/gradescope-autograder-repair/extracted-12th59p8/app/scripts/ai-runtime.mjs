import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import { planningConfiguration } from '../server/ai/planning-status.js';
import { readAIConfig } from '../server/ai/config.js';
import { ARTWORK_ANALYSIS_VERSION } from '../server/ai/vision.js';
import { referenceCatalogueHash } from '../server/ai/embeddings.js';
import { RECOGNITION_VERSION } from '../server/ai/artwork-detection.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
export const identity = { model: 'ViT-B-32', pretrained: 'laion2b_s34b_b79k', dimensions: 512, normalized: true };
const children = new Set();
let shutdownPromise;

export function endpoint(name, fallback) {
  const url = new URL(process.env[name] || fallback);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be a loopback HTTP origin, for example ${fallback}.`);
  }
  return url.origin;
}
export const clipUrl = endpoint('OPENCLIP_URL', 'http://127.0.0.1:8001');
export const ollamaUrl = endpoint('OLLAMA_URL', 'http://127.0.0.1:11434');
export let ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:1.7b';
if (!/^[a-zA-Z0-9_.:/-]+$/.test(ollamaModel) || /cloud/i.test(ollamaModel)) throw new Error('OLLAMA_MODEL must name a locally installed model, not a cloud model.');
export const planningModel = process.env.OLLAMA_PLANNING_MODEL || 'qwen3:1.7b';
if (!/^[a-zA-Z0-9_.:/-]+$/.test(planningModel) || /cloud/i.test(planningModel)) throw new Error('OLLAMA_PLANNING_MODEL must name a locally installed model, not a cloud model.');

export function applyInteractivePerformanceProfile(env = process.env) {
  const legacy = {
    OPENCLIP_TIMEOUT_MS: ['120000', '4500'], OLLAMA_VISION_TIMEOUT_MS: ['540000', '120000'],
    OLLAMA_TIMEOUT_MS: ['300000', '14000'], OLLAMA_NUM_CTX: ['4096', '2048'], OLLAMA_NUM_GPU: ['0', '-1'],
    OLLAMA_NUM_PREDICT: ['768', '256'], OLLAMA_KEEP_ALIVE: ['0', '10m'],
    OLLAMA_PLANNING_NUM_PREDICT: ['192', '1024'],
    EXPO_PUBLIC_AI_TIMEOUT_MS: ['330000', '50000'], EXPO_PUBLIC_CLIP_TIMEOUT_MS: ['150000', '5000'],
    EXPO_PUBLIC_VISION_TIMEOUT_MS: ['660000', '130000'],
  };
  const changed = [];
  if (env.OLLAMA_MODEL === 'qwen3:4b') { env.OLLAMA_MODEL = 'qwen3:1.7b'; changed.push('OLLAMA_MODEL'); }
  if (['qwen3-vl:4b', 'qwen3-vl:2b'].includes(env.OLLAMA_VISION_MODEL)) {
    env.OLLAMA_VISION_MODEL += '-instruct'; changed.push('OLLAMA_VISION_MODEL');
  }
  if (!env.AI_RESPONSE_BUDGET_MS) { env.AI_RESPONSE_BUDGET_MS = '15000'; changed.push('AI_RESPONSE_BUDGET_MS'); }
  if (!env.AI_RECOGNITION_BUDGET_MS) { env.AI_RECOGNITION_BUDGET_MS = '5000'; changed.push('AI_RECOGNITION_BUDGET_MS'); }
  if (!env.AI_ANALYSIS_BUDGET_MS) { env.AI_ANALYSIS_BUDGET_MS = '125000'; changed.push('AI_ANALYSIS_BUDGET_MS'); }
  for (const [key, [before, after]] of Object.entries(legacy)) {
    if (env[key] === undefined || env[key] === before) { if (env[key] !== after) changed.push(key); env[key] = after; }
  }
  for (const [key, before, after] of [['OPENCLIP_TIMEOUT_MS', '10000', '4500'], ['EXPO_PUBLIC_CLIP_TIMEOUT_MS', '14500', '5000'], ['OLLAMA_VISION_TIMEOUT_MS', '14000', '120000'], ['EXPO_PUBLIC_VISION_TIMEOUT_MS', '14500', '130000'], ['EXPO_PUBLIC_AI_TIMEOUT_MS', '14500', '50000']]) {
    if (env[key] === before) { env[key] = after; if (!changed.includes(key)) changed.push(key); }
  }
  if (env === process.env) ollamaModel = env.OLLAMA_MODEL || 'qwen3:1.7b';
  return changed;
}

export function spawnOwned(command, args, options = {}) {
  const { managedStdin = false, ...spawnOptions } = options;
  const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: managedStdin ? ['pipe', 'inherit', 'inherit'] : 'inherit', ...spawnOptions });
  child.managedStdin = managedStdin;
  child.stdin?.on('error', () => { /* A child may close stdin before shutdown. */ });
  children.add(child);
  child.result = new Promise(resolve => {
    child.once('error', error => { child.spawnError = error; children.delete(child); resolve({ error, code: 1 }); });
    child.once('exit', (code, signal) => { children.delete(child); resolve({ code, signal }); });
  });
  return child;
}

export async function run(command, args, options) {
  const result = await spawnOwned(command, args, options).result;
  if (result.error) throw new Error(`Cannot start ${path.basename(command)}: ${result.error.message}`);
  if (result.code !== 0) throw new Error(`${path.basename(command)} exited with ${result.code ?? result.signal}.`);
}

function terminateOwned(owned) {
  for (const child of owned) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    // Never kill by process name or port: only this invocation's still-owned process tree.
    if (process.platform === 'win32') {
      const stopped = spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      // Restricted Windows shells may deny taskkill's process enumeration even
      // though terminating the direct owned child is permitted.
      if (stopped.status !== 0) child.kill('SIGTERM');
    } else child.kill('SIGTERM');
  }
}

function closeManagedInput(owned, force = false) {
  for (const child of owned) {
    if (child.managedStdin && child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
      if (force) child.stdin.destroy();
    }
  }
}

export function stopOwned() {
  if (shutdownPromise) return shutdownPromise;
  const owned = [...children];
  closeManagedInput(owned);
  shutdownPromise = (async () => {
    const cooperative = owned.filter(child => child.managedStdin);
    if (cooperative.length) await Promise.race([Promise.all(cooperative.map(child => child.result)), delay(1500)]);
    closeManagedInput(owned, true);
    terminateOwned(owned);
  })().finally(() => { shutdownPromise = undefined; });
  return shutdownPromise;
}

export function installShutdown() {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.once(signal, () => { void stopOwned().finally(() => process.exit(code)); });
  }
  // Exit handlers cannot await. EOF still reaches a redirected Windows Python
  // interpreter if process-tree termination is unavailable or this parent dies.
  process.once('exit', () => { const owned = [...children]; closeManagedInput(owned, true); terminateOwned(owned); });
}

export async function getJSON(url, timeoutMs = 3000) {
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) {
    if (error.cause?.code === 'ECONNREFUSED' || error.cause?.errors?.every(item => item.code === 'ECONNREFUSED')) return null;
    throw new Error(`Cannot reach ${url}: ${error.name === 'TimeoutError' ? 'request timed out; check the process using this port' : error.cause?.code || error.message}.`);
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}; another or incompatible service may be using the port.`);
  try { return await response.json(); } catch { throw new Error(`${url} did not return JSON; another service may be using the port.`); }
}

async function waitReady(url, child, validate) {
  const timeout = Number(process.env.AI_STARTUP_TIMEOUT_MS || 600000);
  if (!Number.isFinite(timeout) || timeout < 1000) throw new Error('AI_STARTUP_TIMEOUT_MS must be at least 1000.');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error(`Service exited before ${url} was ready. Check the preceding error.`);
    const value = await getJSON(url);
    if (value) { validate(value); return value; }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}. Check free RAM, downloaded model files and AI_STARTUP_TIMEOUT_MS.`);
}

function validateClip(health) {
  if (health.status !== 'ok' || Object.entries(identity).some(([key, value]) => health[key] !== value)) {
    throw new Error('The service at OPENCLIP_URL has a different model identity. Stop or reconfigure that service explicitly; it was left untouched.');
  }
}

export async function ensureClip() {
  const existing = await getJSON(`${clipUrl}/health`);
  if (existing) { validateClip(existing); console.log(`Reusing OpenCLIP at ${clipUrl}.`); return { reused: true, health: existing }; }
  if (!existsSync(python)) throw new Error('Python environment is missing. Run npm.cmd run ai:setup first.');
  const url = new URL(clipUrl);
  if (url.hostname === '[::1]') throw new Error('Use OPENCLIP_URL=http://127.0.0.1:8001 for the bundled IPv4 service.');
  const child = spawnOwned(python, ['-u', path.join(root, 'local-ai', 'server.py'), '--host', url.hostname, '--port', url.port || '80', '--managed-stdin'], { managedStdin: true });
  const health = await waitReady(`${clipUrl}/health`, child, validateClip);
  return { reused: false, child, health };
}

function ollamaExecutable() {
  if (process.env.OLLAMA_EXE) return process.env.OLLAMA_EXE;
  const local = process.platform === 'win32' && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe');
  return local && existsSync(local) ? local : 'ollama';
}

function validateOllama(value) {
  if (typeof value.version !== 'string') throw new Error('OLLAMA_URL is not an Ollama API server.');
}

export async function ensureOllama() {
  const existing = await getJSON(`${ollamaUrl}/api/version`);
  if (existing) { validateOllama(existing); console.log(`Reusing Ollama ${existing.version} at ${ollamaUrl}.`); return { reused: true }; }
  const child = spawnOwned(ollamaExecutable(), ['serve'], {
    env: { ...process.env, OLLAMA_HOST: new URL(ollamaUrl).host, OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1' },
  });
  try { await waitReady(`${ollamaUrl}/api/version`, child, validateOllama); }
  catch (error) { throw new Error(`${error.message} If Ollama is missing, install it from https://ollama.com/download/windows and rerun ai:setup.`); }
  return { reused: false, child };
}

export async function requireOllamaModel(modelName = ollamaModel) {
  const tags = await getJSON(`${ollamaUrl}/api/tags`);
  const model = tags?.models?.find(model => model.name === modelName || model.model === modelName);
  if (model?.remote_model || model?.remote_host) throw new Error(`${modelName} is a remote model alias. Install actual local weights; the existing alias was left untouched.`);
  if (!model) {
    throw new Error(`${modelName} is not installed in the running Ollama server. Run npm.cmd run ai:setup.`);
  }
  console.log(`Ollama model ${modelName} is installed.`);
}

export async function warmOllamaModel(modelName = ollamaModel, { planning = false } = {}) {
  const timeout = Number(process.env.AI_STARTUP_TIMEOUT_MS || 600000);
  const started = performance.now();
  console.log(`Warming ${modelName}; startup time is measured separately from planning responses.`);
  const configuredGpu = Number(process.env.OLLAMA_NUM_GPU ?? -1);
  const config = readAIConfig();
  const options = numGpu => ({ num_ctx: planning ? config.planningNumCtx : config.ollamaNumCtx, num_gpu: numGpu });
  async function attempt(numGpu) {
    let response;
    try {
      response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, prompt: '', stream: false, keep_alive: process.env.OLLAMA_KEEP_ALIVE || '10m', options: options(numGpu) }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) { throw new Error(error.cause?.code || error.name); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`HTTP ${response.status}: invalid JSON response`); }
    if (!response.ok) {
      const detail = typeof data?.error === 'string' ? data.error.replace(/[\u0000-\u001f]+/gu, ' ').trim().slice(0, 500) : 'no error detail';
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    return data;
  }
  try { await attempt(configuredGpu); }
  catch (firstError) {
    if (configuredGpu === 0) throw new Error(`Cannot warm ${modelName}: ${firstError.message}. Run "ollama run ${modelName}" to inspect or repair the local model.`);
    console.warn(`Ollama could not load ${modelName} with GPU acceleration (${firstError.message}). Retrying on CPU for this run.`);
    try {
      await attempt(0);
      process.env.OLLAMA_NUM_GPU = '0';
      console.log(`${modelName} loaded on CPU. Unframe will use OLLAMA_NUM_GPU=0 for this run.`);
    } catch (cpuError) {
      throw new Error(`Cannot warm ${modelName}. GPU attempt: ${firstError.message}. CPU attempt: ${cpuError.message}. Run "ollama run ${modelName}" to inspect or repair the local model, then retry npm.cmd start.`);
    }
  }
  console.log(`${modelName} is warm (${Math.round(performance.now() - started)} ms).`);
}

export async function pullOllamaModel(modelName = ollamaModel) {
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(modelName) || /cloud/i.test(modelName)) throw new Error('Only a local model may be downloaded.');
  const tags = await getJSON(`${ollamaUrl}/api/tags`);
  if (tags?.models?.some(model => model.name === modelName || model.model === modelName)) return requireOllamaModel(modelName);
  console.log(`Downloading public Ollama model ${modelName}; existing models are preserved.`);
  const response = await fetch(`${ollamaUrl}/api/pull`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, stream: true }), signal: AbortSignal.timeout(3 * 60 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Ollama model download returned HTTP ${response.status}. Check registry access and disk space.`);
  let pending = '', lastProgress = '', completed = false;
  function report(line) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.error) throw new Error(`Ollama download failed: ${event.error}`);
    const progress = event.total ? `${event.status}: ${Math.floor((event.completed || 0) / event.total * 10) * 10}%` : event.status;
    if (progress && progress !== lastProgress) { console.log(progress); lastProgress = progress; }
    if (event.status === 'success') completed = true;
  }
  for await (const chunk of response.body) {
    pending += Buffer.from(chunk).toString('utf8');
    let boundary;
    while ((boundary = pending.indexOf('\n')) >= 0) { report(pending.slice(0, boundary)); pending = pending.slice(boundary + 1); }
  }
  report(pending);
  if (!completed) throw new Error('Ollama model download ended before completion. Rerun ai:setup to resume.');
  await requireOllamaModel(modelName);
}

export async function ensureNode({ planningOnly = false } = {}) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const address = `http://127.0.0.1:${port}`;
  const dataFile = path.resolve(process.env.UNFRAME_DATA_DIR || path.join(root, 'data'), 'unframe.json');
  const workspace = createHash('sha256').update(process.platform === 'win32' ? dataFile.toLowerCase() : dataFile).digest('hex');
  const validate = health => { if (health.app !== 'unframe' || health.workspace !== workspace) throw new Error(`Port ${port} belongs to another app or Unframe workspace; it was left untouched. Choose another PORT.`); };
  const validateAI = async () => {
    const status = await getJSON(`${address}/api/ai/${planningOnly ? 'planning/status' : 'status?museumId=met'}`, 15000);
    const planning = planningConfiguration(readAIConfig());
    const expected = planningOnly ? planning
      : { ...planning, embeddingModel: identity.model, embeddingPretrained: identity.pretrained, dimension: identity.dimensions, visionModel: readAIConfig().visionModel, analysisVersion: ARTWORK_ANALYSIS_VERSION, recognitionVersion: RECOGNITION_VERSION, visionTimeoutMs: readAIConfig().visionTimeoutMs, visionNumPredict: readAIConfig().visionNumPredict, visionNumCtx: readAIConfig().visionNumCtx, analysisBudgetMs: readAIConfig().analysisBudgetMs, explanationTimeoutMs: readAIConfig().explanationTimeoutMs };
    const mismatches = Object.entries(expected).filter(([key, value]) => status?.configuration?.[key] !== value).map(([key]) => key);
    if (mismatches.length) {
      throw new Error(`The Unframe process at ${address} is using an older or different AI configuration (${mismatches.join(', ')}). It was left running. Stop it in its original terminal, then rerun npm.cmd run ${planningOnly ? 'ai:routes' : 'ai:up'} (or choose another PORT).`);
    }
    if (!planningOnly && (status?.catalogueHash !== referenceCatalogueHash() || !status?.recognitionReady)) {
      throw new Error(`Scan is not ready at ${address} (${status?.index?.code || 'outdated catalogue or image service'}). Stop the old backend in its original terminal and rerun npm.cmd start so the current catalogue and image index are loaded. ${status?.message || ''}`);
    }
  };
  const existing = await getJSON(`${address}/api/health`);
  if (existing) { validate(existing); await validateAI(); console.log(`Reusing Unframe backend at ${address}.`); return { reused: true }; }
  const child = spawnOwned(process.execPath, [path.join(root, 'server', 'index.js')]);
  await waitReady(`${address}/api/health`, child, validate);
  await validateAI();
  return { reused: false, child };
}

export function isUnframeMobileHTML(value) {
  return typeof value === 'string' && /<title>\s*Unframe\s*<\/title>/i.test(value) && /<div\s+id=["']root["']><\/div>/i.test(value);
}

export function mobilePreviewConfiguration(env = process.env) {
  const api = `http://127.0.0.1:${env.PORT || 3000}`;
  return { api, configurationHash: createHash('sha256').update(JSON.stringify([api,
    env.EXPO_PUBLIC_AI_TIMEOUT_MS || null, env.EXPO_PUBLIC_CLIP_TIMEOUT_MS || null,
    env.EXPO_PUBLIC_VISION_TIMEOUT_MS || null])).digest('hex') };
}

export function canReuseMobilePreview(record, expected) {
  if (record?.root !== root || record.api !== expected.api || record.configurationHash !== expected.configurationHash || !Number.isInteger(record.pid) || record.pid <= 0) return false;
  try { process.kill(record.pid, 0); return true; } catch { return false; }
}

export async function startMobileWeb() {
  const expected = mobilePreviewConfiguration();
  const recordFile = path.join(root, '.local-ai', 'mobile-preview.json');
  const occupied = await new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 8081 });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Cannot check Expo port 8081.')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
  });
  if (occupied) {
    let unframe = false;
    try {
      const response = await fetch('http://127.0.0.1:8081/', { redirect: 'error', signal: AbortSignal.timeout(5000) });
      const html = await response.text();
      unframe = response.ok && isUnframeMobileHTML(html);
    } catch { /* A listener that is not a readable Unframe preview must not be reused. */ }
    if (unframe) {
      let record;
      try { record = JSON.parse(await readFile(recordFile, 'utf8')); } catch { /* Older/unmanaged Expo sessions have no verified configuration. */ }
      if (!canReuseMobilePreview(record, expected)) throw new Error(`The Unframe preview on port 8081 has older or unverified backend settings. Stop its Expo terminal, then rerun npm.cmd start to connect it to ${expected.api}.`);
      console.log(`Reusing Unframe mobile web at http://localhost:8081 with backend ${expected.api}.`);
      return { reused: true };
    }
    throw new Error('Port 8081 is already in use by another application. Stop that application or its terminal, then rerun npm.cmd start. The existing process was left untouched.');
  }
  const cli = path.join(root, 'mobile', 'node_modules', 'expo', 'bin', 'cli');
  if (!existsSync(cli)) throw new Error('Mobile dependencies are missing. Run npm.cmd --prefix mobile ci.');
  const api = expected.api;
  console.log(`Starting mobile web on http://localhost:8081 with backend ${api}.`);
  console.log(`Planning chat/routes: no automatic timeout; cancel in the app. Other AI features retain their configured deadlines. Restart backend and Expo after changing .env.`);
  const child = spawnOwned(process.execPath, [cli, 'start', '--web', '--port', '8081', '--offline', '--clear'], {
    cwd: path.join(root, 'mobile'), env: { ...process.env, EXPO_PUBLIC_API_URL: api, EXPO_NO_TELEMETRY: '1' },
  });
  await mkdir(path.dirname(recordFile), { recursive: true });
  await writeFile(recordFile, JSON.stringify({ root, pid: child.pid, ...expected }));
  return child;
}

export async function keepRunning() {
  const running = [...children];
  if (!running.length) { console.log('All services were already running. No existing service will be stopped by this command.'); return; }
  console.log('Ready. Keep this terminal open. Ctrl+C stops only processes started by this command.');
  const result = await Promise.race(running.map(child => child.result));
  if (shutdownPromise) return;
  throw new Error(`A managed service exited (${result.code ?? result.signal ?? result.error?.message}). Other processes started by this command will stop.`);
}
