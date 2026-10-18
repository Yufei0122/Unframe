import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeScanLoop } from '../src/nativeScanLoop';
import { resolveAPIBase, resolveAITimeoutMs } from '../src/apiConfig';
import { shouldCaptureArtwork } from '../src/scanCapture';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
const unexpectedError = (error: unknown) => assert.fail(error instanceof Error ? error : String(error));

test('a captured frame ends sampling until the visitor explicitly starts another scan', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let captures = 0;
  const frames: string[] = [];
  const loop = createNativeScanLoop({
    sample: async () => `frame-${++captures}`,
    onResult: value => { frames.push(value); return false; }, onError: unexpectedError, onBusy: () => {},
  });
  t.after(() => loop.stop());
  loop.start(); t.mock.timers.tick(400); await settle();
  t.mock.timers.tick(120000); await settle();
  assert.equal(captures, 1); assert.deepEqual(frames, ['frame-1']);
  loop.start(); t.mock.timers.tick(400); await settle();
  assert.deepEqual(frames, ['frame-1', 'frame-2']);
});

test('scene detection can freeze an unfamiliar artwork without claiming its identity', () => {
  const unknown = { matched: false, candidates: [], requiresConfirmation: true as const };
  assert.equal(shouldCaptureArtwork({ ...unknown, artworkDetected: true }), true);
  assert.equal(shouldCaptureArtwork(unknown), false);
  assert.equal(shouldCaptureArtwork({ ...unknown, artworkDetected: false }), false);
  assert.equal(shouldCaptureArtwork({ ...unknown, matched: true }), true, 'Older matching backends still freeze known works.');
});

test('camera sampling stays serial and waits between completed requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const operations: ReturnType<typeof deferred<string>>[] = [];
  const results: string[] = [];
  const loop = createNativeScanLoop({
    sample: () => { const operation = deferred<string>(); operations.push(operation); return operation.promise; },
    onResult: value => results.push(value), onError: unexpectedError, onBusy: () => {}, intervalMs: 3000,
  });
  t.after(() => loop.stop());
  loop.start(); loop.start();
  t.mock.timers.tick(400);
  assert.equal(operations.length, 1);
  t.mock.timers.tick(10000);
  assert.equal(operations.length, 1, 'another capture cannot start while the first request is pending');
  operations[0].resolve('first'); await settle();
  assert.deepEqual(results, ['first']);
  t.mock.timers.tick(2999); assert.equal(operations.length, 1);
  t.mock.timers.tick(1); assert.equal(operations.length, 2);
  operations[1].resolve('second'); await settle();
  assert.deepEqual(results, ['first', 'second']);
});

test('stopping before camera warm-up prevents any capture', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const loop = createNativeScanLoop({ sample: async () => assert.fail('camera was stopped'), onResult: assert.fail, onError: unexpectedError, onBusy: () => {} });
  loop.start(); loop.stop();
  t.mock.timers.tick(60000);
});

test('stop aborts an in-flight sample and discards its eventual result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const operation = deferred<string>();
  let signal: AbortSignal | undefined;
  const busy: boolean[] = [];
  const loop = createNativeScanLoop({
    sample: nextSignal => { signal = nextSignal; return operation.promise; },
    onResult: () => assert.fail('stopped scans must not update candidates'), onError: unexpectedError, onBusy: value => busy.push(value),
  });
  loop.start(); t.mock.timers.tick(400);
  assert.equal(busy.at(-1), true);
  loop.stop(); assert.equal(signal?.aborted, true); assert.equal(busy.at(-1), false);
  operation.resolve('stale'); await settle();
  t.mock.timers.tick(60000);
});

test('resuming waits for cancelled capture cleanup and ignores old-session errors', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const operations: ReturnType<typeof deferred<string>>[] = [];
  const results: string[] = [];
  const loop = createNativeScanLoop({
    sample: () => { const operation = deferred<string>(); operations.push(operation); return operation.promise; },
    onResult: value => results.push(value), onError: unexpectedError, onBusy: () => {}, intervalMs: 100,
  });
  t.after(() => loop.stop());
  loop.start(); t.mock.timers.tick(400);
  loop.stop(); loop.start(); t.mock.timers.tick(500);
  assert.equal(operations.length, 1, 'a remount must not overlap the prior native capture');
  operations[0].reject(new Error('old capture cancelled')); await settle();
  t.mock.timers.tick(100); assert.equal(operations.length, 2);
  operations[1].resolve('new session'); await settle();
  assert.deepEqual(results, ['new session']);
});

