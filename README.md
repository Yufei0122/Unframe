# Unframe

Unframe is a React Native / Expo museum companion. **The mobile app is the only user interface**, including when opened in a computer browser. The former independent desktop website and curator interface have been removed.

## Run on Windows

Requires Node.js 22 or later. For a fresh checkout:
The **Scan** screen samples the camera view and suggests artworks using local **OpenCLIP ViT-B-32 / laion2b_s34b_b79k**. Choose a candidate to confirm the artwork and request a **Qwen3 1.7B** explanation grounded in catalogue notes. The guide shares the lightweight text model with planning to avoid loading another large model after every scan. Scanning supports pause/resume and photo upload. Choose **The Met** (eight artworks), **Brisbane GOMA** (four QAGOMA works), or **QUT Art Museum** (three original illustrations for a simulated visit). **Mira**, the assistant in Plan, updates preferences and recommends artworks in one Qwen call. Replies reveal gradually while the graph calculates the route; ready maps appear immediately in the same card. Skip or reduced-motion preferences show the full answer instantly. The graph enforces time and accessibility constraints.

**Beyond the museum collection:** uploaded photos without a local match, or **Analyse any artwork**, use local **Qwen3-VL 2B Instruct** for visual observations and tentative identity suggestions. The backend searches The Met, the Art Institute of Chicago and Wikimedia Commons using suggested titles/artists, then compares up to three public reference images with OpenCLIP when available. Uncertain identities remain explicitly unconfirmed. No photograph is sent to these public search services.

Public lookup starts from the model's suggested title/artist. When it cannot suggest an identity, Scan reports **Artwork not identified** and shows a visual description. Available candidate titles and artists appear directly on the result card; visually matched catalogue references take priority over model guesses. A working inference service does not establish identification coverage beyond the indexed collection.

For an existing installation, stop the previous Unframe backend and Expo terminals with Ctrl+C, pull `origin/work`, then run **`npm.cmd start`**. Startup downloads the configured Instruct vision model if missing and passes the backend's configured port to Expo. Keep this single terminal open. Fresh installations still need `npm.cmd run ai:setup` once. Legacy `qwen3-vl:4b` / `:2b` settings migrate to the corresponding Instruct tag; custom model names are preserved. The default 2B download is approximately 1.9 GB (4B Instruct is approximately 3.3 GB). Use `npm.cmd run ai:doctor -- --vision` for a real HTTP/vision check.

[2026-10-17 verification and screenshots](verification/2026-10-17/README.md) include actual local-model inference and browser uploads. Catalogue recognition is fast; general image analysis on the CPU cloud machine takes tens of seconds. Readiness alone (`liveVerified: false`) does not indicate an inference failure.

