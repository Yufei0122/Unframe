# Local AI integration — Windows setup and verification

Unframe uses **OpenCLIP ViT-B-32 / laion2b_s34b_b79k** for image matching and **Ollama qwen3:4b** for interpretation and recommendations. Inference runs on this computer. No Google project, ADC, API key, login or paid account is required. Initial dependency/model downloads need internet access; installed model inference is local.

## Windows quick start

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

Open **http://localhost:8081** for mobile web. Node and the original curator workspace are at **http://127.0.0.1:3000**. OpenCLIP listens on **127.0.0.1:8001**, Ollama on **127.0.0.1:11434**. Keep startup terminals open. No manual virtual-environment activation is needed.

| Command | Behavior |
| --- | --- |
| `npm.cmd run ai:setup` | Creates/reuses `.venv`, installs CPU PyTorch and Python dependencies, downloads/verifies OpenCLIP weights, checks/starts Ollama and installs `qwen3:4b`. Existing models are preserved. |
| `npm.cmd run ai:clip` | Starts only OpenCLIP, or reuses a compatible running service. |
| `npm.cmd run ai:index` | Builds all twelve reference vectors; OpenCLIP must be running. Replaces the index only after the complete new index is validated. |
| `npm.cmd run ai:up` | Checks/starts Ollama and OpenCLIP, rebuilds a missing/incompatible/stale index, then checks/starts Node. |
| `npm.cmd run ai:doctor` | Checks service/model identity and catalogue/index readiness. Does not claim successful inference merely because services respond. |
| `npm.cmd run ai:doctor -- --smoke` | Uses real embeddings, artwork matching and structured Qwen output. This is a small integration check, not an accuracy benchmark. |
| `npm.cmd run ai:validate` | Broader real-model acceptance: all 12 references and mild variants, 6 negative controls, both museums' HTTP recognition/confirmation/routes and a Chinese planning chat. Writes `.local-ai/validation.json`. |
| `npm.cmd run ai:check` | Compatibility alias for the doctor; `--live` is an alias for `--smoke`. |

