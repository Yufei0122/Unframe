import { readAIConfig, AIError } from '../ai/config.js';
import { catalogues } from '../ai/catalogues.js';
import { createAIProviders } from '../ai/providers.js';
import { createPlanningChatService } from '../ai/chat.js';
import { createRouteService } from '../ai/routes.js';
import { createRecognitionService } from '../ai/recognition.js';

// Buffered NDJSON preserves the existing web planner protocol without requiring
// a streaming API Gateway integration. Keep inference inside HTTP API's 30s limit.
export function createPlanningHandler({ config, bedrockClient, timeoutMs = 25000 } = {}) {
  if (config?.aiProvider !== 'bedrock') throw new Error('Planning Lambda requires AI_PROVIDER=bedrock');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 27000) throw new Error('PLANNING_API_TIMEOUT_MS must be 1000..27000');
  const { text } = createAIProviders(config, { bedrockClient });
  const services = new Map([...catalogues].map(([id, { collection, graph, museum }]) => [id, {
    chat: createPlanningChatService({ ollama: text, collection, graph, museum }),
    routes: createRouteService({ ollama: text, collection, graph }),
    confirmation: createRecognitionService({ config, ollama: text, collection, museumId: id }),
  }]));
  return async (event, context = {}) => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = headers.origin;
    const cors = origin && config.allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const respond = (statusCode, data, ndjson = false) => ({ statusCode,
      headers: { 'Content-Type': ndjson ? 'application/x-ndjson; charset=utf-8' : 'application/json', 'Cache-Control': 'no-store', ...cors },
      body: ndjson ? data.map(item => JSON.stringify(item)).join('\n') + '\n' : JSON.stringify(data) });
    if (origin && !config.allowedOrigins.includes(origin)) return respond(403, { error: 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' });
    const method = event.requestContext?.http?.method || event.httpMethod;
    let path = event.rawPath || event.path;
    const stage = event.requestContext?.stage;
    // Match the Jobs adapter: HTTP API v2 may retain the named stage prefix.
    // Preserve unprefixed application paths, including a stage named "api".
    if (event.version === '2.0' && stage && stage !== '$default'
      && path?.startsWith(`/${stage}/`) && !path.startsWith('/api/ai/')) {
      path = path.slice(stage.length + 1);
    }
    if (method === 'OPTIONS') return { statusCode: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };
    if (method === 'GET' && path === '/api/ai/planning/status') return respond(200, {
      configured: true, liveVerified: false, provider: 'bedrock', model: config.bedrockPlanningModel, transport: 'buffered-ndjson',
    });
    if (method !== 'POST' || !['/api/ai/routes/visit', '/api/ai/routes/plan', '/api/ai/routes/chat', '/api/ai/artworks/confirm'].includes(path)) {
      return respond(404, { error: 'Endpoint not found', code: 'NOT_FOUND' });
    }
    const cancellation = new AbortController();
    let timer;
    try {
      if (!headers['content-type']?.includes('application/json')) throw new AIError(415, 'JSON_REQUIRED', 'Send application/json.');
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
      if (Buffer.byteLength(raw) > 32000) throw new AIError(413, 'REQUEST_TOO_LARGE', 'Planning request is too large.');
      let input;
      try { input = JSON.parse(raw); } catch { throw new AIError(400, 'INVALID_JSON', 'Invalid JSON.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AIError(400, 'INVALID_INPUT', 'Send a planning request.');
      const service = services.get(input.museumId ?? 'met');
      if (!service) throw new AIError(400, 'INVALID_MUSEUM', 'Choose a supported museum.');
      const budget = Math.min(timeoutMs, Math.max(1, (context.getRemainingTimeInMillis?.() ?? timeoutMs + 1000) - 1000));
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { const error = new AIError(504, 'PLANNING_TIMEOUT', 'Planning took too long. Please retry with a shorter request.'); reject(error); cancellation.abort(error); }, budget);
      });
      const perform = async () => {
        const signal = cancellation.signal;
        if (path.endsWith('/confirm')) return respond(200, await service.confirmation.confirm(input, signal));
        if (path.endsWith('/plan')) return respond(200, await service.routes.plan({ ...input, requireAI: true }, signal));
        if (path.endsWith('/chat')) return respond(200, await service.chat.reply(input, signal));
        const { recommendations, ...answer } = await service.chat.visit(input, signal);
        const events = [{ type: 'answer', ...answer }];
        try {
          events.push({ type: 'route', itinerary: await service.routes.plan({ ...answer.preferences, requireAI: true }, signal, recommendations) });
        } catch (error) {
          events.push({ type: 'route_error', error: error instanceof AIError ? error.message : 'Your route could not be calculated. Please retry.', code: error instanceof AIError ? error.code : 'ROUTE_FAILED' });
        }
        return respond(200, events, true);
      };
      return await Promise.race([perform(), timeout]);
    } catch (error) {
      console.warn(JSON.stringify({ event: 'planning_api_failure', requestId: context.awsRequestId || null, code: error instanceof AIError ? error.code : 'INTERNAL_ERROR' }));
      return respond(error instanceof AIError ? error.status : 500, { error: error instanceof AIError ? error.message : 'Planning request failed.', code: error instanceof AIError ? error.code : 'INTERNAL_ERROR' });
    } finally { clearTimeout(timer); }
  };
}

let handler;
export async function planningHandler(event, context) {
  handler ||= createPlanningHandler({ config: readAIConfig(), timeoutMs: Number(process.env.PLANNING_API_TIMEOUT_MS || 25000) });
  return handler(event, context);
}
