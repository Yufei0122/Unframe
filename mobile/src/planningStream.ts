import type { AIRoute, PlanningReply, PlanningVisitEvent } from '../../shared/ai-types';

/** Consume complete protocol events, even when UTF-8 and JSON span network chunks. */
export async function readPlanningVisit(body: ReadableStream<Uint8Array>, signal: AbortSignal, onAnswer: (answer: PlanningReply) => void): Promise<AIRoute> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', size = 0, answered = false, terminal = false;
  let itinerary: AIRoute | undefined, routeError: string | undefined;
  const invalid = () => new Error('The planner returned an incomplete response. Please retry.');
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (terminal || signal.aborted) throw invalid();
    const event = JSON.parse(line) as PlanningVisitEvent;
    if (!event || typeof event !== 'object') throw invalid();
    if (event.type === 'answer' && !answered && typeof event.reply === 'string' && event.preferences) {
      answered = true; onAnswer({ reply: event.reply, preferences: event.preferences });
    } else if (event.type === 'route' && answered && Array.isArray(event.itinerary?.route) && event.itinerary.route.length && Array.isArray(event.itinerary.navigation)) {
      terminal = true; itinerary = event.itinerary;
    } else if (event.type === 'route_error' && answered && typeof event.error === 'string') {
      terminal = true; routeError = event.error;
    } else throw invalid();
  };
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw signal.reason ?? invalid();
    while (true) {
      const { value, done } = await reader.read();
      if (signal.aborted) throw signal.reason ?? invalid();
      if (value) {
        size += value.byteLength;
        if (size > 128 * 1024) throw invalid();
        buffer += decoder.decode(value, { stream: true });
      }
      if (done) buffer += decoder.decode();
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!answered || !terminal) throw invalid();
    if (routeError) throw new Error(routeError);
    return itinerary!;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SyntaxError) throw invalid();
    throw error;
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
