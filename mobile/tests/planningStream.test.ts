import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlanningVisit } from '../src/planningStream';
import type { VisitPreferences } from '../../shared/ai-types';

const preferences: VisitPreferences = { interests: ['Colour'], availableMinutes: 20, currentLocation: 'entrance', walkingPreference: 'balanced', accessibilityRequirements: [], mustSeeArtworkIds: [] };
const answer = { type: 'answer', reply: '为你安排轻松的参观。', preferences };
const route = { type: 'route', itinerary: { route: [{ artworkId: 'water-lilies' }], navigation: [] } };
const encoder = new TextEncoder();

test('answer arrives before the held route, including UTF-8 characters split across chunks', async () => {
  let writer!: ReadableStreamDefaultController<Uint8Array>, received: unknown, finished = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { writer = controller; } });
  const pending = readPlanningVisit(body, new AbortController().signal, value => { received = value; }).then(result => { finished = true; return result; });
  const bytes = encoder.encode(JSON.stringify(answer) + '\n');
  for (const byte of bytes) writer.enqueue(Uint8Array.of(byte));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(received, { reply: answer.reply, preferences }); assert.equal(finished, false);
  writer.enqueue(encoder.encode(JSON.stringify(route) + '\n')); writer.close();
  assert.deepEqual(await pending, route.itinerary);
});

test('incomplete, malformed and out-of-order visit streams cannot silently succeed', async () => {
  for (const text of ['', JSON.stringify(answer) + '\n', '{bad}\n', 'null\n', JSON.stringify(route) + '\n', [answer, answer, route].map(value => JSON.stringify(value)).join('\n')]) {
    const body = new Response(text).body!;
    await assert.rejects(readPlanningVisit(body, new AbortController().signal, () => {}));
  }
});

test('route failure preserves a delivered answer; cancellation closes a waiting reader', async () => {
  let count = 0;
  const failure = [answer, { type: 'route_error', error: 'No route fits.', code: 'NO_ROUTE' }].map(value => JSON.stringify(value)).join('\n');
  await assert.rejects(readPlanningVisit(new Response(failure).body!, new AbortController().signal, () => count++), /No route fits/);
  assert.equal(count, 1);
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const controller = new AbortController();
  const pending = readPlanningVisit(body, controller.signal, () => assert.fail());
  controller.abort(); await assert.rejects(pending); assert.equal(cancelled, true);
});
