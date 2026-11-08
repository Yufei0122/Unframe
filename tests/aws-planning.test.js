import test from 'node:test';
import assert from 'node:assert/strict';
import { readAIConfig } from '../server/ai/config.js';
import { createPlanningHandler } from '../server/cloud/planning.js';

const config = readAIConfig({ AI_PROVIDER: 'bedrock', AI_ALLOWED_ORIGINS: 'https://frontend.example' });
const preferences = { interests: ['Nature'], availableMinutes: 30, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: ['step_free'], mustSeeArtworkIds: ['water-lilies'] };
const envelope = value => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: JSON.stringify(value) }] } } });
const event = (path, body, more = {}) => ({ version: '2.0', rawPath: '/api/ai/' + path, requestContext: { http: { method: 'POST' } }, headers: { 'content-type': 'application/json', origin: 'https://frontend.example' }, body: JSON.stringify(body), ...more });

test('planning Lambda preserves web NDJSON answer/route protocol with one Bedrock call and deterministic routing', async () => {
  let calls = 0;
  const handler = createPlanningHandler({ config, bedrockClient: { send: async command => {
    calls++; assert.equal(command.constructor.name, 'ConverseCommand'); assert.equal(command.input.modelId, 'google.gemma-3-12b-it');
    return envelope({ reply: 'Your nature visit includes Water Lilies.', preferences, recommendedArtworkIds: ['water-lilies'], reasoningSummary: 'Nature.' });
  } } });
  const response = await handler(event('routes/visit', { museumId: 'met', message: 'Plan a nature visit.', preferences, history: [] }));
  assert.equal(response.statusCode, 200); assert.match(response.headers['Content-Type'], /application\/x-ndjson/);
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://frontend.example');
  const [answer, route] = response.body.trim().split('\n').map(JSON.parse);
  assert.equal(answer.type, 'answer'); assert.deepEqual(answer.preferences, preferences);
  assert.equal(route.type, 'route'); assert.equal(route.itinerary.recommendationSource, 'bedrock');
  assert.ok(route.itinerary.route.some(s => s.artworkId === 'water-lilies'));
  assert.ok(route.itinerary.estimatedMinutes <= 30); assert.ok(route.itinerary.navigation.length);
  assert.equal(calls, 1);
});

test('planning Lambda supports REST proxy events, separate plan retry and catalogue confirmation', async () => {
  const outputs = [{ recommendedArtworkIds: ['water-lilies'], reasoningSummary: 'Nature.' },
    { summaryNoteId: 'summary-0', factIds: ['title'], interpretationNoteId: 'interpretation-0', suggestedNextArtwork: null }];
  const handler = createPlanningHandler({ config, bedrockClient: { send: async () => envelope(outputs.shift()) } });
  const plan = await handler({ httpMethod: 'POST', path: '/api/ai/routes/plan', headers: { 'Content-Type': 'application/json' },
    isBase64Encoded: true, body: Buffer.from(JSON.stringify({ museumId: 'met', ...preferences })).toString('base64') });
  assert.equal(plan.statusCode, 200); assert.equal(JSON.parse(plan.body).recommendationSource, 'bedrock');
  const confirmation = await handler(event('artworks/confirm', { museumId: 'met', artworkId: 'water-lilies', visitorPreferences: [] }));
  assert.equal(confirmation.statusCode, 200); const result = JSON.parse(confirmation.body);
  assert.equal(result.artwork.id, 'water-lilies'); assert.ok(result.aiExplanation.summary.startsWith('Catalogue note: '));
  assert.equal(outputs.length, 0);
});

