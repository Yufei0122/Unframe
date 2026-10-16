import { AIError } from './config.js';

// Requests stay on loopback; do not forward photographs/prompts through redirects.
export function createLocalClient(config, service, { fetchImpl = fetch } = {}) {
  const clip = service === 'OPENCLIP';
  const base = clip ? config.clipUrl : config.ollamaUrl;
  const timeoutMs = clip ? config.clipTimeoutMs : config.timeoutMs;
  return {
    async request(endpoint, payload, timeoutOverride, signal) {
      const controller = new AbortController();
      const combinedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AIError(504, `${service}_TIMEOUT`, `${clip ? 'OpenCLIP' : 'Ollama Qwen'} timed out. Check the local service or increase ${clip ? 'OPENCLIP' : 'OLLAMA'}_TIMEOUT_MS for CPU inference.`));
        }, timeoutOverride ?? timeoutMs);
      });
      const request = async () => {
        let response;
        try {
          response = await fetchImpl(`${base}${endpoint}`, { method: payload === undefined ? 'GET' : 'POST', redirect: 'error', headers: payload === undefined ? {} : { 'Content-Type': 'application/json' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: combinedSignal });
        } catch {
          if (signal?.aborted) throw new AIError(499, 'REQUEST_CANCELLED', 'The request was cancelled.');
          throw new AIError(503, `${service}_UNAVAILABLE`, `${clip ? 'OpenCLIP' : 'Ollama'} is unavailable. Run npm.cmd run ai:up and npm.cmd run ai:doctor.`);
        }
        if (!response.ok) {
          if (!clip && response.status === 404) throw new AIError(503, 'OLLAMA_MODEL_MISSING', `The local Ollama model ${config.ollamaModel} is unavailable. Run npm.cmd run ai:setup.`);
          throw new AIError(503, `${service}_HTTP_${response.status}`, `${clip ? 'OpenCLIP' : 'Ollama'} returned HTTP ${response.status}. Check local service logs and available memory.`);
        }
        try { return await response.json(); }
        catch {
          if (signal?.aborted) throw new AIError(499, 'REQUEST_CANCELLED', 'The request was cancelled.');
          throw new AIError(502, `${service}_RESPONSE`, 'The local model service returned an invalid response.');
        }
      };
      try { return await Promise.race([request(), timeout]); }
      finally { clearTimeout(timer); }
    },
  };
}
