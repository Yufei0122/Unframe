import { catalogues } from './catalogues.js';
import { readAIConfig, AIError, logFailure } from './config.js';
import { createLocalClient } from './local-http.js';
import { createEmbeddingService, createEmbeddingStore } from './embeddings.js';
import { createOllamaService } from './ollama.js';
import { createRecognitionService } from './recognition.js';
import { createRouteService } from './routes.js';
import { createPlanningChatService } from './chat.js';
import { readImageUpload, readLimited } from './images.js';
import { getAIStatus } from './status.js';
import { createVisionService } from './vision.js';
import { createArtworkAnalysis } from './artwork-analysis.js';
import { getPlanningStatus } from './planning-status.js';

export function createAIHandler({ config = readAIConfig(), clip = createLocalClient(config, 'OPENCLIP'), ollamaClient = createLocalClient(config, 'OLLAMA'), store = createEmbeddingStore(config), analysis } = {}) {
  const gate = { active: false };
  const ollama = createOllamaService(config, ollamaClient, gate);
  const artworkAnalysis = analysis || createArtworkAnalysis(config, { vision: createVisionService(config, { gate }), embeddings: createEmbeddingService(config, clip), store });
  const services = new Map([...catalogues].map(([id, { collection, graph, museum }]) => [id, {
    recognition: createRecognitionService({ config, embeddings: createEmbeddingService(config, clip), store, ollama, collection }),
    routes: createRouteService({ ollama, collection, graph }),
    chat: createPlanningChatService({ ollama, collection, graph, museum }),
  }]));
  const selectMuseum = (id = 'met') => {
    if (typeof id !== 'string' || !services.has(id)) throw new AIError(400, 'INVALID_MUSEUM', `Choose a supported museum: ${[...catalogues.keys()].join(', ')}.`);
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
    if (req.method === 'GET' && pathname === '/api/ai/planning/status') return send(res, 200, await getPlanningStatus({ config, client: ollamaClient }));
    if (req.method === 'GET' && pathname === '/api/ai/catalogue') {
      const catalogue = catalogues.get(url.searchParams.get('museumId') ?? 'met');
      return catalogue ? send(res, 200, { museum: catalogue.museum, artworks: catalogue.collection, graph: catalogue.graph }) : send(res, 400, { error: `Choose a supported museum: ${[...catalogues.keys()].join(', ')}.`, code: 'INVALID_MUSEUM' });
    }
    if (req.method === 'GET' && pathname === '/api/ai/status') {
      const museumId = url.searchParams.get('museumId') ?? 'met';
      const catalogue = catalogues.get(museumId);
      if (!catalogue) return send(res, 400, { error: `Choose a supported museum: ${[...catalogues.keys()].join(', ')}.`, code: 'INVALID_MUSEUM' });
      return send(res, 200, await getAIStatus({ config, store, collection: catalogue.collection, museumId, clip, ollamaClient }));
    }
    if (req.method !== 'POST' || !['/api/ai/artworks/recognise', '/api/ai/artworks/analyse', '/api/ai/artworks/confirm', '/api/ai/routes/plan', '/api/ai/routes/chat', '/api/ai/routes/visit'].includes(pathname)) return send(res, 404, { error: 'AI endpoint not found.' });
    if (active >= 2) return send(res, 429, { error: 'AI is busy. Please try again shortly.' });
    active++;
    const cancellation = new AbortController();
    const disconnect = () => cancellation.abort();
    res.once('close', disconnect);
    try {
      if (pathname === '/api/ai/artworks/analyse') {
        const { image } = await readImageUpload(req);
        const result = await artworkAnalysis.analyse(image, cancellation.signal);
        if (!res.destroyed) return send(res, 200, result);
        return;
      }
      if (pathname === '/api/ai/artworks/recognise') {
        const { recognition } = selectMuseum(url.searchParams.get('museumId') ?? undefined);
        const { image } = await readImageUpload(req);
        const result = await recognition.recognise(image, cancellation.signal);
        if (!res.destroyed) return send(res, 200, result);
        return;
      }
      if (!req.headers['content-type']?.includes('application/json')) throw new AIError(415, 'JSON_REQUIRED', 'Send application/json.');
      let input;
      const bytes = await readLimited(req, ['/api/ai/routes/chat', '/api/ai/routes/visit'].includes(pathname) ? 32000 : 16000);
      try { input = JSON.parse(bytes.toString('utf8')); } catch { throw new AIError(400, 'INVALID_JSON', 'Invalid JSON request.'); }
      const service = selectMuseum(input?.museumId);
      if (pathname === '/api/ai/artworks/confirm') {
        const result = await service.recognition.confirm(input, cancellation.signal);
        if (!res.destroyed) return send(res, 200, result);
        return;
      }
      if (pathname === '/api/ai/routes/visit') {
        // One validated model result supplies BOTH the latest preferences and recommendations.
        // Send the answer before graph work so the client can reveal it while routing completes.
        const { recommendations, ...answer } = await service.chat.visit(input, cancellation.signal);
        if (res.destroyed) return;
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
        res.write(JSON.stringify({ type: 'answer', ...answer }) + '\n');
        await new Promise(resolve => setImmediate(resolve));
        try {
          const itinerary = await service.routes.plan({ ...answer.preferences, requireAI: true }, cancellation.signal, recommendations);
          if (!res.destroyed) res.write(JSON.stringify({ type: 'route', itinerary }) + '\n');
        } catch (error) {
          logFailure('visit_route', error);
          if (!res.destroyed) res.write(JSON.stringify({ type: 'route_error', error: error instanceof AIError ? error.message : 'Your route could not be calculated. Please retry.', code: error instanceof AIError ? error.code : 'ROUTE_FAILED' }) + '\n');
        }
        if (!res.destroyed) res.end();
        return;
      }
      const result = await (pathname === '/api/ai/routes/chat' ? service.chat.reply(input, cancellation.signal) : service.routes.plan(input, cancellation.signal));
      if (!res.destroyed) return send(res, 200, result);
    } catch (error) {
      logFailure('request', error);
      if (!res.destroyed) return send(res, error instanceof AIError ? error.status : 500, { error: error instanceof AIError ? error.message : 'AI request could not be completed. Please try again.', code: error instanceof AIError ? error.code : 'INTERNAL_ERROR',
        ...(error instanceof AIError && error.code === 'OLLAMA_INCOMPLETE' && error.details ? { details: error.details } : {}) });
    } finally { res.removeListener('close', disconnect); active--; }
  };
}
