# Google AI integration — implementation and setup

## 1. Architecture

This extends the existing Node HTTP server and Expo/React Native Web interface. The original Northbank curator workspace, local visitor storage, catalogue guide and native photo lookup remain available.

**Recognition:** Web camera/upload → validated multipart request → fully decoded JPEG with metadata stripped → Vertex `multimodalembedding@001` → cosine search in the JSON embedding index → matching record in the selected museum catalogue → Gemini `gemini-3.8-flash` structured interpretation → separate catalogue/AI sections in Scan.

Gemini never identifies the photographed artwork. A score below `ARTWORK_MATCH_THRESHOLD` returns no match. The score is cosine similarity, not calibrated probability. If explanation generation fails after a match, the API returns the catalogue artwork and a warning. An unavailable embedding provider or missing index is reported without inventing a result. Photos are held in memory for the request; Unframe does not persist them. They are sent to Google, subject to your Google Cloud configuration and terms.

**Planning:** Preferences → Gemini recommendations restricted to supplied catalogue IDs → validated shortlist → exact itinerary search over up to eight candidates → Dijkstra paths between stops → time/accessibility checks → ordered itinerary, walking legs and overlay on the existing demo map. Gemini does not calculate physical paths. The original deterministic preference planner supplies recommendations if Gemini fails. The result ends at its last stop; it does not include a return walk.

## 2. Files changed

| File | Change |
| --- | --- |
| `.env.example` | Server configuration template; no secrets. |
| `.gitignore` | Excludes environment secrets, credential files and temporary index writes. |
| `package.json` | Google auth/image decoder dependencies, indexing and AI test scripts; AI tests included in `npm test`. |
| `package-lock.json` | Locked runtime dependencies. |
| `server/index.js` | Routes `/api/ai/*` to the dedicated handler before the original JSON-only routes. |
| `server/ai/config.js` | Root `.env` loading, model/region/threshold configuration, safe errors/logging. |
| `server/ai/google.js` | Shared ADC-authenticated Vertex REST transport and timeout. |
| `server/ai/images.js` | Multipart limits, MIME/signature/full image decoding, EXIF removal and JPEG normalization. |
| `server/ai/embeddings.js` | Vertex embedding generation, cosine similarity and versioned JSON vector store. |
| `server/ai/gemini.js` | Grounded explanation/recommendation prompts, response schemas and output validation. |
| `server/ai/recognition.js` | Vector match, threshold and explanation fallback. |
| `server/ai/graph.js` | Dijkstra with accessibility and distance/time weights. |
| `server/ai/routes.js` | Preference validation, local recommendation fallback and constrained itinerary search. |
| `server/ai/handler.js` | Recognition/planning/catalogue endpoints, origin allowlist, two-request concurrency bound and sanitized errors. |
| `shared/met-collection.json` | Shared Met records (now eight artworks) moved out of the frontend into a shared catalogue. |
| `shared/met-graph.json` | Clearly marked demo nodes, artwork positions, distances and accessible edges. |
| `shared/ai-types.ts` | Frontend API result types. |
| `scripts/index-artworks.mjs` | Generates/replaces the catalogue embedding index from bundled reference images. |
| `mobile/src/museum.ts` | Imports the shared Met catalogue instead of duplicating it. |
| `mobile/src/ai.ts` | Public API URL, multipart/JSON requests and network errors. |
| `mobile/src/components/CameraCapture.web.tsx` | Browser permission, preview, capture and media-track cleanup. |
| `mobile/src/components/FloorPlan.tsx` | Optional navigation-path overlay using demo graph positions. |
| `mobile/src/screens/Lookup.web.tsx` | Camera/upload, explicit recognition submission, progress, catalogue result, AI interpretation and errors. |
| `mobile/src/screens/Lookup.tsx` | Preserves the existing native manual lookup via platform resolution. |
| `mobile/src/screens/Modals.tsx` | Names the existing native lookup; updates About/privacy text. |
| `mobile/src/screens/AIPlanner.tsx` | Preference form and route request; navigates to the itinerary screen on success. |
| `mobile/src/screens/AIItinerary.tsx` | Separate result screen with route map, ordered stops and a return action that preserves planner preferences. |
| `mobile/src/screens/Museum.tsx` | Adds Plan a Met visit to the existing museum screen. |
| `mobile/src/model.ts` | Adds the planner navigation route. |
| `mobile/App.tsx` | Registers planner and platform-specific Scan screen. |
| `mobile/package.json` | Adds a web-only export command; native scripts stay unchanged. |
| `tests/ai.test.js` | Mocked provider/service and actual HTTP handler tests. |
| `mobile/e2e/ai.spec.js` | Browser permission, cleanup, upload/result/error and route UI tests with mocked API responses. |
| `mobile/e2e/mobile.spec.js` | Updates the existing scan-entry check to the web upload button label. |
| `README.md` | Main setup entry point and runtime dependency clarification. |
| `mobile/README.md` | Web AI startup, camera, privacy and feature documentation. |
| `AI-INTEGRATION.md` | This implementation report and setup guide. |

## 3. Configuration

