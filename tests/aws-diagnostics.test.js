import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticMethods, diagnosticStage, errorDiagnostics } from '../server/ai/diagnostics.js';
import { AIError, readAIConfig } from '../server/ai/config.js';
import { createBedrockGenerator } from '../server/ai/bedrock.js';

const requestId = '12345678-1234-4234-8234-123456789012';
test('diagnostics expose only bounded approved codes and AWS request metadata', () => {
  const secret = 'https://private.example/photo?X-Amz-Signature=secret-read-token';
  const error = Object.assign(new Error(secret), { name: 'ValidationException', code: secret,
    $metadata: { requestId, httpStatusCode: 400, extendedRequestId: secret },
    $response: { body: secret, headers: { authorization: secret } }, cause: { secret }, image: secret });
  const data = errorDiagnostics(error, 's3vectors_query');
  assert.deepEqual(data, { stage: 's3vectors_query', service: 'S3Vectors', operation: 'QueryVectors',
    exceptionType: 'ValidationException', errorCode: null, awsErrorCode: 'ValidationException', awsRequestId: requestId, httpStatusCode: 400 });
  assert.ok(!JSON.stringify(data).includes(secret));
  for (const value of [secret, 'a'.repeat(64), 'AKIA' + 'X'.repeat(16), 'x'.repeat(1000)]) {
    const redacted = errorDiagnostics({ name: value, code: value, $metadata: { requestId: value, httpStatusCode: value } }, value);
    assert.equal(redacted.exceptionType, 'UnknownError'); assert.equal(redacted.errorCode, null);
    assert.equal(redacted.awsErrorCode, null); assert.equal(redacted.awsRequestId, null); assert.equal(redacted.stage, 'unknown');
    assert.ok(!JSON.stringify(redacted).includes(value));
  }
});

test('nested stages preserve the original exception and the deepest service boundary', async () => {
  const error = Object.assign(new Error('hidden'), { name: 'AccessDeniedException', $metadata: { requestId, httpStatusCode: 403 } });
  const original = { marker: 7, async search(vector) { assert.equal(this.marker, 7); assert.deepEqual(vector, [1]); throw error; } };
  const store = diagnosticMethods(original, { search: 's3vectors_query' });
  await assert.rejects(diagnosticStage('inference', () => store.search([1])), e => e === error);
  assert.equal(errorDiagnostics(error, 'inference').stage, 's3vectors_query');
  assert.equal(errorDiagnostics(error).awsErrorCode, 'AccessDeniedException');
  assert.equal(errorDiagnostics(error).awsRequestId, requestId);
  assert.equal(error.stage, undefined); // No diagnostic properties added to API-visible errors.
  const clip = new AIError(504, 'OPENCLIP_TIMEOUT', 'hidden');
  await assert.rejects(diagnosticStage('openclip_embed', () => { throw clip; }), e => e === clip);
  assert.equal(errorDiagnostics(clip).errorCode, 'OPENCLIP_TIMEOUT');
});

test('Bedrock sanitization retains safe SDK diagnostics without exposing response or cause', async () => {
  const error = Object.assign(new Error('private prompt, image and credentials'), { name: 'AccessDeniedException', $metadata: { requestId, httpStatusCode: 403 } });
  const generate = createBedrockGenerator(readAIConfig({ AI_PROVIDER: 'bedrock' }), { client: { send: async () => { throw error; } } });
  await assert.rejects(generate({ model: 'mock', instruction: '', context: {}, schema: {} }), wrapped => {
    assert.equal(wrapped.code, 'BEDROCK_UNAVAILABLE'); assert.equal(wrapped.cause, undefined);
    const details = errorDiagnostics(wrapped);
    assert.equal(details.stage, 'bedrock_converse'); assert.equal(details.awsErrorCode, 'AccessDeniedException');
    assert.equal(details.awsRequestId, requestId); assert.equal(details.errorCode, 'BEDROCK_UNAVAILABLE');
    assert.ok(!JSON.stringify(wrapped).includes('private')); assert.ok(!JSON.stringify(details).includes('private'));
    return true;
  });
});

test('Bedrock parse failures preserve request ID and emit only safe response-shape diagnostics', async t => {
  const secret = 'private response, prompt and read token';
  const logs = [];
  t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const response = { stopReason: 'end_turn', $metadata: { requestId, httpStatusCode: 200, extendedRequestId: secret },
    output: { message: { role: 'assistant', content: [{ text: '```json\n{"broken": "' + secret + '"\n```' }] } } };
  const generate = createBedrockGenerator(readAIConfig({ AI_PROVIDER: 'bedrock' }), { client: { send: async () => response } });
  await assert.rejects(generate({ model: 'google.gemma-3-12b-it', instruction: secret, context: { secret }, schema: {} }), error => {
    assert.equal(error.code, 'BEDROCK_JSON'); assert.equal(error.$metadata, undefined);
    assert.deepEqual(errorDiagnostics(error), { stage: 'bedrock_response', service: 'Bedrock', operation: 'ParseResponse',
      exceptionType: 'AIError', errorCode: 'BEDROCK_JSON', awsErrorCode: null, awsRequestId: requestId, httpStatusCode: 200 });
    return true;
  });
  assert.equal(logs.length, 1); assert.equal(logs[0].event, 'bedrock_response_rejected');
  assert.equal(logs[0].singleMarkdownFence, true); assert.equal(logs[0].awsRequestId, requestId);
  assert.ok(!JSON.stringify(logs).includes(secret));
});
