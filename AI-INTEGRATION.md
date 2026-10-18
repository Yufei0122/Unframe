# Local AI integration — Windows setup and verification

Unframe uses **OpenCLIP ViT-B-32 / laion2b_s34b_b79k** for image matching, **Qwen3 1.7B** for grounded catalogue interpretation and planning, and **Qwen3-VL 2B Instruct** for general visual analysis. Inference runs locally. Initial downloads and optional public-source searches need internet access.

## Route planning: one inference and progressive replies

Plan sends one `POST /api/ai/routes/visit` request. One local Qwen call jointly updates the visitor preferences, writes a short reply and selects recommended artwork IDs. The server validates the complete result, including museum-local IDs and preserved must-see selections, before publishing anything. It then emits an NDJSON `answer` event, calculates the constrained graph route from those same updated preferences and recommendations, and emits a `route` event. There is no second automatic model request.

The app reveals the validated answer at a natural pace while route computation finishes. Punctuation gets brief pauses, and total display time is bounded to 1.6–4.5 seconds. The route appears as soon as it is ready, even while the answer is still revealing. The skip icon shows the full answer immediately; reduced-motion preferences also bypass the effect. This is a display animation of a completed, validated answer, not model-token streaming or a display of private reasoning. Answer space is reserved and the view scrolls to a new answer once, so typing and the map do not repeatedly move the reading position.

The old `routes/chat` and `routes/plan` APIs remain available for compatibility and an explicit route retry. A route failure after a valid answer emits `route_error`; it preserves the answer and updated preferences. Automatic combined visits require real Qwen recommendations and never count a local-rule fallback as model success. A deliberate route retry retains the existing labelled fallback behavior. Cancel, new conversation, leaving Plan and museum changes abort outstanding work; stale responses cannot update the active conversation.

The model still uses local **qwen3:1.7b**. Running two simultaneous generations on the same local model would compete for memory/CPU and could use stale preferences; the joint call avoids both. The graph enforces walking plus viewing time, accessibility and must-see constraints. The new reply grammar explicitly bounds its regular-expression length, since some Ollama grammar converters ignore `maxLength` when a `pattern` is also present.

After updating, stop old backend/Expo terminals with Ctrl+C and run `npm.cmd start`. For planning without image services, run `npm.cmd run ai:routes`. `planningVersion: 7` and effective configuration checks reject reuse of a stale backend. `GET /api/ai/planning/status` checks local model presence/capability, not successful inference.

Real verification commands:

```powershell
npm.cmd run ai:routes:verify
# Or, against a running backend:
npm.cmd run ai:validate:routes
# First/repeat samples for the actual combined UI pipeline:
npm.cmd run ai:routes:timing
```

Acceptance covers Chinese preference changes and English follow-ups for The Met, GOMA and QUT: six combined visits. It verifies event ordering, correct updated preferences and route graph constraints with no image-service dependency or AI mocks. Timing mode runs two Met visits. Reports live in `.local-ai/acceptance/visit-*.json`, with answer-ready, complete-route and intervening graph times. Planning has no automatic generation deadline; Ctrl+C or the app's Cancel action stops it. Individual timings are not general hardware performance guarantees. The prior separate chat/route validators remain in the repository for compatibility regression tests.

Software tests cover one generation per visit, invalid recommendations, impossible routes, cancellation, UTF-8/chunk boundaries, partial-stream errors, progressive display, reduced motion, retries and navigation. Actual cloud-model evidence is recorded separately from fixtures and does not establish Windows/device performance.

## General artwork analysis

The general-analysis path uses **local `qwen3-vl:2b-instruct`**, separate from the text-only guide model. Legacy `qwen3-vl:4b` and `:2b` settings migrate to their corresponding Instruct tags at startup; the legacy tags select Thinking weights and can spend the request budget reasoning despite `think:false`. JPEG/PNG/WebP images outside the twelve-work catalogue receive visual observations. Uploaded photos first try catalogue recognition; unmatched web photos proceed to visual analysis. Automatic camera sampling remains the lightweight, museum-scoped OpenCLIP path.

For an already installed project, from either the root or `mobile`:

```powershell
npm.cmd run ai:setup:vision
# Starts/reuses local services and opens the complete browser app.
npm.cmd start
```

