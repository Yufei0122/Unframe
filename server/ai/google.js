import { GoogleAuth } from 'google-auth-library';
import { AIError } from './config.js';
export function createGoogleClient(config, { auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }), fetchImpl = fetch } = {}) {
  return {
    async post(model, location, method, payload) {
      if (!config.project) throw new AIError(503, 'AI_NOT_CONFIGURED', 'Google AI is not configured. Set the server project and Application Default Credentials.');
      if (![config.project, location, model].every(s => /^[a-zA-Z0-9@._-]+$/.test(s))) throw new AIError(503, 'AI_CONFIG_INVALID', 'Check the server Google AI configuration.');
      const controller = new AbortController(); let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AIError(504, 'GOOGLE_TIMEOUT', 'Google AI timed out. Please try again.')); }, config.timeoutMs); });
      const request = async () => {
        let token;
        try { token = await auth.getAccessToken(); } catch { throw new AIError(503, 'GOOGLE_AUTH', 'Google authentication is unavailable. Check server credentials.'); }
        if (!token) throw new AIError(503, 'GOOGLE_AUTH', 'Google authentication is unavailable.');
        const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
        let response;
        try {
          response = await fetchImpl(`https://${host}/v1/projects/${config.project}/locations/${location}/publishers/google/models/${model}:${method}`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
          });
        } catch { throw new AIError(503, 'GOOGLE_NETWORK', 'Google AI is temporarily unavailable.'); }
        if (!response.ok) throw new AIError(503, `GOOGLE_HTTP_${response.status}`, 'Google AI request failed. Check server model access, region, billing and quota.');
        try { return await response.json(); } catch { throw new AIError(502, 'GOOGLE_RESPONSE', 'Google returned an invalid response.'); }
      };
      try { return await Promise.race([request(), timeout]); } finally { clearTimeout(timer); }
    },
  };
}