Copy `.env.example` to `.env` in the **repository root**. Existing process environment variables take precedence. Restart the Node server after editing.

| Variable | Value / purpose |
| --- | --- |
| `GOOGLE_CLOUD_PROJECT` | Your enabled, billed Google Cloud project ID. Required for Google calls. |
| `GOOGLE_CLOUD_LOCATION` | Embedding region, example `us-central1`. |
| `GEMINI_LOCATION` | `global` by default; distinct from embedding location. |
| `GEMINI_MODEL` | `gemini-3.8-flash`, configurable. |
| `VERTEX_MULTIMODAL_EMBEDDING_MODEL` | `multimodalembedding@001`, configurable; changing it requires rebuilding the index. |
| `ARTWORK_MATCH_THRESHOLD` | `0.80` default; tune against representative museum photos. |
| `ARTWORK_EMBEDDINGS_FILE` | Optional absolute or working-directory-relative index path; default `data/artwork-embeddings.json`. |
| `AI_ALLOWED_ORIGINS` | Comma-separated web origins, default local development/test origins in `.env.example`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional server-side credential file path outside the repo; prefer ADC login or attached identity. |
| `PORT` | Existing API port, default `3000`. |
| `UNFRAME_DATA_DIR` | Existing data directory override; also determines default embedding index directory. |

The frontend optionally accepts **only** `EXPO_PUBLIC_API_URL`, for example `http://127.0.0.1:3001`, in `mobile/.env.local`. Rebuild/restart Expo after changing it. Localhost/127.0.0.1 default to port 3000; deployed builds default to same-origin `/api/ai`. Never place Google credentials, model keys or private tokens in Expo public variables.

## 4. Google Cloud setup

Enable billing and **Vertex AI API (`aiplatform.googleapis.com`)** in your project. No Google Vision API, Maps API, Cloud Storage bucket or managed Vector Search index is required: the integration sends inline image bytes and searches a local vector file.

Using the Google Cloud CLI (replace `YOUR_PROJECT_ID`):

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com --project YOUR_PROJECT_ID
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

The runtime identity needs Vertex AI prediction access, normally `roles/aiplatform.user`, and quota-project service usage access where applicable (`roles/serviceusage.serviceUsageConsumer`). Enabling services requires a project administrator or a role with service-enable permission. For deployment, attach a suitable service identity and use ADC rather than distributing a JSON key. Do not paste credentials into chat or commit them.

Verified Google documentation:

- [Gemini 3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash): model ID `gemini-3.8-flash`, structured output, global/us/eu availability. This code defaults to `global`.
- [Multimodal embeddings REST API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/multimodal-embeddings-api): `multimodalembedding@001:predict`; 1408-dimensional image embeddings; JPEG/PNG. WebP uploads are decoded and converted to JPEG before this call.
- [Structured output](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output): JSON response schema.
- [Application Default Credentials](https://cloud.google.com/docs/authentication/provide-credentials-adc): local login and workload identity options.

Endpoints used on the server:

```text
POST https://{embedding-region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{embedding-region}/publishers/google/models/{embedding-model}:predict
POST https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/publishers/google/models/{gemini-model}:generateContent
```

For regional Gemini configuration the host becomes `{region}-aiplatform.googleapis.com`. Verify your project's region, model access, quota and billing in Google Cloud.

## 5. Database / schema

No SQL migration or replacement database. Existing `data/unframe.json` and mobile `unframe.mobile.v1` storage are unchanged.

The Met `Artwork` records are shared in `shared/met-collection.json`; source-backed title/artist/year/medium are separate from prototype interpretive text. The existing Northbank curator catalogue remains separate. AI does not overwrite either catalogue.

The generated index has `{version:1, model, dimension:1408, generatedAt, records:[{artworkId,imageHash,vector}]}`. Only reference-image vectors are persisted. Index reads check version/model/dimensions; regeneration writes a temporary file and replaces the index only after all reference calls succeed. Re-run indexing after changing source images or embedding model. Do not run multiple indexing processes simultaneously. No generated fake vectors are shipped.

`shared/met-graph.json` separates illustrative positioning from catalogue facts. All floor positions, edge distances/travel times and accessibility flags are demo data; GPS is not used as indoor coordinates.

## 6. Exact run commands

In PowerShell, from a fresh checkout:

```powershell
cd D:\FlyFly\Study\Project\Unframe
npm.cmd ci
npm.cmd --prefix mobile ci
Copy-Item .env.example .env
notepad .env
```

Set `GOOGLE_CLOUD_PROJECT` and complete ADC setup above. Do not overwrite an existing configured `.env` when updating an installation.

Generate the catalogue index once (this makes **twelve billable embedding requests**, one per bundled artwork):

```powershell
npm.cmd run ai:index
```

Terminal 1, repository root:

```powershell
npm.cmd start
```

Terminal 2, repository root:

```powershell
npm.cmd run mobile:web
```

Open **http://localhost:8081**. Choose **Start visit → Scan → Take photo**, allow permission, capture, then **Identify artwork**. Upload JPEG/PNG/WebP is also available (5 MB max). Browser camera permission is user controlled and requires localhost or HTTPS; permission denial never blocks manual browsing.

For routes choose **Plan a Met visit**, set preferences, then **Generate route**. Successful generation opens a separate itinerary screen with the map and ordered stops. **Edit visit preferences** returns to the existing form with your choices preserved. Errors stay on the form for retry. The backend remains usable without Google configuration: routes return a labelled local fallback; recognition explains the missing index/provider configuration. Without running the backend, the UI shows a connection error with a startup hint.

## 7. Requests and tests

Recognition, from the repository root:

```powershell
curl.exe -X POST http://127.0.0.1:3000/api/ai/artworks/recognise -F "image=@mobile/assets/water-lilies.jpg;type=image/jpeg"
```

Optional multipart field: `visitorPreferences`, a JSON string array such as `["Nature"]`. Response: `{matched,similarity,artwork,aiExplanation,interpretationLabel,warning?}`; low confidence gives `{matched:false,message}`. Wrong/malformed uploads return 400/415, oversized uploads 413, missing configuration/index 503, and provider timeout 504.

Route planning:

```powershell
$visit = @{
  interests = @('Nature', 'Claude Monet')
  availableMinutes = 30
  currentLocation = 'entrance'
  walkingPreference = 'less_walking'
  accessibilityRequirements = @('step_free')
  mustSeeArtworkIds = @('water-lilies')
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/ai/routes/plan -ContentType 'application/json' -Body $visit
```

Valid current locations and artworks are returned by `GET /api/ai/catalogue?museumId=met` or `?museumId=goma`. Recognition uses the same query parameter; route planning takes `museumId` in the JSON body. Omission defaults to Met. A route returns `estimatedMinutes`, `estimatedWalkingDistance` (metres), ordered `route`, `navigation`, `recommendationSource`, `reasoningSummary`, `demo` and optional warning. Unsupported IDs/preferences return 400; infeasible budgets, unreachable must-sees or disconnected starts return 422. Only `step_free` and `wheelchair` accessibility requirements are currently supported.

Automated checks (Google APIs are mocked; no paid calls):

Validated in this workspace: 35 Node tests (including 20 AI tests), 10 mobile state/location tests, 18 browser cases against the real Expo development server (17 in the main run and the GOMA itinerary case in a successful targeted rerun), TypeScript checks, existing JavaScript checks, and web export. Camera capture used Chrome's simulated camera device, not a physical device. A running local backend also returned a three-stop, 15-minute, 89 m demo route with `recommendationSource: local` while Google was unconfigured.

```powershell
npm.cmd test
npm.cmd run mobile:test
npm.cmd run mobile:check
npm.cmd run check
npm.cmd run mobile:export:web
npm.cmd run test:mobile:e2e
npm.cmd run test:mobile:web-dev
```

For the web export, the unambiguous alternative is `cd mobile` then `npx.cmd expo export --platform web`. Browser tests require locally installed Chrome. API tests exercise the actual HTTP handler with injected mock Google transport. UI tests mock API results; they do not claim live model quality.

## 8. Remaining limitations

- Real Google API calls have **not** been executed or validated with project credentials in this implementation session. You must configure ADC/project/billing/model access and run indexing before live recognition works.
- Eight reference artworks only. Catalogue text is prototype interpretation, not museum-approved material. Evaluate similarity threshold and ambiguous/low-quality photographs against a real validation set before extending recognition.
- Gemini responses have schema/ID validation and grounded prompts, but factual accuracy still needs museum review. The historical-context prompt asks the model to acknowledge absent information.
- Routing uses a small eight-candidate shortlist and exact search, suitable for this demo, not a scalable whole-museum optimiser. Graph distances, walking times and step-free flags require real survey data. There is no live indoor navigation or entrance-return guarantee.
- Browser camera integration is the target of this change. Native Expo Go photo lookup retains its manual matching flow; no native camera permission configuration was changed. The original catalogue chat remains deterministic; the new Gemini calls power recognition explanations and route recommendations.
- API server is the existing loopback-only local prototype. Public deployment needs HTTPS, authenticated users, request quotas/rate limiting, provider budget controls, an appropriate data retention policy and protected curator routes. Concurrency is bounded, but it is not a public multi-user access-control system. Proxy `/api/ai` to Node or configure the public API URL and exact origin allowlist.
- No Google Maps or new museum data source was connected. Current location choices are explicit demo graph nodes. Plans and recognition results are session-only; bookmarks and existing local state retain their established persistence behaviour.

## Brisbane GOMA addition

The app now supports eight Met works and four GOMA demo works from the QAGOMA Collection. Museum metadata is in `shared/museums.json`, GOMA works in `shared/goma-collection.json`, and its independent illustrative layout in `shared/goma-graph.json`. The server registry in `server/ai/catalogues.js` isolates recognition and route services by museum. See [GOMA-DEMO.md](GOMA-DEMO.md) for sources, switching, GPS limitations and image credits. The result page retains its own museum ID when navigating. Unknown museums and cross-museum must-see IDs are rejected. The native camera configuration is unchanged.