For reproducible artwork-retrieval training using the original Met benchmark, see [Met training](TRAINING.md), the [expanded 33,501-work mini gallery](models/met-expanded-20261018/MODEL_CARD.md), and the [first pilot's weights/results](models/met-pilot-20261018/MODEL_CARD.md). The training commands use official visitor-query splits for evaluation and keep their model/index separate from the production scanner.

From the project root, run `npm.cmd install`, then `npm.cmd run ai:setup` to install Python dependencies and download the public models. Run `npm.cmd run ai:up` to check/start local model services, preload Qwen, build a compatible 512-dimensional index when needed, and start Node at http://127.0.0.1:3000. In another terminal run `npm.cmd run mobile:web -- --port 8081` and open http://localhost:8081. Artwork checks retain bounded response budgets; planning chat and routes wait until completion or cancellation. No Google project, ADC, API key or paid account is required; Python virtual-environment activation is automatic.

Run `npm.cmd run ai:doctor` for service/model/index readiness, or `npm.cmd run ai:doctor -- --smoke` for real embedding and structured Qwen checks. Opening Scan with camera access sends sampled frames to local services; Unframe does not persist them. Similarity is not probability or accuracy. CPU timeouts, service reuse, privacy and deployment evidence are documented in [AI-INTEGRATION.md](AI-INTEGRATION.md).

For **AI route planning only**, use `npm.cmd run ai:routes:verify`: it starts/reuses local Qwen, checks actual combined Chinese/English visits and constrained routes for every supported museum, then starts Expo. It does not require image models or an artwork embedding index. `npm.cmd run ai:routes` starts without repeating acceptance. [Route acceptance](AI-INTEGRATION.md#route-planning-independent-startup-and-strict-model-acceptance) requires Qwen results rather than counting a local-rule fallback as model success; reports are saved under `.local-ai/acceptance/visit-*.json`.

**Verified on this Windows checkout (2026-10-11):** mobile web is at http://localhost:8081 and its new backend at http://127.0.0.1:3001, because the preexisting port-3000 server was preserved. The local `.env` and mobile API URL are configured accordingly. Both models, the twelve-artwork index, real explanations/routes and the corrected Chinese planning chat were exercised. See the [deployment evidence and limits](AI-INTEGRATION.md#verified-windows-deployment--2026-10-11-australiabrisbane) for test results and retained first-failure/retest records.

## iPhone / mobile app

The native iOS and Android app is in **[mobile/](mobile/README.md)**. It uses React Native and Expo, includes native navigation, camera/photo access and speech, and keeps visitor data on the device.

```powershell
npm.cmd ci
npm.cmd --prefix mobile ci
npm.cmd run ai:setup
```

Start the complete local app in one terminal:

```powershell
npm.cmd start
```

Open **http://localhost:8081**. Wide browser windows show the same mobile screens inside a phone frame. For Expo Go on a physical phone, use `npm.cmd run mobile` and follow [mobile setup](mobile/README.md).

`npm.cmd start` starts the complete local app: Ollama, OpenCLIP, the Node backend and the Expo web preview. `npm.cmd run ai:web` is an equivalent explicit command. For backend-only development use `npm.cmd run server`, or `npm.cmd run dev` for file watching. The backend defaults to port 3000; this checkout's `.env` may use **3001**. The startup command passes that same port to Expo automatically. Visiting the backend root redirects to the mobile preview. `MOBILE_WEB_URL` can change its destination when using another preview port or a deployed mobile web build.

During model warmup, Unframe first uses the configured Ollama GPU placement. If Ollama returns a model-runner error, startup retries once on CPU and keeps that CPU setting for the current process. If both attempts fail, the terminal includes Ollama's bounded local error detail and an `ollama run <model>` diagnostic command instead of hiding the HTTP 500 cause.

Museum-catalogue recognition uses OpenCLIP with a 5-second budget. General photo analysis uses its own 768-token output limit and a 125-second total budget including CPU model loading, with cancel/resume in Scan. The larger budget is a ceiling, not a speed promise; actual timings depend on hardware. Route preference understanding uses `qwen3:1.7b` with no automatic chat/route deadline. Run `npm.cmd run ai:verify:features` for recognition and planning checks, or `npm.cmd run ai:acceptance` to include general vision. Failed checks exit unsuccessfully and retain reports under `.local-ai`.

Scan automatically captures a frame when fast CLIP scene detection finds artwork or collection matching returns a candidate. The camera closes immediately, and recognition continues on that saved frame, including for unfamiliar works. Cancel or failure keeps the photo; **Scan again** explicitly reopens the camera. **Capture frame** is the manual fallback. A distinctive reference match returns collection notes immediately without running the vision model. Photos outside the active museum catalogue can still require slow CPU visual analysis; a description is not an artwork identification. The active catalogue has 8 Met, 4 GOMA and 3 QUT references. The separate Met training experiments do not automatically replace this index. See [auto-capture verification](verification/2026-10-18/auto-capture/README.md) and [Scan latency diagnosis](verification/2026-10-18/scan-latency/README.md).

After pulling an update, stop the existing backend and Expo terminals with Ctrl+C, then run `npm.cmd start`. Startup checks the backend's catalogue identity, Scan readiness and the Expo preview's backend settings; it refuses to silently reuse an incompatible session. Model weights and the compatible reference index remain on disk.

## Features

- QUT Art Museum: choose Brisbane → QUT Art Museum for the shared Home, Plan, Scan and Profile experience, with original illustrated artworks, AI routes and persistent saves. See [QUT integration and content sources](QUT-DEMO.md).
- Museum selection and isolated The Met / GOMA / QUT catalogues, artwork details and maps.
- Local OpenCLIP image matching and Ollama Qwen explanations grounded in verified catalogue notes.
- Qwen-assisted artwork selection with deterministic time and accessibility constraints for routes.
- Profile, local avatar editing, saved artworks, saved routes and recent activity.
- Northbank sample tours, preferences, speech and feedback drafts.

See [mobile documentation](mobile/README.md), [AI setup and validation](AI-INTEGRATION.md), and [GOMA sources](GOMA-DEMO.md).

## Data and services

Mobile profile data, avatars, bookmarks, route snapshots and optional visit history are stored with AsyncStorage on the device (localStorage in the web preview). They are **not synchronised to a backend database**. AI conversations remain in session memory; uploaded recognition photos are not persisted by Unframe.

Existing backend JSON APIs and saved data remain available for compatibility. These APIs persist changes to `data/unframe.json` using queued temporary-file replacement. Removing the desktop UI does not delete this file, `.env`, model downloads or the artwork vector index. The server has no account separation or database integration and is intended for one local process.

OpenCLIP defaults to `127.0.0.1:8001`; Ollama defaults to `127.0.0.1:11434`. No Google project, ADC, API key or paid account is required. Run `npm.cmd run ai:doctor` to check readiness, or `npm.cmd run ai:doctor -- --smoke` for real model checks. Historical deployment results and their limits are recorded in [AI-INTEGRATION.md](AI-INTEGRATION.md); they do not guarantee that services are currently running.

The Node server and models listen on loopback. A physical phone needs a reachable backend URL; see the mobile README before configuring native AI. Northbank is fictional demonstration content. Museum floor plans and indoor positioning are illustrative; similarity scores are not probabilities or accuracy.

## Project structure

```text
mobile/             The only UI: Expo native app and browser preview
server/             Node APIs, legacy JSON persistence and local AI adapters
shared/             Museum catalogues, types and deterministic route logic
local-ai/           Python OpenCLIP service
scripts/            Local setup, startup, indexing, doctor and preview tools
tests/              Backend and AI tests
mobile/tests/       Mobile unit tests
mobile/e2e/         Mobile browser journeys
data/               Local JSON data and generated artwork index (gitignored)
```

## Verification

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run mobile:check
npm.cmd run mobile:test
npm.cmd run mobile:export:web
npm.cmd run test:e2e
```

`test:e2e` and the default Playwright configuration now run the mobile browser suite. It uses the exported mobile bundle on port 8082 and an installed Chrome browser. To exercise Metro directly, use `npm.cmd run test:mobile:web-dev` instead. Backend API tests use an isolated temporary data directory; browser tests use isolated browser contexts. Model mocks in browser tests do not establish real model readiness.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Node API port (3001 in this checkout) |
| `MOBILE_WEB_URL` | `http://localhost:8081` | Backend browser redirect destination |
| `UNFRAME_DATA_DIR` | `data/` | Existing backend JSON store |
| `EXPO_PUBLIC_API_URL` | See mobile configuration | Mobile connection to the Node API |

Model configuration is described in `.env.example` and [AI-INTEGRATION.md](AI-INTEGRATION.md). Keep existing configuration and user data private.

To measure planning on your computer, run `npm.cmd run ai:routes:timing`. It measures first/repeat combined visits in `.local-ai/acceptance/visit-*.json`: answer-ready time, complete-route time and graph time after the answer, including any bounded retry after output truncation. Planning defaults to 1024 output tokens and a separate 4096-token context; model warm-up is reported separately.
