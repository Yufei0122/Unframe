# Unframe

A responsive museum companion with a local Node.js backend, persistent visitor data, and a curator workspace. Built from the Unframe proposal and the MONA *The O* case study.

## Local AI and browser camera

The **Scan** screen samples the camera view and suggests artworks using local **OpenCLIP ViT-B-32 / laion2b_s34b_b79k**. Choose a candidate to confirm the artwork and request an **Ollama qwen3:4b** explanation grounded in catalogue notes. Scanning supports pause/resume and photo upload. Choose **The Met** (eight artworks) or **Brisbane GOMA** (four QAGOMA works). The **Plan** tab uses Qwen to discuss preferences and select recommended works; the existing deterministic planner enforces time and accessibility constraints. See **[GOMA sources](GOMA-DEMO.md)** and **[AI setup and verification](AI-INTEGRATION.md)** for configuration, indexing, tests and limitations.

**Beyond the demo collection:** uploaded photos without a local match, or **Analyse any artwork**, use local **Qwen3-VL 4B** for visual observations and tentative identity suggestions. The backend searches The Met, the Art Institute of Chicago and Wikimedia Commons using suggested titles/artists, then compares up to three public reference images with OpenCLIP when available. Uncertain identities remain explicitly unconfirmed. No photograph is sent to these public search services. This supports investigating arbitrary images; it cannot guarantee the identity of every artwork.

For an existing installation, run `npm.cmd run ai:setup:vision` once (the default vision download is approximately 3.3 GB). Stop the old backend/Expo terminals, then run **`npm.cmd run ai:web`** to start models, backend and Expo together, with the browser API URL automatically set to the backend's configured port. Keep that terminal open. The same AI commands work from `mobile`. Use `npm.cmd run ai:doctor -- --vision` for a real HTTP/vision check; see [the general-analysis workflow and verification limits](AI-INTEGRATION.md#general-artwork-analysis) before treating suggestions as identified artworks.

From the project root, run `npm.cmd install`, then `npm.cmd run ai:setup` to install Python dependencies and download the public models. Run `npm.cmd run ai:up` to check/start local model services, build a compatible 512-dimensional index when needed, and start Node at http://127.0.0.1:3000. In another terminal run `npm.cmd run mobile:web -- --port 8081` and open http://localhost:8081. No Google project, ADC, API key or paid account is required; Python virtual-environment activation is automatic.

Run `npm.cmd run ai:doctor` for service/model/index readiness, or `npm.cmd run ai:doctor -- --smoke` for real embedding and structured Qwen checks. Opening Scan with camera access sends sampled frames to local services; Unframe does not persist them. Similarity is not probability or accuracy. CPU timeouts, service reuse, privacy and deployment evidence are documented in [AI-INTEGRATION.md](AI-INTEGRATION.md).

