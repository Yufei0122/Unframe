// Opt-in, one direct Converse diagnostic using a public reference image.
// No Jobs/S3/SQS writes, no automatic retries, no raw response or request logging.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { readAIConfig } from '../server/ai/config.js';
import { createBedrockGenerator, createBedrockVision, parseBedrockJSON } from '../server/ai/bedrock.js';
import { compactVisionSchema } from '../server/ai/vision.js';
const exec = promisify(execFile);
const dir = 'verification/2026-10-31/bedrock-followup';
if (!process.argv.includes('--execute')) { console.log('Not executed. --execute permits exactly one direct Bedrock call with the public reference image.'); process.exit(0); }
const cli = async args => {
  try { return JSON.parse((await exec('aws', [...args, '--profile', 'default', '--region', 'ap-southeast-2', '--output', 'json', '--no-cli-pager'],
    { windowsHide: true, maxBuffer: 2 * 1024 * 1024, timeout: 130000, env: { ...process.env, AWS_MAX_ATTEMPTS: '1' } })).stdout); }
  catch { throw new Error('AWS_CALL_FAILED_SEE_AUTH_OR_SERVICE_DIAGNOSTICS'); }
};
// Do not consume the one-call guard on an authentication failure.
const identity = await cli(['sts', 'get-caller-identity']);
if (identity.Account !== '901444280953') throw new Error('Unexpected account');
await mkdir(dir, { recursive: true });
const evidence = { startedAt: new Date().toISOString(), account: identity.Account, region: 'ap-southeast-2',
  model: 'google.gemma-3-12b-it', fixtureImage: 'mobile/assets/water-lilies.jpg', calls: 0, status: 'PENDING' };
await writeFile(`${dir}/direct-probe.json`, JSON.stringify(evidence), { flag: 'wx' });
const temporaryRequest = path.resolve('artifacts/bedrock-probe-public-request.json');
const config = readAIConfig({ AI_PROVIDER: 'bedrock', AWS_REGION: 'ap-southeast-2', BEDROCK_MODEL_ID: evidence.model });
const client = { async send(command) {
  if (++evidence.calls !== 1) throw new Error('Only one model invocation permitted');
  const input = structuredClone(command.input);
  for (const message of input.messages) for (const block of message.content) if (block.image) block.image.source.bytes = Buffer.from(block.image.source.bytes).toString('base64');
  await mkdir('artifacts', { recursive: true });
  await writeFile(temporaryRequest, JSON.stringify(input), { flag: 'wx' });
  let response;
  try { response = await cli(['bedrock-runtime', 'converse', '--cli-input-json', `file://${temporaryRequest}`, '--cli-binary-format', 'base64', '--cli-read-timeout', '125']); }
  finally { await unlink(temporaryRequest); }
  const text = response.output?.message?.content?.map(block => block.text || '').join('') || '';
  const fence = text.trim().match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  evidence.stopReason = ['end_turn', 'max_tokens', 'stop_sequence', 'content_filtered'].includes(response.stopReason) ? response.stopReason : 'other';
  evidence.textLength = text.length; evidence.singleMarkdownFence = !!fence;
  evidence.usage = Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens'].filter(k => Number.isSafeInteger(response.usage?.[k])).map(k => [k, response.usage[k]]));
  let value;
  try { value = JSON.parse(text); evidence.rawJSONValid = true; } catch { evidence.rawJSONValid = false; }
  if (fence) { try { value = JSON.parse(fence[1]); evidence.fenceContentJSONValid = true; } catch { evidence.fenceContentJSONValid = false; } }
  if (value) {
    evidence.schemaValid = new Ajv({ strict: false }).validate(compactVisionSchema, value);
    evidence.unexpectedFieldCount = Object.keys(value).filter(k => !Object.hasOwn(compactVisionSchema.properties, k)).length;
    if (evidence.schemaValid) {
      // Preserve actual envelope/wrapper and schema shape; replace all descriptive strings.
      const clean = { subjectType: value.subjectType, description: 'Sanitized public-reference description.',
        visualFeatures: value.visualFeatures.map(() => 'Sanitized feature.'), visibleText: value.visibleText.map(() => 'Sanitized text.'),
        hypotheses: value.hypotheses.map(h => ({ title: 'Sanitized title.', artist: h.artist === null ? null : 'Sanitized artist.', basis: 'Sanitized basis.' })) };
      const cleanJSON = JSON.stringify(clean, null, 2);
      const cleanText = fence ? text.slice(0, text.indexOf(fence[1])) + cleanJSON + text.slice(text.indexOf(fence[1]) + fence[1].length) : cleanJSON;
      await mkdir('tests/fixtures', { recursive: true });
      await writeFile('tests/fixtures/bedrock-gemma-vision-sanitized.json', JSON.stringify({ provenance: { model: evidence.model, capturedAt: evidence.startedAt, source: 'one direct AWS Converse call, public reference image; descriptive strings redacted' },
        response: { stopReason: response.stopReason, output: { message: { role: response.output.message.role, content: [{ text: cleanText }] } } } }, null, 2), { flag: 'wx' });
    }
  }
  try { parseBedrockJSON(response, compactVisionSchema); evidence.parserAccepted = true; }
  catch (error) { evidence.parserAccepted = false; evidence.parserErrorCode = /^BEDROCK_[A-Z_]+$/.test(error.code) ? error.code : 'OTHER'; }
  return response;
} };
try {
  const result = await createBedrockVision(config, createBedrockGenerator(config, { client })).analyse(await readFile(evidence.fixtureImage));
  evidence.status = 'MODEL_RESPONSE_ACCEPTED'; evidence.inferencePerformed = result.inferencePerformed;
} catch (error) { evidence.status = 'MODEL_RESPONSE_REJECTED'; evidence.errorCode = /^BEDROCK_[A-Z_]+$/.test(error.code) ? error.code : 'AWS_CALL_FAILED'; }
finally { evidence.finishedAt = new Date().toISOString(); await writeFile(`${dir}/direct-probe.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence)); }
