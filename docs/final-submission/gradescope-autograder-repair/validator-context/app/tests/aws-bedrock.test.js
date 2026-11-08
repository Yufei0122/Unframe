import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { readAIConfig } from '../server/ai/config.js';
import { createBedrockGenerator, parseBedrockJSON, createBedrockVision, bedrockResponseShape } from '../server/ai/bedrock.js';
import { createAIProviders } from '../server/ai/providers.js';
import { catalogues } from '../server/ai/catalogues.js';
import { createRouteService } from '../server/ai/routes.js';
import { compactVisionSchema } from '../server/ai/vision.js';

const config = readAIConfig({ AI_PROVIDER: 'bedrock' });
const schema = { type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: { type: 'string', minLength: 1 } } };
const response = value => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: JSON.stringify(value) }] } } });

test('sanitized real Gemma response parses through the existing vision implementation without another AWS call', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/bedrock-gemma-vision-sanitized.json', import.meta.url), 'utf8'));
  assert.equal(fixture.provenance.model, 'google.gemma-3-12b-it');
  const envelope = fixture.response;
  assert.throws(() => JSON.parse(envelope.output.message.content[0].text), SyntaxError);
  const parsed = parseBedrockJSON(envelope, compactVisionSchema);
  assert.equal(parsed.subjectType, 'painting');
  let calls = 0;
  const generate = createBedrockGenerator(config, { client: { send: async command => {
    calls++;
    assert.equal(command.input.modelId, fixture.provenance.model);
    return structuredClone(envelope);
  } } });
  const result = await createBedrockVision(config, generate).analyse(await readFile(new URL('../mobile/assets/water-lilies.jpg', import.meta.url)));
  assert.equal(calls, 1);
  assert.equal(result.inferencePerformed, true);
  assert.equal(result.description, parsed.description);
});

test('whole-response fences preserve strict JSON, completion and schema validation', () => {
  const withText = text => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text }] } } });
  for (const text of ['```json\n{"answer":"ok"}\n```', '  ```\r\n{"answer":"ok"}\r\n```  ', '```JSON \n{"answer":"ok"}\n```']) {
    assert.deepEqual(parseBedrockJSON(withText(text), schema), { answer: 'ok' });
    assert.throws(() => parseBedrockJSON({ ...withText(text), stopReason: 'max_tokens' }, schema), { code: 'BEDROCK_INCOMPLETE' });
  }
  for (const text of ['Here is JSON:\n```json\n{"answer":"ok"}\n```', '```json\n{"answer":"ok"}\n```\nExtra prose',
    '```json\n{"answer":"ok"}\n```\n```json\n{"answer":"other"}\n```', '```json\n{"answer":\n```',
    '```json\n{"answer":"ok"}\n', '```javascript\n{"answer":"ok"}\n```', '```json\n{"answer":"ok"}{"answer":"other"}\n```']) {
    assert.throws(() => parseBedrockJSON(withText(text), schema), { code: 'BEDROCK_JSON' });
  }
  assert.throws(() => parseBedrockJSON(withText('```json\n{"answer":"ok","extra":true}\n```'), schema), { code: 'BEDROCK_SCHEMA' });
  assert.throws(() => parseBedrockJSON(withText('```json\n' + ' '.repeat(32000) + '\n```'), schema), { code: 'BEDROCK_RESPONSE' });
  const split = withText('```json\n{"answer":');
  split.output.message.content.push({ text: '"ok"}\n```' });
  assert.deepEqual(parseBedrockJSON(split, schema), { answer: 'ok' });
});

test('response diagnostics classify completion and formatting without exposing generated text', () => {
  // Synthetic safety cases, not a claim about the unavailable historical response.
  const secret = 'private photo description and token';
  const envelope = response({ answer: secret });
  envelope.output.message.content[0].text = '```json\n' + envelope.output.message.content[0].text + '\n```';
  assert.equal(bedrockResponseShape(envelope).singleMarkdownFence, true);
  assert.equal(bedrockResponseShape({ ...envelope, stopReason: 'max_tokens' }).stopReason, 'max_tokens');
  assert.equal(bedrockResponseShape({ stopReason: secret }).stopReason, 'unknown');
  assert.ok(!JSON.stringify(bedrockResponseShape(envelope)).includes(secret));
  assert.throws(() => parseBedrockJSON({ ...envelope, stopReason: 'max_tokens' }, schema), { code: 'BEDROCK_INCOMPLETE' });
  assert.throws(() => parseBedrockJSON(response({ answer: 'ok', unexpected: true }), schema), { code: 'BEDROCK_SCHEMA' });
  const incomplete = response({ answer: 'ok' }); incomplete.output.message.content[0].text = '{"answer":';
  assert.throws(() => parseBedrockJSON(incomplete, schema), { code: 'BEDROCK_JSON' });
});

