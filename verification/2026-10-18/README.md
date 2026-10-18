# QUT shared museum verification

Verified in the managed Linux cloud environment on 18 October 2026 (Australia/Brisbane). QUT now enters the same welcome, Home, Plan, Scan and Profile flow as GOMA and The Met.

## Actual model inference

- OpenCLIP index rebuilt with 15 references (8 Met, 4 GOMA, 3 QUT); PNG and JPEG inputs use their actual formats.
- Recognition acceptance: 60/60 original/transformed references, 6/6 unrelated image controls rejected in all three museums, 12/12 HTTP checks. QUT contributes 12 reference variants and four HTTP checks.
- Qwen route CLI: 8/8 real Chinese/English chat and graph-constrained route checks across all museums, with zero rule-based fallbacks.
- QUT artwork confirmation: real Qwen explanation returns the supplied title, artist and year without warnings.
- Browser directly connected to the updated Node backend: send a QUT message, receive an automatic route, save it, upload the original QUT PNG, select the candidate, and complete real Qwen confirmation. No browser page errors or mocked AI responses.

| Browser request | Wall time | HTTP status |
| --- | --- | --- |
| routes/chat | 11.40 s | 200 |
| routes/plan | 4.43 s | 200 |
| artworks/recognise | 0.13 s | 200 |
| artworks/confirm | 7.18 s | 200 |

These are individual CPU samples, not performance guarantees. The broader sequential route run took longer; its full timings are retained in the model validation report.

## Regression checks

- TypeScript: npm run mobile:check.
- Web export: npm --prefix mobile run export:web -- --max-workers 2.
- Mobile location/state/profile/scanner tests: four test files pass, including QUT geolocation and saved-route restoration.
- Backend AI tests: 96 pass. Root test suite: 68 pass (overlaps the AI suite).
- Browser regression: 22/22 pass across discovery, GOMA, planner and QUT suites; see QUT-DEMO.md for the test scope. UI tests use controlled AI fixtures independently of the actual inference above.

## Evidence and limits

- qut-browser-live.json: actual browser requests, model responses and timings.
- qut-model-validation.json: recognition/route acceptance and QUT confirmation.
- qut-home.png, qut-plan.png, qut-itinerary.png and qut-scan.png: actual shared UI using live responses.

QUT's three artworks are original Unframe illustrations. Rooms and distances are simulated; this does not validate QUT's real collection, indoor navigation, arbitrary artwork recognition or physical iOS/Android hardware. OpenStreetMap tiles were disabled in live browser verification and intercepted in regression tests.
