import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compactVisionSchema } from '../server/ai/vision.js';
import { readAIConfig } from '../server/ai/config.js';
import { parseBedrockJSON, bedrockSchemaDiagnostics, createBedrockGenerator, createBedrockVision } from '../server/ai/bedrock.js';
import { schemaIssueDiagnostics } from '../server/ai/schema-diagnostics.js';

// Synthetic counterexamples to the actual contract. The failed live object's
// contents were not retained; none of these is claimed to be that response.
const valid = () => ({ subjectType: 'architecture', description: 'A building with columns.', visualFeatures: ['Columns'], visibleText: [], hypotheses: [] });
const envelope = value => ({ stopReason: 'end_turn', output: { message: { role: 'assistant', content: [{ text: '```json\n' + JSON.stringify(value) + '\n```' }] } } });
function rejected(value) {
  const original = structuredClone(value);
  let failure;
  assert.throws(() => parseBedrockJSON(envelope(value), compactVisionSchema), error => { failure = error; return error.code === 'BEDROCK_SCHEMA'; });
  assert.deepEqual(value, original, 'Invalid values must not be coerced, dropped, truncated or defaulted');
  assert.equal(failure.schemaIssues, undefined, 'Internal diagnostics must not leak through API errors');
  return bedrockSchemaDiagnostics(failure);
}

test('schema diagnostics distinguish missing properties, wrong types, nesting and enum errors', () => {
  const missing = valid(); delete missing.description;
  assert.deepEqual(rejected(missing), [{ path: '/description', expected: 'required property', actualType: 'missing', category: 'required' }]);
  for (const [value, type] of [[null, 'null'], ['Columns', 'string'], [{ text: 'Columns' }, 'object'], [3, 'number']]) {
    assert.deepEqual(rejected({ ...valid(), visualFeatures: value }), [{ path: '/visualFeatures', expected: 'array', actualType: type, category: 'type' }]);
  }
  assert.deepEqual(rejected({ ...valid(), subjectType: 'building' }), [{ path: '/subjectType', expected: 'allowed enum value', actualType: 'string', category: 'enum' }]);
  assert.equal(rejected({ result: valid() })[0].category, 'required');
  assert.equal(rejected([valid()])[0].actualType, 'array');
});

test('schema diagnostics identify length, array-count, pattern and nested nullable-artist failures', () => {
  assert.deepEqual(rejected({ ...valid(), description: 'x'.repeat(201) }), [{ path: '/description', expected: 'maxLength: 200', actualType: 'string', category: 'maxLength' }]);
  assert.deepEqual(rejected({ ...valid(), description: '' }), [{ path: '/description', expected: 'minLength: 1', actualType: 'string', category: 'minLength' }]);
  assert.equal(rejected({ ...valid(), description: 'A building.\nColumns.' })[0].category, 'pattern');
  assert.deepEqual(rejected({ ...valid(), visualFeatures: ['A', 'B', 'C'] }), [{ path: '/visualFeatures', expected: 'maxItems: 2', actualType: 'array', category: 'maxItems' }]);
  assert.deepEqual(rejected({ ...valid(), visualFeatures: ['x'.repeat(61)] }), [{ path: '/visualFeatures/0', expected: 'maxLength: 60', actualType: 'string', category: 'maxLength' }]);
  const badArtist = { ...valid(), subjectType: 'painting', hypotheses: [{ title: 'A title', artist: 123, basis: 'Visible paint.' }] };
  const issues = rejected(badArtist);
  assert.ok(issues.some(i => i.path === '/hypotheses/0/artist' && i.category === 'anyOf' && i.actualType === 'number'));
  const missingBasis = { ...valid(), subjectType: 'painting', hypotheses: [{ title: 'A title', artist: null }] };
  assert.equal(rejected(missingBasis)[0].path, '/hypotheses/0/basis');
});