Node 22+ and Python 3.10–3.13 are supported (Python 3.12 recommended). If Ollama is absent, install the official [Windows package](https://ollama.com/download/windows), then rerun setup. Setup stages report their own failures and reuse downloaded files on retry. TLS verification remains enabled.

The scripts identify existing services before reusing them. An unrelated process occupying a port is left untouched and produces an actionable error. Ctrl+C stops only processes created by that invocation; a preexisting Ollama, OpenCLIP or Node server remains running. A backend from an older code version must be restarted from its own terminal or moved to a different port.

## Configuration and machine profile

The root `.env` is loaded by Node and deployment scripts; existing process variables take precedence. Never overwrite a configured `.env` wholesale. `.env`, `.venv`, `.local-ai`, generated vectors and visitor data are gitignored.

This deployment targets an i7-10750H (6 cores/12 threads), approximately 16 GB RAM and GTX 1660 Ti (6 GB). Its installed NVIDIA driver 442.23 is too old for the chosen current PyTorch CUDA packages, so CPU execution is the default. No graphics-driver change is required. Free RAM was below 1 GB at the initial inspection; close unused applications if model loading fails or paging makes inference slow.

| Variable | Default / purpose |
| --- | --- |
| `OPENCLIP_URL` | `http://127.0.0.1:8001`; loopback service origin |
| `OPENCLIP_DEVICE` | `cpu` (CUDA requires a separately compatible driver/PyTorch installation) |
| `OPENCLIP_THREADS` | `4`; bounded CPU parallelism |
| `OPENCLIP_TIMEOUT_MS` | `120000`; embedding request timeout |
| `OPENCLIP_CACHE_DIR` | `.local-ai/cache`; downloaded public weights, never visitor images |
| `OLLAMA_URL` | `http://127.0.0.1:11434`; loopback API origin |
| `OLLAMA_MODEL` | `qwen3:4b` |
| `OLLAMA_TIMEOUT_MS` | `300000`; CPU generation may take minutes |
| `OLLAMA_NUM_CTX` | `4096`; context window |
| `OLLAMA_NUM_GPU` | `0`; CPU inference on this machine |
| `OLLAMA_NUM_PREDICT` | `768`; bounded response length |
| `OLLAMA_KEEP_ALIVE` | `0`; unload Qwen after requests to reduce idle RAM |
| `ARTWORK_MATCH_THRESHOLD` | `0.80`; cosine similarity cutoff, not probability or accuracy |
| `ARTWORK_EMBEDDINGS_FILE` | `data/artwork-embeddings.json`; explicit override supported |
| `AI_STARTUP_TIMEOUT_MS` | `600000`; allowance for slow model startup |
| `AI_ALLOWED_ORIGINS` | Local mobile web origins listed in `.env.example` |
| `PORT` | `3000`; existing Node HTTP port |
| `UNFRAME_DATA_DIR` | `data`; existing visitor state and default index directory |
| `PYTHON_EXE`, `OLLAMA_EXE` | Optional executable paths when automatic discovery is unsuitable |

Mobile web uses `EXPO_PUBLIC_API_URL` only when an explicit backend address is necessary. Browser localhost defaults to port 3000. Optional `EXPO_PUBLIC_AI_TIMEOUT_MS` (330000) and `EXPO_PUBLIC_CLIP_TIMEOUT_MS` (150000) should exceed backend timeouts. Restart Expo after changes. A phone's localhost refers to that phone, so the default Windows loopback service is not directly reachable from a physical phone. This deployment validates Windows mobile web, not a signed iOS/Android installation.

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
- **Camera unavailable:** Use localhost/HTTPS, allow browser permission or choose Photos. Physical-device camera behavior still needs device testing.
- **Similarity is low:** Improve framing and lighting. Do not lower the threshold merely to force a result; validate positives and unrelated negatives first.

The original Northbank curator workspace and visitor persistence are unchanged. No Git commit, push or PR is part of setup. The API remains a local prototype, with its existing curator and visitor privilege model.

Official API/model references: [OpenCLIP](https://github.com/mlfoundations/open_clip), [Ollama chat API](https://docs.ollama.com/api/chat), [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Verified Windows deployment — 2026-10-11 (Australia/Brisbane)

This checkout was modified and verified on the actual Windows machine. There were existing uncommitted scanner/mobile changes; they were retained. No applicable `AGENTS.md` was found in the project or checked ancestors. No Git commit, push or PR was created. The root `.env` did not exist initially and was created; existing visitor data was not reset. The former Google transport and `google-auth-library` dependency were removed.

The original backend already occupied port 3000 and was left running. This installation uses root `.env` **`PORT=3001`**, with **`mobile/.env.local` pointing to `http://127.0.0.1:3001`**. The example/default remains port 3000 for a fresh installation. Open the mobile web URL below to use the new backend.

| Service | Verified address/state |
| --- | --- |
| Mobile web (real Metro UI) | http://localhost:8081 — running; Home and Plan visually inspected |
| New Node backend | http://127.0.0.1:3001 — running; both catalogue/status endpoints ready |
| OpenCLIP | http://127.0.0.1:8001/health — running on CPU, 4 threads; fixed model/weight identity, 512 dimensions |
| Ollama | http://127.0.0.1:11434 — existing 0.34.0 service reused; local Qwen3 4.0B Q4_K_M installed |

Qwen unloads its weights after requests because `OLLAMA_KEEP_ALIVE=0`; the Ollama service remains available and reloads on demand. The preexisting `gemma3:270m` model was preserved. OpenCLIP weights are cached under `.local-ai/cache`, dependencies under `.venv`. `ai:up` currently owns the OpenCLIP process and reuses the separately running Node/Ollama services. Startup processes were left running for use after this task; rerun the documented commands after a reboot or stopped session.

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