test('Bedrock parsing accepts documented Converse envelope and validates schema', () => {
  assert.deepEqual(parseBedrockJSON(response({ answer: 'ok' }), schema), { answer: 'ok' });
  for (const value of [null, {}, { ...response({ answer: 'ok' }), stopReason: 'max_tokens' }, response({ answer: 3 }), response({ answer: 'ok', invented: true }),
    { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: '{invalid' }] } } },
    { stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ toolUse: {} }] } } }]) assert.throws(() => parseBedrockJSON(value, schema));
  assert.throws(() => parseBedrockJSON({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [null] } } }, schema), { code: 'BEDROCK_RESPONSE' });
});

test('Bedrock generator sends Converse fields, never Ollama payload, and sanitizes SDK failures', async () => {
  let command;
  const generate = createBedrockGenerator(config, { client: { send: async cmd => { command = cmd; return response({ answer: 'ok' }); } } });
  await generate({ model: config.bedrockModel, instruction: 'Answer.', context: { evidence: 1 }, schema });
  assert.equal(command.constructor.name, 'ConverseCommand');
  assert.equal(command.input.modelId, 'google.gemma-3-12b-it');
  assert.equal(command.input.inferenceConfig.temperature, 0);
  for (const key of ['format', 'think', 'options', 'keep_alive', 'stream']) assert.equal(command.input[key], undefined);
  assert.ok(command.input.system[0].text.includes('JSON schema'));
  const failure = createBedrockGenerator(config, { client: { send: async () => { throw new Error('sensitive provider payload'); } } });
  await assert.rejects(failure({ model: 'x', schema, context: {}, instruction: '' }), error => error.code === 'BEDROCK_UNAVAILABLE' && !error.message.includes('sensitive'));
});

test('Bedrock text provider preserves catalogue grounding and deterministic route service contract', async () => {
  const { collection, graph } = catalogues.get('met');
  const outputs = [
    { summaryNoteId: 'summary-0', factIds: ['title'], interpretationNoteId: 'interpretation-0', suggestedNextArtwork: null },
    { recommendedArtworkIds: [collection[0].id], reasoningSummary: 'Nature.' },
  ];
  const providers = createAIProviders(config, { bedrockClient: { send: async () => response(outputs.shift()) } });
  const explanation = await providers.text.generateArtworkExplanation(collection[0], [], collection);
  assert.ok(explanation.summary.startsWith('Catalogue note: '));
  assert.equal(explanation.interestingFacts[0], `Title: ${collection[0].title}`);
  const itinerary = await createRouteService({ ollama: providers.text, collection, graph }).plan({ availableMinutes: 30, requireAI: true });
  assert.ok(itinerary.route.length); assert.ok(itinerary.estimatedMinutes <= 30);
  assert.equal(itinerary.recommendationSource, 'bedrock');
  assert.equal(outputs.length, 0);
});

test('Bedrock vision uses bounded image bytes and the existing uncertain identity validation', async () => {
  const image = await sharp({ create: { width: 800, height: 900, channels: 3, noise: { type: 'gaussian', mean: 120, sigma: 30 } } }).jpeg().toBuffer();
  let input;
  const generate = createBedrockGenerator(config, { client: { send: async cmd => { input = cmd.input; return response({ subjectType: 'architecture', description: 'A building.', visualFeatures: [], visibleText: [], hypotheses: [] }); } } });
  const result = await createBedrockVision(config, generate).analyse(image);
  assert.equal(result.artworkPresence, 'unlikely'); assert.deepEqual(result.hypotheses, []);
  const block = input.messages[0].content[1].image;
  assert.equal(block.format, 'jpeg'); assert.ok(Buffer.isBuffer(block.source.bytes));
  const size = await sharp(block.source.bytes).metadata(); assert.ok(Math.max(size.width, size.height) <= 512);
  const blank = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).jpeg().toBuffer();
  const noInference = createBedrockVision(config, () => assert.fail('Blank image must abstain'));
  assert.equal((await noInference.analyse(blank)).inferencePerformed, false);
});
