# Unframe

Unframe is a React Native / Expo museum companion. **The mobile app is the only user interface**, including when opened in a computer browser. The former independent desktop website and curator interface have been removed.

## Run on Windows

Requires Node.js 22 or later. For a fresh checkout:

```powershell
npm.cmd ci
npm.cmd --prefix mobile ci
npm.cmd run ai:setup
```

Start the backend and local models in one terminal:

```powershell
npm.cmd run ai:up
```

Start the mobile preview in another:

```powershell
npm.cmd run mobile:web -- --port 8081
```

Open **http://localhost:8081**. Wide browser windows show the same mobile screens inside a phone frame. For Expo Go on a physical phone, use `npm.cmd run mobile` and follow [mobile setup](mobile/README.md).

`npm.cmd start` starts only the Node backend; `npm.cmd run dev` starts it with file watching. They do not start Expo or the model services. The backend defaults to port 3000; this checkout's `.env` uses **3001**, matching `mobile/.env.local`. Visiting `/` or `/index.html` on the backend redirects to the mobile preview. Keep Expo running for this redirect to work. `MOBILE_WEB_URL` can change its destination when using another preview port or a deployed mobile web build.

## Features

- Museum selection and isolated The Met / GOMA catalogues, artwork details and maps.
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