`ai:setup:vision` downloads the configured model and checks image support. The default [Qwen3-VL 2B Instruct package](https://ollama.com/library/qwen3-vl:2b-instruct) is approximately 1.9 GB; 4B Instruct is approximately 3.3 GB. `npm.cmd start` also downloads missing vision weights, starts Expo on 8081, and passes the backend `PORT` to the browser. Stop the previous backend and Expo terminals before starting an updated checkout.

The analysis returns visible features, cautiously transcribed labels/signatures, and at most one **unverified** title/artist hypothesis. The server sends only that short title/artist query to these public sources:

- [The Met Collection API](https://metmuseum.github.io/)
- [Art Institute of Chicago API](https://api.artic.edu/docs/)
- [Wikimedia Commons image information](https://www.mediawiki.org/wiki/API:Imageinfo)

No visitor image is uploaded to public services or persisted by Unframe. The Ollama [vision API](https://docs.ollama.com/capabilities/vision) receives a metadata-free, maximum-512-pixel image on loopback. Distinct local OpenCLIP matches ground title/artist fields in verified catalogue metadata. Uniform images abstain before inference. Public reference downloads use a fixed HTTPS allowlist and at most three seconds of the remaining analysis budget. The Met adapter uses the paginated `/v1.1/search` endpoint; `/v1/search` retired on 2026-10-01. Metadata-only results never confirm identity. General results are not automatically inserted into museum routes, favourites, or the catalogue.

The providers have limited coverage. Unknown contemporary work, unusual views, reproductions, missing source images, network outages and wrong model guesses can all leave identity uncertain. A model description may itself be inaccurate. This is not a universal artwork identification database or a real-world accuracy guarantee. Existing local `0.80` matching threshold is unchanged; it is not a calibrated confidence probability for general-source images.

Vision defaults: `OLLAMA_VISION_MODEL=qwen3-vl:2b-instruct`, `OLLAMA_VISION_NUM_PREDICT=768`, `OLLAMA_VISION_NUM_CTX=4096`, `OLLAMA_VISION_TIMEOUT_MS=120000`, `AI_ANALYSIS_BUDGET_MS=125000`, `EXPO_PUBLIC_VISION_TIMEOUT_MS=130000`. Catalogue interpretation has a separate `OLLAMA_EXPLANATION_TIMEOUT_MS=45000` and `EXPO_PUBLIC_AI_TIMEOUT_MS=50000`, covering text-model reload after vision. CLIP retains its five-second budget. Startup migrates the old client deadlines. Vision GPU runner failure retries once on CPU without changing backend configuration. `ARTWORK_PUBLIC_SEARCH=false` disables external queries. Leaving Scan, cancelling, or reaching the deadline aborts upstream work. CPU general analysis can take tens of seconds; the UI uses one progress indicator and resume/cancel instead of promising fifteen seconds.

After starting the updated backend, run in another terminal:

```powershell
npm.cmd run ai:doctor -- --vision
# Optional real input outside the museum catalogue; the image itself is not saved.
npm.cmd run ai:doctor -- --vision --image "C:\path\to\artwork.jpg"
```

`ready` in the status API describes the existing catalogue/guide services; `analysisReady` and `analysisMessage` separately describe the vision model. The new multipart endpoint is **`POST /api/ai/artworks/analyse`**, field **`image`**. The `--vision` check calls that actual HTTP endpoint and records whether public search and visual comparison succeeded; it does not label a plausible generated description as a confirmed identity.

Automated tests cover vision capability, independent budgets, legacy setting migration, GPU-to-CPU retry, catalogue grounding, blank-image abstention, cancellation and source outages. Browser regression tests mock model responses and do not prove inference. The opt-in `mobile/e2e/live-ai.spec.js` opens the real `npm start` preview on 8081 when `UNFRAME_LIVE_AI_URL` is set to its backend. It uploads museum and unfamiliar images without interception, then checks interpretation again after switching back from vision. Reports are saved to `.local-ai/acceptance/browser-scan-*.json`. CPU cloud verification uses official model weights; physical Windows hardware and native camera behaviour still require device testing.

### Real CPU cloud verification · 2026-10-17

[Versioned reports and interface screenshots](verification/2026-10-17/README.md) record 48/48 catalogue reference variants, six rejected negative images in both museums, eight successful recognition HTTP checks, five successful general-vision/source checks, and six successful Chinese/English planning checks with no fallback responses. The actual browser upload flow also passes catalogue recognition and interpretation, unfamiliar-image analysis, and interpretation after switching back from the vision model.

The final browser sample records recognition at 119–202 ms, a warm catalogue interpretation at 5.9 seconds, general analysis at 61.6 seconds, and catalogue interpretation after reloading the text model at 16.5 seconds. Separate labelled vision controls took 44–45 seconds. These are individual CPU observations, not a fifteen-second service guarantee or a Windows GPU measurement. The reports preserve an unavailable public reference image and the successful alternative download rather than hiding that failure.

## Windows quick start

### Install and verify the general-analysis update

The general-artwork update's `INSTALL.cmd` installs the missing vision weights, starts the existing local services, and runs `ai:acceptance` before starting Expo. Stop the old backend and Expo with Ctrl+C in their own terminals first. Existing `.env` files, models, catalogue index and visitor data are preserved. Source files are backed up before replacement; unexpected local edits abort the entire update before any source writes. The installer also accepts the exact source hashes from the previous update bundle, so installing this revision over that bundle does not require manually overwriting files.

From an already updated project, the same real acceptance can be repeated from the root or `mobile`:

```powershell
npm.cmd run ai:acceptance
```

This starts/reuses local services, runs the strict route acceptance described above, then checks the following sequentially. Expo starts only if all enabled checks pass:

1. Real OpenCLIP: every bundled artwork with four input variants (48 inputs), six negative controls, and eight catalogue/status/recognition HTTP checks. This omits guide/chat generation and preserves the previous full `validation.json`. Results: `.local-ai/recognition-validation.json`.
2. Real vision HTTP: browser-origin access, installed vision identity, Water Lilies, The Harvesters and a generated white negative. Positive controls must be classified as likely artworks. Identity abstention is allowed and counted separately; a leading title/artist that disagrees with the labelled control fails for review. A white image must not produce an artwork identity or reference. Reports retain actual model answers and timings, with a new `.local-ai/acceptance/vision-<timestamp>-<id>.json` for every run.
3. When public search is enabled, a separate Water Lilies/Monet query must reach all three providers and download/decode a public reference. An unreachable provider fails full acceptance, even if local analysis works; the report identifies the source. `ARTWORK_PUBLIC_SEARCH=false` explicitly selects a local-only configuration and records retrieval as disabled, not verified.

Vision checks use `AI_ANALYSIS_BUDGET_MS`, including model load, and fail with a nonzero exit if inference or correctness checks fail. The validator never substitutes sample answers. Reports distinguish model observations, identity accuracy for labelled controls, blank-image abstention, and external search/download failures. To rerun only this portion while services run, use `npm.cmd run ai:validate:vision`.

**Training and accuracy:** this deploys pretrained OpenCLIP and Qwen3-VL weights; installing models or generating the catalogue embedding index is not fine-tuning. No new training has been performed. Independent labelled photographs, including different views of the same work and non-art/difficult negatives, are needed for a train/validation/test split and a meaningful accuracy assessment. Keep photographs of the same capture session together when splitting, and reserve a held-out set before adjusting any threshold or model weights. The 12 reference images and their transformations are integration controls, not an independent test set or evidence that arbitrary artworks can be identified. A passed report proves only its stated checks, and permits an explicit uncertain identity.

**Historical 2026-10-12 cloud revision:** that runtime had no model weights and its network allowlist blocked the vision registry and public sources, so its tests used controlled fixtures. The 2026-10-17 CPU cloud verification below supersedes that inference limitation. Neither cloud run executes commands on the visitor's Windows computer.

From PowerShell:

```powershell
cd D:\FlyFly\Study\Project\Unframe
npm.cmd install
npm.cmd --prefix mobile install
# Only create .env if absent; preserve an existing configuration.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run ai:setup
npm.cmd run ai:up
```

In a second terminal:

```powershell
cd D:\FlyFly\Study\Project\Unframe
npm.cmd run ai:doctor
npm.cmd run ai:doctor -- --smoke
npm.cmd run mobile:web -- --port 8081
```

Open **http://localhost:8081** for mobile web. The Node API defaults to **http://127.0.0.1:3000** (this checkout uses port 3001). Its browser entry redirects to the mobile preview; there is no separate desktop or curator UI. OpenCLIP listens on **127.0.0.1:8001**, Ollama on **127.0.0.1:11434**. Keep startup terminals open. No manual virtual-environment activation is needed.

| Command | Behavior |
| --- | --- |
| `npm.cmd run ai:setup` | Creates/reuses `.venv`, installs CPU PyTorch and Python dependencies, downloads/verifies OpenCLIP weights, checks/starts Ollama and installs the guide, lightweight planning and vision models. Existing models are preserved. |
| `npm.cmd run ai:setup:vision` | Installs/checks only the configured local vision model. |
| `npm.cmd run ai:web` | Runs `ai:up` and Expo together with matching backend/frontend ports. |
| `npm.cmd run ai:clip` | Starts only OpenCLIP, or reuses a compatible running service. |
| `npm.cmd run ai:index` | Builds all twelve reference vectors; OpenCLIP must be running. Replaces the index only after the complete new index is validated. |
| `npm.cmd run ai:up` | Checks/starts Ollama and OpenCLIP, rebuilds a missing/incompatible/stale index, then checks/starts Node. |
| `npm.cmd run ai:doctor` | Checks service/model identity and catalogue/index readiness. Does not claim successful inference merely because services respond. |
| `npm.cmd run ai:doctor -- --smoke` | Uses real embeddings, artwork matching and structured Qwen output. This is a small integration check, not an accuracy benchmark. |
| `npm.cmd run ai:validate` | Broader real-model acceptance: all 12 references and mild variants, 6 negative controls, both museums' HTTP recognition/confirmation/routes and a Chinese planning chat. Writes `.local-ai/validation.json`. |
| `npm.cmd run ai:validate:routes` | Serial real Qwen planning acceptance: Chinese preference edits and resulting routes in both museums, then an English GOMA revision and route. Each run writes a new `.local-ai/qwen-routes-*.json`, preserving failed attempts. Fallback responses fail model acceptance even when HTTP returns 200. |
| `npm.cmd run ai:verify:features` | Starts the real local services, requires catalogue recognition below 5 seconds and complete, correct planning responses without a generation deadline, and exits nonzero unless both feature gates pass. |
| `npm.cmd run ai:check` | Compatibility alias for the doctor; `--live` is an alias for `--smoke`. |

Node 22+ and Python 3.10–3.13 are supported (Python 3.12 recommended). If Ollama is absent, install the official [Windows package](https://ollama.com/download/windows), then rerun setup. Setup stages report their own failures and reuse downloaded files on retry. TLS verification remains enabled.

The scripts identify existing services before reusing them. An unrelated process occupying a port is left untouched and produces an actionable error. Ctrl+C stops only processes created by that invocation; a preexisting Ollama, OpenCLIP or Node server remains running. A backend from an older code version must be restarted from its own terminal or moved to a different port.

## Configuration and machine profile

The root `.env` is loaded by Node and deployment scripts; existing process variables take precedence. Never overwrite a configured `.env` wholesale. `.env`, `.venv`, `.local-ai`, generated vectors and visitor data are gitignored.

This deployment targets an i7-10750H (6 cores/12 threads), approximately 16 GB RAM and GTX 1660 Ti (6 GB). Ollama now uses automatic GPU placement (`OLLAMA_NUM_GPU=-1`) and falls back to CPU when GPU offload is unavailable. Meeting artwork response budgets depends on the actual driver, available VRAM/RAM and a warmed model; planning has no time limit and the real acceptance report is authoritative. Close unused applications if model loading fails or paging makes inference slow.

| Variable | Default / purpose |
| --- | --- |
| `OPENCLIP_URL` | `http://127.0.0.1:8001`; loopback service origin |
| `OPENCLIP_DEVICE` | `cpu` (CUDA requires a separately compatible driver/PyTorch installation) |
| `OPENCLIP_THREADS` | `4`; bounded CPU parallelism |
| `OPENCLIP_TIMEOUT_MS` | `4500`; server embedding deadline for the 5-second recognition target |
| `OPENCLIP_CACHE_DIR` | `.local-ai/cache`; downloaded public weights, never visitor images |
| `OLLAMA_URL` | `http://127.0.0.1:11434`; loopback API origin |
| `OLLAMA_MODEL` | `qwen3:1.7b` |
| `OLLAMA_PLANNING_MODEL` | `qwen3:1.7b`; independent lightweight route preference/recommendation model |
| `AI_RESPONSE_BUDGET_MS` | `15000`; short status/preflight budget; inference deadlines below are independent |
| `AI_RECOGNITION_BUDGET_MS` | `5000`; successful catalogue recognition must finish below this limit |
| `OLLAMA_TIMEOUT_MS` | `14000`; general local-service request deadline; planning ignores this limit |
| `OLLAMA_EXPLANATION_TIMEOUT_MS` | `45000`; catalogue interpretation including text-model reload after vision |
| `OLLAMA_NUM_CTX` | `2048`; bounded interactive context |
| `OLLAMA_NUM_GPU` | `-1`; automatic GPU-layer placement with CPU fallback |
| `OLLAMA_NUM_PREDICT` | `256`; artwork structured response limit |
| `OLLAMA_PLANNING_NUM_PREDICT` | `1024`; initial planning output limit (128–4096); one output-length retry up to `min(4096, max(1024, initial * 2))` if that increases the budget |
| `OLLAMA_PLANNING_NUM_CTX` | `4096` or the larger general context when unset; independent planning context, also used for warm-up |
| `OLLAMA_KEEP_ALIVE` | `10m`; keep the warmed model loaded between interactions |
| `ARTWORK_MATCH_THRESHOLD` | `0.80`; cosine similarity cutoff, not probability or accuracy |
| `ARTWORK_EMBEDDINGS_FILE` | `data/artwork-embeddings.json`; explicit override supported |
| `AI_STARTUP_TIMEOUT_MS` | `600000`; allowance for slow model startup |
| `AI_ALLOWED_ORIGINS` | Local mobile web origins listed in `.env.example` |
| `PORT` | `3000`; existing Node HTTP port |
| `UNFRAME_DATA_DIR` | `data`; existing visitor state and default index directory |
| `PYTHON_EXE`, `OLLAMA_EXE` | Optional executable paths when automatic discovery is unsuitable |

Mobile web uses `EXPO_PUBLIC_API_URL` when an explicit backend address is necessary. Client budgets are 50,000 ms for catalogue interpretation, 130,000 ms for general vision, and 5,000 ms for recognition. These are cancellation ceilings including model loading, not speed guarantees. Planning chat/routes have no automatic deadline. Restart Node and Expo after configuration changes. A phone’s localhost refers to the phone, so physical devices need a reachable backend address.

### Planning without a deadline and measuring actual duration

Planning chat and route generation now wait for a completed response or explicit cancellation. Both the mobile timers and the backend model timer are disabled for these two operations, even if an existing `.env` still specifies `OLLAMA_TIMEOUT_MS=300000`. `planningVersion: 6` and `planningTimeoutMs: 0` identify the new behavior. Other artwork services and short readiness checks retain their deadlines. Local model requests use cancellable loopback sockets to avoid Node fetch's separate five-minute response-header limit.

Planning has a separate output-token budget as well as no time deadline. The old 192-token default can truncate the six-field preference JSON plus reply. The new initial default is 1024 tokens; this is a ceiling, not a request to generate that many tokens. The launcher migrates the old `OLLAMA_PLANNING_NUM_PREDICT=192` value to 1024 in memory, without editing `.env`. Other explicit values remain configured.

Only an Ollama response with `done: true` and `done_reason: "length"` triggers one regeneration using a larger bounded budget, normally 2048 tokens. It uses the original prompt/schema and stays cancellable; partial JSON is discarded. Missing completion flags, invalid JSON, transport failures and artwork explanations are not retried by this policy. Both attempts share the same busy gate. A valid answer still requires a natural stop, complete JSON and all existing museum/route checks. Incomplete responses expose only stop reason, token counts, limits and duration metrics in `details.attempts`, never raw model output or thinking. The benchmark saves the HTTP error body and code, includes retry time in successful durations and never counts a failed request as a successful sample.

The Plan screen shows elapsed seconds and a **Cancel request** button. A completed reply shows its duration; the most recent route duration remains on Plan when returning from the itinerary. Cancelling, leaving Plan or starting a new conversation aborts upstream inference and ignores late responses.

Stop the previous backend/Expo in their original terminals so the updated code can load. To start the text services and measure real inference, from the repository root run:

```powershell
npm.cmd run ai:routes:timing
```

This command sequentially measures `chat_first`, `route_first`, `chat_repeat`, and `route_repeat` using the screenshot's 30-minute highlights request for The Met. It prints elapsed time every 15 seconds and final durations in seconds, and saves millisecond timings plus actual responses in `.local-ai/benchmarks/planning-<timestamp>-<id>.json`. There is no generation deadline; Ctrl+C cancels. Startup only needs the text model and shuts down only the services it started after testing. It uses the independent planning model and the launcher’s effective inference settings, including GPU-to-CPU fallback, and records those settings. The first request is not guaranteed to be cold: the test does not unload an already running model. Individual samples are not a general speed guarantee.

If the updated backend is already running, use `npm.cmd run ai:timing:routes` instead. To use the app interactively afterward, run `npm.cmd run ai:routes`. No timeout environment override is needed. Both timing and route acceptance require a real Qwen result; fallback routes and failed/cancelled requests are never counted as successful timing samples. Preflight failures are recorded without inventing model timings.

Controlled regression checks cover backend responses exceeding a configured deadline, browser requests after two hours of virtual clock advancement, explicit cancellation, and timing-report success/failure. These use simulated model responses; the 2026-10-17 cloud checks separately exercise real model inference. The cloud workspace cannot access the Windows Ollama process. Earlier transport verification with a real loopback server delayed headers for 310 seconds: original Node fetch failed after 301 seconds with `UND_ERR_HEADERS_TIMEOUT`, while the replacement completed after 310 seconds. That was a transport test, not an inference measurement.

## Recognition, privacy and catalogue isolation

Camera frame or uploaded JPEG/PNG/WebP → Node size/type/signature/full-decoding checks → oriented JPEG with metadata removed → local Python `/embed` → normalized 512-dimensional vector → museum-scoped cosine search → up to three suggestions → explicit visitor selection → separate Qwen explanation.

Uploads are limited to 5 MB and 25 million pixels. The Python endpoint independently validates JSON/base64, MIME against the decoded image, size, dimensions and still-image decoding. It removes EXIF/GPS and other metadata in memory. Uploaded photographs are not persisted by the Node/Python services. Camera frames and bounded planning context stay on local services; model-download traffic is separate from inference. Native camera temporary captures retain the existing cleanup behavior.

Opening Scan with camera permission starts serial frame sampling. Pause, navigation, hidden browser pages and cancellation stop scanning; late results are ignored. Photo upload is available when camera access is denied. Candidates are suggestions, never automatically confirmed. An unrelated or low-score image returns `matched:false`, not the closest artwork unconditionally. Scores are shown as similarity, not a percentage of correctness.

Eight Met works and four QAGOMA Collection works remain in their existing catalogues and independent demo graphs. Artwork identity, artist and dates come from those catalogue records, never from a model's guess. Recognition, confirmation, chat IDs and route must-sees are scoped to the selected museum. See [GOMA-DEMO.md](GOMA-DEMO.md) for catalogue sources and image credits.

The index stores model and pretrained-weight identity, dimensions, normalization and reference-image hashes. Old Google 1408-dimensional vectors are incompatible and cannot be mixed with OpenCLIP vectors. Index generation computes every reference first, validates the result, then atomically replaces the file. A failed rebuild leaves the previous file intact; runtime rejects it if incompatible. User state in `data/unframe.json` is not migrated or reset.

## Qwen generation and deterministic routes

Node calls Ollama **`POST /api/chat`** with `stream:false`, **`think:false`** and a JSON Schema in `format`. Runtime validation still checks required fields, lengths, complete preferences and allowed artwork IDs. Invalid or truncated model output is an explicit error, never accepted solely because the provider claimed structured output.

Explanations are extractive: Qwen selects and orders permitted fact/note IDs using a constrained schema, and the server maps them to exact catalogue text. Unsupported IDs or extra prose are rejected. Title, artist, dates and facts therefore come from catalogue metadata; interpretation comes from labelled catalogue notes. Missing additional historical context is stated explicitly. This was strengthened after a real Qwen probe invented an unsupported historical claim despite grounding prompts. The model has no image-identification role. The underlying catalogue interpretation still requires museum editorial review.

The Plan tab uses a bounded conversation to update validated visit preferences. A failed or pending chat does not silently change confirmed preferences. Generating a route asks Qwen only for a shortlist of permitted artwork IDs. Existing exact itinerary search and Dijkstra paths enforce time, must-see and step-free/wheelchair constraints. `recommendationSource` is `ollama` for successful model selection or `local` for the deterministic fallback. Graph positions, distances and accessibility flags remain illustrative demo data, not surveyed indoor navigation.

If Qwen fails, confirmed catalogue details remain available with a warning, route generation uses the existing labelled local fallback, and chat returns a clear error. Missing OpenCLIP or an incompatible index blocks recognition explicitly. No Google fallback is retained.

## API compatibility

| Method and path | Purpose |
| --- | --- |
| `GET /api/ai/catalogue?museumId=met` | Existing catalogue and graph; `goma` supported |
| `GET /api/ai/status?museumId=met` | Safe model/index readiness, without credentials or image bytes |
| `POST /api/ai/artworks/recognise?museumId=met` | Multipart field `image`; suggestions with `requiresConfirmation:true` |
| `POST /api/ai/artworks/confirm` | `{museumId,artworkId,visitorPreferences?}`; confirmed catalogue record and explanation/warning |
| `POST /api/ai/routes/chat` | `{museumId,message,history,preferences}`; reply and fully validated preferences |
| `POST /api/ai/routes/plan` | Existing route preferences plus `museumId`; deterministic constrained route |
| Python `GET /health`, `POST /embed` | Identity/readiness and `{imageBase64,mimeType}` → `{embedding,model,pretrained,dimensions,normalized}` |

Omitted museum defaults to Met. Unknown museums and cross-museum artwork IDs are rejected. Route preferences retain `interests`, `availableMinutes` (1–240), `currentLocation`, `walkingPreference`, `accessibilityRequirements`, and `mustSeeArtworkIds`. Unsupported input returns 400; infeasible routes return 422; unavailable local models return 503; generation timeout returns 504. Confirmation/route fallback responses include warnings as before.

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/ai/artworks/recognise?museumId=met" -F "image=@mobile/assets/water-lilies.jpg;type=image/jpeg"
$body = @{ museumId='met'; artworkId='water-lilies'; visitorPreferences=@('Nature') } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/ai/artworks/confirm -ContentType 'application/json' -Body $body
```

## Checks and troubleshooting

### Windows service recovery — 2026-10-12 (Australia/Brisbane)

The user's Windows diagnostic output showed `OPENCLIP_UNAVAILABLE`, with Ollama/Qwen available and both indexes complete (Met 8, GOMA 4). The initial `Missing script: "ai:doctor"` error came from running the root command in `mobile`. From that directory, `npm.cmd --prefix .. run ai:up` loaded OpenCLIP on port 8001, verified the existing index, reused Ollama and started the backend on port 3001. Keep that terminal open alongside Expo; installed weights alone do not keep the services running.

A subsequent real HTTP request on the user's Windows machine returned `matched:true`, candidate `water-lilies` (Claude Monet), similarity `0.9999999999999989`, and `requiresConfirmation:true`:

```powershell
curl.exe --max-time 150 -sS -F "image=@D:/FlyFly/Study/Project/Unframe/mobile/assets/water-lilies.jpg;type=image/jpeg" "http://127.0.0.1:3001/api/ai/artworks/recognise?museumId=met"
```

This result was supplied by the user from their Windows machine, not generated by the cloud checkout. It verifies the backend/model/index path for a reference image, not browser routing, real-camera accuracy, or arbitrary artwork identification. The reported unmatched input was another artwork; its identity and library membership were not established. Recognition searches only the selected museum's bundled catalogue. An unmatched result means no sufficiently similar catalogue reference was found; it does not establish that the photograph contains no art. The cloud source now explains this scope in its no-match message; those source changes still need to be transferred to Windows to affect that running installation.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run mobile:check
npm.cmd run mobile:test
.\.venv\Scripts\python.exe -m unittest discover -s local-ai -p 'test_*.py' -v
node --test tests/ai-runtime.test.js
npm.cmd run mobile:export:web
npm.cmd run test:mobile:e2e
npm.cmd run ai:doctor -- --smoke
npm.cmd run ai:validate
```

Node transport and browser tests use mocks; Python HTTP tests also use a mock encoder. They verify contracts, validation, lifecycle and fallback behavior, not real model quality. Doctor smoke checks and the deployment report separately record real-model results. Reference-image self-matches are integration evidence only. Threshold evaluation needs independent photographs, lighting/crop variations and difficult negatives before claiming field recognition performance.

- **Download/proxy/TLS error:** Check access to PyPI, download.pytorch.org, Hugging Face and Ollama's registry. Configure an approved system proxy/CA if your network requires it; never disable TLS verification. Rerun setup to reuse completed files.
- **Missing Python or Ollama:** Install the official runtime or configure its executable path. No manual venv activation is needed.
- **Model loading/timeout/out of memory:** Close unused apps, inspect Task Manager, keep CPU defaults and single requests. Increase `OLLAMA_TIMEOUT_MS` and mobile timeout together if necessary. Increasing the context window raises RAM use.
- **Wrong model/missing/stale index:** Run `ai:setup`, start `ai:clip`, then `ai:index`; `ai:up` also handles an index rebuild. An old incompatible index is retained after failure but never queried.
- **Port already in use:** Compatible services are reused. For another application choose a free `PORT`, `OPENCLIP_URL` or `OLLAMA_URL`; do not terminate unrelated services.
- **Old backend on port 3000:** Stop it in its own terminal and run `ai:up` again, or use a new port and update the mobile API URL.
- **Expo cache permission error:** For local web development with installed dependencies, `$env:EXPO_OFFLINE='1'; npm.cmd run mobile:web -- --port 8081` skips online dependency validation and its profile cache. This does not change Qwen inference or backend routing.
- **Camera unavailable:** Use localhost/HTTPS, allow browser permission or choose Photos. Physical-device camera behavior still needs device testing.
- **Similarity is low:** Improve framing and lighting. Do not lower the threshold merely to force a result; validate positives and unrelated negatives first.

The separate Northbank curator UI has been removed; existing backend APIs and JSON persistence are retained. No Git commit, push or PR is part of setup. The API remains a local prototype, with its existing curator and visitor privilege model.

Official API/model references: [OpenCLIP](https://github.com/mlfoundations/open_clip), [Ollama chat API](https://docs.ollama.com/api/chat), [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Qwen route deployment recheck — session dated 2026-10-17

At the start of this recheck, Ollama was available but Node 3001, OpenCLIP 8001 and Metro 8081 were stopped. `ai:up` restored OpenCLIP and Node using the existing valid index and installed weights. Ollama now reports **0.40.3**; the local model remains **qwen3:4b**, Q4_K_M, digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. CPU settings and the configured model were preserved. No model download or provider/prompt change was needed.

The initial real GOMA route request succeeded in 30.4 seconds with `recommendationSource: "ollama"`. The new `npm.cmd run ai:validate:routes` then passed **6/6 actual HTTP inference checks**: Chinese preference editing in both museums, routes generated from those returned preferences, an English GOMA revision with Chinese history, and its resulting route. The three route responses were all `ollama`, with **zero fallback responses**:

| Case | Requested budget | Recomputed itinerary | Request time |
| --- | --- | --- | --- |
| Met after Chinese preference edit | 20 min | 20 min | 39.6 s |
| GOMA after Chinese preference edit | 20 min | 16 min | 25.5 s |
| GOMA after English revision/removing must-sees | 35 min | 23 min | 25.3 s |

Acceptance independently checks museum membership, must-sees, duplicate stops, accessible graph edges, walking distance and walking-plus-viewing time. Qwen selects artworks; the deterministic graph engine produces the feasible itinerary. A 200 response with `recommendationSource: "local"`, a warning or a provider error fails model acceptance. Failed chat checks do not receive manually substituted preferences. Every run preserves its requests, responses, timings, model identity and relevant source hashes in a uniquely named report.

A separate **real missing-model control** called Ollama with an intentionally nonexistent model name without modifying deployment settings or pulling weights. It returned `OLLAMA_MODEL_MISSING` and a usable `local` route. The acceptance guard rejected it; this control is **not a model success**. Automated backend tests passed **52/52**, including fallback rejection and independently corrupted navigation/time checks; these automated tests use mocked model responses and are separate from the real checks above.

Services were left running at **http://localhost:8081** (mobile web), **http://127.0.0.1:3001** (API), **8001** (OpenCLIP) and **11434** (Ollama). Metro initially failed to write its profile cache; starting it with `EXPO_OFFLINE=1` succeeded. The HTML and compiled JavaScript both returned HTTP 200, and the bundle points at API 3001. No connected browser was available for this recheck, so this is HTTP/bundle verification, **not UI click verification**. Services require restarting after their process/session stops. No new image-recognition accuracy evaluation was performed.

Local evidence:

- `.local-ai/qwen-routes-1792163695331-2b33e86c-8982-4677-8801-3747120dd26b.json`: six real checks, three model routes, zero fallbacks.
- `.local-ai/qwen-route-baseline-1792163562630.json`: initial real route request.
- `.local-ai/qwen-fallback-control-1792163922870.json`: actual missing-model control, explicitly `modelSuccess: false`.
- `.local-ai/qwen-frontend-delivery.json`: HTML/bundle delivery and configured API address.
- `.local-ai/qwen-deployment-verification.json`: final service health and references to acceptance evidence.

The heading uses the client session date. Evidence retains the host's raw UTC timestamps, which differ from the supplied client date; timestamps have not been rewritten. Previous deployment reports below remain historical evidence.

## Verified Windows deployment — 2026-10-11 (Australia/Brisbane)

This checkout was modified and verified on the actual Windows machine. There were existing uncommitted scanner/mobile changes; they were retained. No applicable `AGENTS.md` was found in the project or checked ancestors. No Git commit, push or PR was created. The root `.env` did not exist initially and was created; existing visitor data was not reset. The former Google transport and `google-auth-library` dependency were removed.

The original backend already occupied port 3000 and was left running. This installation uses root `.env` **`PORT=3001`**, with **`mobile/.env.local` pointing to `http://127.0.0.1:3001`**. The example/default remains port 3000 for a fresh installation. Open the mobile web URL below to use the new backend.

| Service | Verified address/state |
| --- | --- |
| Mobile web (real Metro UI) | http://localhost:8081 — running; Home and Plan visually inspected |
| New Node backend | http://127.0.0.1:3001 — running; both catalogue/status endpoints ready |
| OpenCLIP | http://127.0.0.1:8001/health — running on CPU, 4 threads; fixed model/weight identity, 512 dimensions |
| Ollama | http://127.0.0.1:11434 — existing 0.34.0 service reused; local Qwen3 4.0B Q4_K_M installed |

This historical Windows run used `OLLAMA_KEEP_ALIVE=0`. Current startup migrates that legacy value in memory to the current inference settings, preloads Qwen and keeps it warm for ten minutes. The preexisting `gemma3:270m` model was preserved. OpenCLIP weights are cached under `.local-ai/cache`, dependencies under `.venv`.

All six requested command forms were actually executed: setup, clip, index, up, doctor and doctor with smoke. Setup installed CPU PyTorch 2.8.0, torchvision 0.23.0 and OpenCLIP 3.3.0. Pip's initial sandbox cache-write failure was diagnosed and retried with the required local permission; the setup now defaults its pip cache to `.local-ai/pip-cache`. TLS verification stayed enabled. Public Hugging Face downloads completed without an account/token.

**Automated tests (model responses mocked where applicable):**

- `npm.cmd test`: **51/51 passed**, including AI transport/schema/grounding, catalogue isolation, deterministic route constraints, image privacy, original domain/API behavior and process lifecycle.
- Python image/HTTP/process tests: **12/12 passed**, including an actual child interpreter stopping on its supervisor pipe closing; HTTP embedding tests use a mock encoder.
- Mobile TypeScript check and syntax check: passed.
- Mobile unit tests: **20/20 passed**.
- Targeted real Metro browser suite: **8/8 passed** with mocked AI responses and simulated camera, including a response beyond the former 35-second timeout. The test-owned 8091 service was cleaned up; existing services were preserved.

**Real models and real HTTP/UI:**

- `ai:index`: created all **12 real 512-dimensional vectors** (Met 8, GOMA 4), version 2 with model/weight identity and source hashes.
- `ai:doctor -- --smoke`: passed both museums' reference/transformed-reference/unrelated-image checks and a real schema-constrained Qwen explanation. The transformed positive similarities were approximately **0.892 / 0.843**; exterior negatives were **0.190 / 0.371**.
- Broad acceptance: **48/48 reference/variant samples** retrieved the expected top candidate above 0.80; all **6 negative controls** were rejected in both museums. Minimum positive similarity **0.884314**, maximum negative similarity **0.444516**. Controls were three bundled museum exteriors, a blank image, seeded noise and a generated code screen. The cutoff remains **0.80** based on these limited checks.
- Twelve initial HTTP checks passed: both catalogue/status endpoints, references, foreign-museum reference/confirmation rejection, unrelated-image rejection, real Qwen explanations and real Qwen route recommendations. Both routes reported **`recommendationSource: "ollama"`**, not fallback. Recomputed graph paths respected the 30-minute budget, required work and accessible edges; Met was **29 minutes**, GOMA **23 minutes**.
- Initial Chinese planning chat failed: it answered in English and copied the old preferences. After changing the model role/message layout/schema order and adding language validation, an isolated real retest passed in about **46.8 seconds**: Chinese reply, **20 minutes**, **Colour**, **less_walking**, **step_free**, and the existing GOMA must-see ID preserved. The initial failed report remains intact; it is not presented as an all-green first run.
- The earlier unrestricted explanation probe also exposed an unsupported historical assertion. The final extractive implementation prevents Qwen prose from becoming displayed artwork facts; both museums' final real explanations passed.
- Real mobile UI smoke: existing Metro 8081, independent browser context, **no request mocks**, Home/Plan loaded without page errors; actual browser requests to Node 3001 returned Met 8/GOMA 4 with working CORS and isolated IDs. No camera permission or Qwen request was issued by this UI-only check.

Evidence is retained locally (gitignored, contains only bundled catalogue/test inputs):

| Artifact | Evidence |
| --- | --- |
| `.local-ai/doctor-smoke.log` | Real embedding scores and grounded structured explanation |
| `.local-ai/validation.json` | Full sample/HTTP results, including the first chat failure |
| `.local-ai/chat-validation.json` | Successful isolated chat retest, initial report hash and retained initial failure summary |
| `.local-ai/chat-diagnostic.json` | Initial faulty chat behavior used to diagnose the problem |
| `.local-ai/backend-tests.log` | Final 51-test result |
| `.local-ai/mobile-live.json` | Real UI, catalogue and CORS results |
| `.local-ai/mobile-live.png`, `.local-ai/mobile-live-home.png` | Visually checked real mobile web screenshots |

To repeat only the chat check without replacing the original report:

```powershell
npm.cmd run ai:validate -- --only-chat
```

Main implementation files: `local-ai/` (Python service/model/validation), `scripts/ai-*.mjs` (Windows setup and lifecycle), `scripts/index-artworks.mjs`, `scripts/check-ai.mjs`, `scripts/validate-local-ai.mjs`, `server/ai/` (local transport, Ollama, index, recognition/status/chat/routes), `shared/ai-types.ts`, relevant `mobile/src` screens/API settings/tests, root package files/env example/ignore rules, and the README/AI/GOMA/mobile documentation. User changes already present in other mobile files were retained.

There is no remaining installation or service blocker in this session. **Not validated:** photographs from an actual museum visit, physical-phone camera/permissions, general recognition accuracy, or production indoor route data. The small controlled sample is not an accuracy percentage, confidence probability or general false-positive-rate estimate. Chat replies and route reasoning still include model-generated language and can require review; factual artwork explanations are restricted to catalogue text. This remains the existing local museum prototype.

The route launcher no longer applies the 15-second acceptance limit to planning. `ai:routes:verify` retains the six real Met/GOMA checks and prints each completed request’s duration. Model warm-up time is separate from these response timings. For explicit requests to keep the existing must-see selection, the JSON schema constrains that array to the existing IDs and the backend rejects additions/removals; requests that explicitly add or remove works remain editable.