For **AI route planning only**, use `npm.cmd run ai:routes:verify`: it starts/reuses local Qwen, checks actual Chinese chat and constrained routes for both museums, then starts Expo. It does not require image models or an artwork embedding index. `npm.cmd run ai:routes` starts without repeating acceptance. [Route acceptance](AI-INTEGRATION.md#route-planning-independent-startup-and-strict-model-acceptance) requires Qwen results rather than counting a local-rule fallback as model success; reports are saved under `.local-ai/acceptance/routes-*.json`.

**Verified on this Windows checkout (2026-10-11):** mobile web is at http://localhost:8081 and its new backend at http://127.0.0.1:3001, because the preexisting port-3000 server was preserved. The local `.env` and mobile API URL are configured accordingly. Both models, the twelve-artwork index, real explanations/routes and the corrected Chinese planning chat were exercised. See the [deployment evidence and limits](AI-INTEGRATION.md#verified-windows-deployment--2026-10-11-australiabrisbane) for test results and retained first-failure/retest records.

## iPhone / mobile app

The native iOS and Android app is in **[mobile/](mobile/README.md)**. It uses React Native and Expo, includes native navigation, camera/photo access and speech, and keeps visitor data on the device.

```powershell
cd mobile
npm.cmd ci
npm.cmd start
```

Scan Expo’s QR code on your iPhone. See the mobile README for Expo Go compatibility, Windows setup and iOS build instructions. The commands below run the separate web application and curator workspace.

## Run locally

Requires **Node.js 22 or later**. Run `npm install` first. The original curator workspace needs no model services; optional mobile AI uses local OpenCLIP, Ollama and image-decoding dependencies.

```sh
npm start
```

Open **http://127.0.0.1:3000**. In Windows PowerShell, use `npm.cmd start` if execution policy blocks `npm.ps1`. For server auto-restart during development, use `npm.cmd run dev`; refresh the browser after frontend changes.

Keep the terminal open while using the app. If this workspace is already running, `npm start` prints its existing URL and exits successfully instead of starting a duplicate server. To switch to development mode, stop the original server with `Ctrl+C` first.

Open the HTTP address above, not `public/index.html` directly or through VS Code Live Server: the app requires its Node.js API. If another application occupies the port, startup explains how to select a different port.

The server listens only on the local loopback address. To use another port in PowerShell:

```powershell
$env:PORT = '3001'
npm.cmd start
```

## What works

- **Discover:** featured exhibition, searchable collection, filters by medium, artwork details and saved favourites.
- **Explore:** interactive sample floor plan, room selection, tour planning by time/interests/step-free access, stop completion and skipping.
- **AI Guide:** conversational interface that retrieves sample collection notes, displays their sources, and acknowledges unsupported questions.
- **My Visits:** persistent bookmarks and optional reflections for completed visits.
- **Preferences:** visitor name, interests, duration, step-free routes, larger text, reduced motion, and history controls.
- **Museum workspace:** edit interpretation and source attribution, review visitor feedback, resolve or reopen reports. Updated notes are immediately available to the guide.
- **Artwork lookup:** local photo preview and manual matching to an artwork. Images are not uploaded.
- **Audio:** browser text-to-speech when supported by the device.

The interface adapts to desktop and mobile screens. It includes semantic navigation, labelled controls, keyboard-accessible native dialogs, a skip link, live notifications, and reduced-motion support.

## Try a complete visit

1. Select **Plan my visit** and choose your time, interests and access requirements.
2. Explore the suggested works. Select **Explored** for the ones you visit, or **Skip** for the others.
3. Finish the visit to see its reflection in **My Visits → Past visits**.
4. Open an artwork and select **Ask the guide** to read its collection notes with sources.
5. Submit feedback from the artwork dialog. Open **Museum workspace → Visitor feedback** to review it.
6. Edit a note in **Collection & sources**, then ask the guide about that work again.

On mobile, the museum workspace is accessible from **Preferences** or the **About this prototype** dialog.

## Project structure

```text
public/
  index.html          Application shell
  app.js              Screens, dialogs, navigation and API integration
  styles.css          Responsive visual system
  assets/             Six original SVG artwork illustrations and brand mark
server/
  index.js            HTTP server, API validation and persistence
  domain.js           Route planner and collection-grounded guide
  seed.js             Fictional museum collection and default preferences
tests/
  domain.test.js      Route and guide behaviour
  api.test.js         API, validation, privacy and persistence tests
e2e/
  experience.spec.js  Desktop and mobile browser journeys
playwright.config.js  Browser test configuration
data/
  unframe.json        Local state, generated on the first write; gitignored
```

The client calls same-origin JSON APIs. The server separates collection/visitor data from route and guide logic. State changes are queued and written through a temporary file before replacing the JSON store. This persistence model is intended for **one local server process**, not concurrent production instances.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/state` | Collection, preferences, bookmarks, visits and feedback |
| PATCH | `/api/preferences` | Update visitor preferences |
| POST | `/api/saved` | Toggle an artwork bookmark |
| POST | `/api/routes` | Plan a route from duration, interests and access preferences |
| POST | `/api/guide` | Retrieve collection-grounded responses and sources |
| POST | `/api/visits` | Create a reflection; retain it only when history is enabled |
| DELETE | `/api/visits` | Delete retained visit history |
| POST | `/api/feedback` | Submit feedback |
| PATCH | `/api/feedback/:id` | Resolve or reopen feedback |
| PATCH | `/api/artworks/:id` | Update interpretation and source attribution |

Mutations accept JSON objects. Invalid inputs return a readable error. The server rejects cross-origin mutations and serves a restrictive content security policy. **There is no authentication or separation between visitor and curator privileges in this local prototype.**

## Tests

Install the development-only browser testing dependency:

```sh
npm ci
npm run check
npm test
npm run test:e2e
```

On Windows, substitute `npm.cmd`. Browser tests use an installed Google Chrome browser via Playwright’s `chrome` channel. Tests run against their own server on port 3011 and use `.test-data/`, keeping normal application data untouched. API tests use a temporary data directory and port. Screenshots and failure traces go into `test-results/`.

Coverage includes time budgets, interest prioritisation, step-free routes, source provenance, unsupported questions, persistent saves, history consent, feedback review, curator edits, rejected cross-origin requests, and complete visitor workflows at desktop and mobile sizes.

## Data and prototype boundaries

**Northbank Gallery, all artists, artworks and curatorial notes are fictional demonstration content.** The illustrations are original code-native SVG assets, bundled locally; the app does not depend on remote images or fonts.

- The guide uses deterministic catalogue retrieval, **not a connected generative AI model**. Reflections use a template. These limits are visible in the interface.
- The floor plan is illustrative. Visitors select rooms manually; no live GPS or indoor location is collected. Routes rank interests, exclude inaccessible works when requested, respect the time budget, and order stops by room. Each transition uses a two-minute estimate, not measured walking distance.
- Active routes and conversations are session-only. Bookmarks, preferences, feedback, edited notes and optional completed visits persist on the server.
- History consent affects future visits. Existing history can be explicitly deleted in Preferences.
- Browser image recognition and AI route recommendations are integrated separately in the mobile web app; see [AI integration](AI-INTEGRATION.md). Companion tracking, social discovery, real museum discovery, accounts, staff roles and content version history remain future integrations.
- Browser speech synthesis depends on available device voices. Reading the full text is always possible.

Before a public release, add authenticated visitor and curator roles, a database with per-user access controls and migrations, museum-approved source ingestion, versioned review workflows, an evaluated AI provider integration, real gallery topology and positioning, and operational monitoring. Work with museum stakeholders to test accessibility and content quality.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Local HTTP port |
| `UNFRAME_DATA_DIR` | `data/` in this project | Location of the JSON store |

The original curator workspace requires no model services; mobile AI uses the local services described above. Keep the contents of the data directory private; feedback and visitor preferences are stored there.