test('planning Lambda handles real HTTP API v2 named-stage and unprefixed paths', async () => {
  let calls = 0;
  const handler = createPlanningHandler({ config, bedrockClient: { send: async () => {
    calls++;
    return envelope({ recommendedArtworkIds: ['water-lilies'], reasoningSummary: 'Nature.' });
  } } });
  for (const [stage, prefix] of [['prob', '/prob'], ['prob', ''], ['$default', ''], ['api', ''], ['api', '/api']]) {
    const requestContext = { stage, http: { method: 'POST', path: prefix + '/api/ai/routes/plan' } };
    const response = await handler(event('routes/plan', { museumId: 'met', ...preferences }, {
      rawPath: requestContext.http.path, requestContext,
    }));
    assert.equal(response.statusCode, 200, `${stage}: ${requestContext.http.path}`);
    assert.equal(JSON.parse(response.body).recommendationSource, 'bedrock');
  }
  assert.equal(calls, 5);
  const status = await handler({ version: '2.0', rawPath: '/prob/api/ai/planning/status', requestContext: { stage: 'prob', http: { method: 'GET' } } });
  assert.equal(status.statusCode, 200);
  const wrongStage = await handler(event('routes/plan', preferences, { rawPath: '/other/api/ai/routes/plan', requestContext: { stage: 'prob', http: { method: 'POST' } } }));
  assert.equal(wrongStage.statusCode, 404);
  assert.equal(calls, 5);
});

test('planning Lambda rejects invalid transport/input/origin without model calls', async () => {
  const handler = createPlanningHandler({ config, bedrockClient: { send: () => assert.fail('Invalid request must not reach Bedrock') } });
  for (const [request, expected] of [
    [event('routes/visit', {}, { headers: { origin: 'https://other.example' } }), 403],
    [event('routes/visit', {}, { headers: {} }), 415],
    [event('routes/visit', {}, { body: '{' }), 400],
    [event('routes/visit', {}, { body: ' '.repeat(32001) }), 413],
    [event('routes/visit', []), 400],
    [event('routes/visit', { museumId: 'invented' }), 400],
    [event('artworks/recognise', {}), 404],
    [event('routes/visit', { preferences, message: '' }), 400],
  ]) assert.equal((await handler(request)).statusCode, expected);
  const options = await handler(event('routes/visit', {}, { requestContext: { http: { method: 'OPTIONS' } } }));
  assert.equal(options.statusCode, 204);
  assert.throws(() => createPlanningHandler({ config: { ...config, aiProvider: 'ollama' } }));
  assert.throws(() => createPlanningHandler({ config, timeoutMs: 30000 }));
});

test('planning Lambda bounds inference to the remaining invocation time and cancels the provider', async () => {
  let aborted = false;
  const handler = createPlanningHandler({ config, bedrockClient: { send: (_, { abortSignal }) => new Promise((_, reject) => {
    abortSignal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true });
  }) } });
  const response = await handler(event('routes/visit', { message: 'Plan a visit.', preferences }), { getRemainingTimeInMillis: () => 1020 });
  assert.equal(response.statusCode, 504); assert.equal(JSON.parse(response.body).code, 'PLANNING_TIMEOUT'); assert.equal(aborted, true);
});

test('route errors retain the valid answer and provider errors never silently use local recommendations', async () => {
  const handler = createPlanningHandler({ config, bedrockClient: { send: async () => envelope({
    reply: 'You have one minute.', preferences: { ...preferences, availableMinutes: 1 }, recommendedArtworkIds: ['water-lilies'], reasoningSummary: 'Nature.',
  }) } });
  const response = await handler(event('routes/visit', { message: 'I have one minute.', preferences }));
  assert.equal(response.statusCode, 200);
  const events = response.body.trim().split('\n').map(JSON.parse);
  assert.equal(events[0].type, 'answer'); assert.equal(events[1].type, 'route_error'); assert.equal(events[1].code, 'NO_ROUTE');
  const failure = createPlanningHandler({ config, bedrockClient: { send: async () => { throw new Error('private payload'); } } });
  const failed = await failure(event('routes/plan', { ...preferences, requireAI: false }));
  assert.equal(failed.statusCode, 503); assert.equal(JSON.parse(failed.body).code, 'BEDROCK_UNAVAILABLE'); assert.ok(!failed.body.includes('private payload'));
});