test('timeout reports failure immediately even when native capture ignores cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const operations: ReturnType<typeof deferred<string>>[] = [];
  const signals: AbortSignal[] = [];
  const errors: unknown[] = [], results: string[] = [], busy: boolean[] = [];
  const loop = createNativeScanLoop({
    sample: signal => { signals.push(signal); const operation = deferred<string>(); operations.push(operation); return operation.promise; },
    onResult: value => results.push(value), onError: error => errors.push(error), onBusy: value => busy.push(value), timeoutMs: 1000, intervalMs: 100,
  });
  t.after(() => loop.stop());
  loop.start(); t.mock.timers.tick(400); t.mock.timers.tick(1000);
  assert.equal(signals[0].aborted, true);
  assert.equal(errors.length, 1, 'the visitor must see a timeout before the native operation settles');
  assert.match(String(errors[0]), /timed out/i); assert.equal(busy.at(-1), false);
  loop.start(); t.mock.timers.tick(500);
  assert.equal(operations.length, 1, 'retry must retain the native capture lock until cleanup completes');
  operations[0].resolve('late timed-out frame'); await settle();
  assert.deepEqual(results, []); assert.equal(errors.length, 1);
  t.mock.timers.tick(100); assert.equal(operations.length, 2);
  operations[1].resolve('retry result'); await settle();
  assert.deepEqual(results, ['retry result']);
});

test('provider failure stops automatic retries until the visitor resumes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const failure = new Error('AI server unavailable'), errors: unknown[] = [];
  const loop = createNativeScanLoop({
    sample: async () => { calls++; throw failure; }, onResult: assert.fail, onError: error => errors.push(error), onBusy: () => {},
  });
  t.after(() => loop.stop());
  loop.start(); t.mock.timers.tick(400); await settle();
  assert.deepEqual(errors, [failure]);
  t.mock.timers.tick(60000); assert.equal(calls, 1);
  loop.start(); t.mock.timers.tick(400); await settle(); assert.equal(calls, 2);
});

test('native API configuration requires an explicit reachable server instead of browser globals', () => {
  assert.throws(() => resolveAPIBase(undefined), /EXPO_PUBLIC_API_URL/);
  assert.throws(() => resolveAPIBase('  '), /EXPO_PUBLIC_API_URL/);
  assert.equal(resolveAPIBase(' http://192.168.1.20:3000/// '), 'http://192.168.1.20:3000');
  assert.equal(resolveAPIBase('https://museum.example/unframe/'), 'https://museum.example/unframe');
});

test('API URL validation rejects malformed URLs and credential or query leakage', () => {
  for (const url of ['museum.example', '/api', 'file:///private', 'ftp://museum.example', 'https://user:secret@museum.example', 'https://museum.example?token=secret', 'https://museum.example#token']) {
    assert.throws(() => resolveAPIBase(url), /EXPO_PUBLIC_API_URL/);
  }
});

test('web API defaults preserve localhost development and hosted same-origin routing', () => {
  assert.equal(resolveAPIBase(undefined, { hostname: 'localhost', protocol: 'http:' }), 'http://localhost:3000');
  assert.equal(resolveAPIBase(undefined, { hostname: '127.0.0.1', protocol: 'https:' }), 'https://127.0.0.1:3000');
  assert.equal(resolveAPIBase(undefined, { hostname: 'museum.example', protocol: 'https:' }), '');
  assert.equal(resolveAPIBase('https://api.example', { hostname: 'localhost', protocol: 'http:' }), 'https://api.example');
});

test('CPU inference timeouts remain configurable and invalid values retain usable defaults', () => {
  assert.equal(resolveAITimeoutMs('600000', 330000), 600000);
  assert.equal(resolveAITimeoutMs('180000', 150000), 180000);
  for (const setting of [undefined, '', ' ', 'NaN', '0', '-1', '999', '1000.5', '900001', 'Infinity']) {
    assert.equal(resolveAITimeoutMs(setting, 330000), 330000);
  }
});