test('diagnostics redact unknown field names, values, patterns and enum contents', () => {
  const secret = 'private-name@example.test/read-token?image=private';
  const issues = rejected({ ...valid(), [secret]: { [secret]: secret } });
  assert.deepEqual(issues, [{ path: '/[additional-property]', expected: 'no additional properties', actualType: 'object', category: 'additionalProperties' }]);
  const syntheticAjvErrors = [
    { keyword: 'type', instancePath: '/' + secret.replaceAll('~', '~0').replaceAll('/', '~1'), params: { type: 'string' }, message: secret },
    { keyword: 'enum', instancePath: '/subjectType', params: { allowedValues: [secret] }, message: secret },
    { keyword: 'pattern', instancePath: '/description', params: { pattern: secret }, message: secret },
    { keyword: secret, instancePath: '', params: { secret }, message: secret },
  ];
  const safe = schemaIssueDiagnostics(syntheticAjvErrors, compactVisionSchema, { ...valid(), [secret]: secret });
  assert.equal(safe[0].path, '/[redacted]');
  assert.ok(!JSON.stringify(safe).includes(secret));
  for (const issue of [...safe, ...issues]) assert.deepEqual(Object.keys(issue), ['path', 'expected', 'actualType', 'category']);
  assert.equal(schemaIssueDiagnostics(Array(50).fill(syntheticAjvErrors[0]), compactVisionSchema, valid()).length, 5);
});

test('schema rejection logs only bounded issue metadata alongside safe AWS correlation', async t => {
  const logs = [];
  t.mock.method(console, 'warn', line => logs.push(JSON.parse(line)));
  const secret = 'private response text and read token';
  const response = envelope({ ...valid(), visualFeatures: secret });
  response.$metadata = { requestId: '12345678-1234-4234-8234-123456789012', httpStatusCode: 200 };
  const generate = createBedrockGenerator(readAIConfig({ AI_PROVIDER: 'bedrock' }), { client: { send: async () => response } });
  await assert.rejects(generate({ model: 'google.gemma-3-12b-it', instruction: secret, context: { secret }, schema: compactVisionSchema }), { code: 'BEDROCK_SCHEMA' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].awsRequestId, response.$metadata.requestId);
  assert.deepEqual(logs[0].schemaIssues, [{ path: '/visualFeatures', expected: 'array', actualType: 'string', category: 'type' }]);
  assert.ok(!JSON.stringify(logs).includes(secret));
});

test('the actual sanitized valid Gemma fixture still passes; errors do not carry stale diagnostics', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/bedrock-gemma-vision-sanitized.json', import.meta.url), 'utf8'));
  rejected({ ...valid(), subjectType: 'invalid' });
  assert.equal(parseBedrockJSON(fixture.response, compactVisionSchema).subjectType, 'painting');
  const broken = envelope(valid()); broken.output.message.content[0].text = '{invalid';
  assert.throws(() => parseBedrockJSON(broken, compactVisionSchema), error => {
    assert.equal(error.code, 'BEDROCK_JSON'); assert.deepEqual(bedrockSchemaDiagnostics(error), []); return true;
  });
});

test('valid empty arrays, null artist and maximum contract boundaries remain accepted', () => {
  assert.deepEqual(parseBedrockJSON(envelope(valid()), compactVisionSchema), valid());
  const boundary = { subjectType: 'painting', description: 'x'.repeat(200), visualFeatures: ['x'.repeat(60), 'y'],
    visibleText: ['x'.repeat(100), 'y'], hypotheses: [{ title: 'x'.repeat(120), artist: null, basis: 'x'.repeat(100) }] };
  assert.deepEqual(parseBedrockJSON(envelope(boundary), compactVisionSchema), boundary);
  boundary.hypotheses[0].artist = 'x'.repeat(100);
  assert.deepEqual(parseBedrockJSON(envelope(boundary), compactVisionSchema), boundary);
});

test('Bedrock vision prompt states the existing contract without adding calls or changing inference settings', async () => {
  const config = readAIConfig({ AI_PROVIDER: 'bedrock' });
  let calls = 0, sent;
  const generate = createBedrockGenerator(config, { client: { send: async command => { calls++; sent = command.input; return envelope(valid()); } } });
  const image = await readFile(new URL('../mobile/assets/met-exterior.jpg', import.meta.url));
  const result = await createBedrockVision(config, generate).analyse(image);
  assert.equal(calls, 1); assert.equal(result.inferencePerformed, true); assert.equal(result.artworkPresence, 'unlikely');
  assert.equal(sent.modelId, 'google.gemma-3-12b-it');
  assert.deepEqual(sent.inferenceConfig, { temperature: 0, maxTokens: config.visionNumPredict });
  const instruction = sent.system[0].text;
  for (const field of Object.keys(compactVisionSchema.properties)) assert.ok(instruction.includes(field));
  for (const contract of ['no wrapper or extra fields', '1–200 characters', '0–2 strings', '1–60 characters', '1–100 characters', '1–120 characters', 'JSON null', 'single-line']) assert.ok(instruction.includes(contract));
});
