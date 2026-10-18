# Progressive planning replies and concurrent route preparation

Verified in the managed Linux cloud environment on 18 October 2026 (Australia/Brisbane).

The app now sends one combined visit request instead of separate automatic chat and route calls. A single Qwen inference returns validated updated preferences, a short answer and recommended artwork IDs. The server publishes the answer, then computes the graph route from that same result. Answer display and graph work overlap; a ready map never waits for the typing animation. This does not run two concurrent model generations or calculate a route from stale preferences.

Replies reveal over 1.6–4.5 seconds with short punctuation pauses. The skip icon and reduced-motion setting show the complete answer immediately. Reserved answer space and one-time scrolling preserve the reading position. Cancelling or leaving the page aborts pending requests and stops the effect; reopening previous answers does not replay them. Route errors preserve the completed answer and preferences for retry.

## Actual model evidence

`models-live.json` records six real Node/Qwen combined visits: Chinese input and English follow-up for Met, GOMA and QUT. All pass language, updated preference, must-see and route-graph checks without AI mocks or rule-based fallback. Answer-ready samples range from 9.45 to 32.92 seconds on this CPU, including concurrent verification workloads. Route calculation after the answer takes 0–85 ms. These samples are not latency guarantees.

`browser-live.json` records an actual browser connected directly to the updated backend. It uses exactly one `/routes/visit` request, produces a Chinese reply and a valid 20-minute, step-free Met route including Water Lilies, and opens the itinerary. The first visible answer sample is 6 characters; the completed answer is 45 characters. The route is already available during the reveal. The route section remains at the same vertical position (408 px) before and after typing. There are no page errors or AI response mocks. OSM tiles were disabled.

- `typing-with-route.png`: partially revealed answer with the route already prepared.
- `complete-answer.png`: completed answer and structured preferences in the same route card.

Real testing initially exposed an unbounded reply: some Ollama JSON-schema grammar converters let `pattern` override `maxLength`. The new combined reply uses an explicitly bounded 120-character pattern. Both languages completed without output-limit retries after the fix; a regression test checks that the grammar rejects overlong strings and line breaks.

## Software checks

- 102 backend AI tests pass, including one generation per visit, all museum constraints, invalid combined results, impossible visits, cancellation and the new acceptance CLI.
- 68 root tests pass (overlap with the AI suite).
- Five mobile test files pass, including early answer delivery while a route is held, fragmented UTF-8/JSON, malformed/unfinished streams, route errors and reader cancellation.
- Browser regression: 27 pass; the optional general-vision live test is skipped. A final rerun of all 16 planning/GOMA/QUT cases also passes. It covers progressive text, a ready map during typing, skip/reduced motion, long requests, cancellation, retry and museum changes.
- TypeScript and web/iOS/Android export pass. Native exports validate bundling; physical iOS/Android devices were not exercised.

## Reproduce

Stop the old backend and Expo, pull the update and run `npm.cmd start`. For real combined inference run `npm.cmd run ai:validate:routes`; for first/repeat samples run `npm.cmd run ai:routes:timing`. Both now use `scripts/validate-ai-visit.mjs` and save `.local-ai/acceptance/visit-*.json`. Existing weights and indexes are reused. The backend configuration version is 7, so a stale process is rejected with restart instructions.
