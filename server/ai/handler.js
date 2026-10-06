import { catalogues } from './catalogues.js';
import { readAIConfig, AIError, logFailure } from './config.js';
import { createGoogleClient } from './google.js';
import { createEmbeddingService, createEmbeddingStore } from './embeddings.js';
import { createGeminiService } from './gemini.js';
import { createRecognitionService } from './recognition.js';
import { createRouteService } from './routes.js';
import { createPlanningChatService } from './chat.js';
import { readImageUpload, readLimited } from './images.js';

export function createAIHandler({ config = readAIConfig(), google = createGoogleClient(config), store = createEmbeddingStore(config) } = {}) {
  const gemini = createGeminiService(config, google);
  const services = new Map([...catalogues].map(([id, { collection, graph, museum }]) => [id, {
    recognition: createRecognitionService({ config, embeddings: createEmbeddingService(config, google), store, gemini, collection }),
    routes: createRouteService({ gemini, collection, graph }),
    chat: createPlanningChatService({ gemini, collection, graph, museum }),
  }]));
  const selectMuseum = (id = 'met') => {
    if (typeof id !== 'string' || !services.has(id)) throw new AIError(400, 'INVALID_MUSEUM', 'Choose a supported museum: met or goma.');
    return services.get(id);
  };
  let active = 0;
  const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const origin = req.headers.origin;
    const sameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
    if (origin && !sameOrigin && !config.allowedOrigins.includes(origin)) return send(res, 403, { error: 'This web origin is not allowed.' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && pathname === '/api/ai/catalogue') {
      const catalogue = catalogues.get(url.searchParams.get('museumId') ?? 'met');
      return catalogue ? send(res, 200, { museum: catalogue.museum, artworks: catalogue.collection, graph: catalogue.graph }) : send(res, 400, { error: 'Choose a supported museum: met or goma.', code: 'INVALID_MUSEUM' });
    }
    if (req.method !== 'POST' || !['/api/ai/artworks/recognise', '/api/ai/routes/plan', '/api/ai/routes/chat'].includes(pathname)) return send(res, 404, { error: 'AI endpoint not found.' });
    if (active >= 2) return send(res, 429, { error: 'AI is busy. Please try again shortly.' });
    active++;
    try {
      if (pathname === '/api/ai/artworks/recognise') {
        const { recognition } = selectMuseum(url.searchParams.get('museumId') ?? undefined);
        const { image, preferences } = await readImageUpload(req);
        return send(res, 200, await recognition.recognise(image, preferences));
      }
      if (!req.headers['content-type']?.includes('application/json')) throw new AIError(415, 'JSON_REQUIRED', 'Send application/json.');
      let input;
      const bytes = await readLimited(req, pathname === '/api/ai/routes/chat' ? 32000 : 16000);
      try { input = JSON.parse(bytes.toString('utf8')); } catch { throw new AIError(400, 'INVALID_JSON', 'Invalid JSON request.'); }
      const service = selectMuseum(input?.museumId);
      return send(res, 200, await (pathname === '/api/ai/routes/chat' ? service.chat.reply(input) : service.routes.plan(input)));
    } catch (error) {
      logFailure('request', error);
      return send(res, error instanceof AIError ? error.status : 500, { error: error instanceof AIError ? error.message : 'AI request could not be completed. Please try again.', code: error instanceof AIError ? error.code : 'INTERNAL_ERROR' });
    } finally { active--; }
  };
}
