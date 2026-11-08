# CAB432 A3 Gradescope source simplification report

Completed 1 November 2026. **PASS for local source simplification, independent checks and ZIP packaging. Gradescope acceptance remains unverified.**

New archive: `D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\CAB432-A3-Submission-recognition-only.zip` (8,277,569 bytes; 7.89 MiB).
SHA-256: `8dc53b02710ef82291c20b1f52f5004d74e663d5bfd136958882a42243335bf2`.

## Scope and authorization

The user explicitly authorized the scoped simplification after automatic approval review initially rejected the attachment-only authorization. The changes are now applied only inside the separate `CAB432-A3-Submission/app/` copy. The earlier BLOCKED report and proposed patch are superseded by this final report and the actual hash inventory; the old draft patch is not a final patch to apply.

Original Unframe application and evidence: **878 protected file hashes unchanged**. Original ZIP and infrastructure YAML unchanged. This report, local audit helpers and validation receipts are the only intended additions/updates in the original project's final-submission documentation area. No commit/push, AWS resource modification, image deployment, retagging or load test occurred. See the browser-cache incident below for unintended blocked network attempts during an early test.

## Dependency analysis and retained functionality

[Before dependency graph](gradescope-simplification/dependency-graph-before.json), [after graph](gradescope-simplification/dependency-graph-after.json), and [complete file-by-file change/retention inventory](gradescope-simplification/file-change-inventory.md).

| Dependency chain | Applied decision |
| --- | --- |
| App navigation → AIPlanner/AIItinerary/SavedRoutes/Explore/legacy Discover → planning client/state | Remove the planner UI, tour navigation, saved-route state and exclusively planning components. Discover was an unregistered legacy tour screen; Museum Home remains. |
| AI handler → chat/routes → graph/Dijkstra/constraints | Remove planning endpoints and route algorithms. Recognition, Analyse, confirmation, request validation/cancellation and errors remain. |
| Undeployed cloud Planning adapter → shared AI factories | Remove `server/cloud/planning.js`, its tests and deployment templates. Jobs handler and shared services remain. |
| Recognition/confirmation → Ollama explanation factory → provider/Bedrock generator | Keep artwork schema, strict validation, grounded explanation and shared provider seam. Remove factory's planning methods/schemas only. |
| Museum → FloorPlan/GalleryFloorPlan → museum graph JSON | Keep map data, room/floor coordinates, floor-plan components and assets. They remain necessary for browsing even without a tour algorithm. |
| Scan/Lookup → camera + webScanTransport + recognitionJobs → Jobs Lambda → S3/SQS → worker → OpenCLIP/S3 Vectors/Bedrock → DynamoDB/cleanup | Preserve production implementations byte-for-byte; exercise behavior through unit, mocked browser and offline Docker tests. |
| Artwork guide/details → shared catalogue/guideReply/profile | Keep descriptions, source attribution, speech, bookmarks, visits and profile state. Remove stale tour directions only. |

Exactly **25 files removed, 67 existing files modified, 2 regression tests added**. Every path and modification reason is in the linked inventory. **296 application files remain**, including all required runtime sources, public artwork assets, catalogues, npm manifests/locks, Python requirements, Dockerfiles and supporting configuration. No images were removed.

Both npm lockfiles are unchanged and match their manifests. No external package was proven exclusive to deleted planning functionality: AWS SDKs support Jobs/worker/Bedrock, Ajv supports strict AI validation, Sharp supports image preprocessing, navigation/state/Expo packages support surviving UI and camera, OpenLayers/SVG support maps, and Playwright/TypeScript/tsx support tests/builds. Python dependencies and fixed CPU PyTorch/OpenCLIP build configuration are unchanged. Only obsolete npm scripts were removed; lock regeneration was unnecessary.

Shared provider/config internals retain inert compatibility fields such as `planningNumPredict` and a generic `planning=false` generator argument. No surviving UI, endpoint or exported planning-service method calls those branches. They were retained to avoid expanding changes to the working Bedrock/recognition boundary; this is not a claim that every occurrence of the word planning was removed. Historical deployment documents carry a superseding scope notice instead of rewriting historical facts.

## Independent verification in the separate copy

| Check | Result and evidence |
| --- | --- |
| Root and mobile clean dependency installation | PASS: `npm.cmd ci --no-audit --no-fund` in each directory; 81 and 822 packages respectively. Existing transitive deprecation warnings remain. |
| Root regression suite, including AWS/recognition/Bedrock/Jobs/worker | PASS: **115 passed, 1 skipped, 0 failed** out of 116. [Receipt](gradescope-simplification/node-tests-final.txt). |
| Mobile state, capture and transport tests | PASS: **31/31**. [Receipt](gradescope-simplification/mobile-tests-final.txt). |
| Node syntax and TypeScript | PASS: `npm.cmd run check`, mobile `npm.cmd run check`; final static audit also syntax-checks 101 JS/MJS files. |
| Relative import graph | PASS: no unresolved static relative imports; TypeScript/export/runtime checks supplement the regex graph. |
| Local-mode browser regression | PASS after fixes: 33/35 initially passed; the 2 QUT failures expected the intentionally removed Plan tab. All 3 QUT cases passed after updating those assertions. **35 unique local cases passing across the main run and targeted rerun**, not one all-green original run. [Main](gradescope-simplification/browser-regression-isolated.txt), [QUT rerun](gradescope-simplification/browser-qut-final.txt). |
| Jobs-mode browser regression | PASS: **3/3**, explicitly enabled with `UNFRAME_CLOUD_WEB_TEST=1`, reserved test API hostname, request mocks and AWS-domain guard. Covers raw PUT, polling, candidate confirmation, cancellation, scan-again and separate Analyse. [Receipt](gradescope-simplification/browser-cloud-final-enabled.txt). |
| Planner-free browser navigation | PASS in local and Jobs modes. Initial exact-label selector was repaired for the accessible icon-prefixed Scan label. [Jobs/scope receipt](gradescope-simplification/browser-jobs-final.txt). The 3 gated cloud tests in that receipt were skipped and subsequently explicitly enabled/passed in the preceding row. |
| Expo web exports | PASS: cache-cleared local and Jobs modes; final Jobs bundle verified `mode:"jobs"` and `https://jobs.example`. [Local](gradescope-simplification/web-export-local-clear.txt), [Jobs](gradescope-simplification/web-export-jobs-retry.txt). |
| Linux/amd64 worker production Dockerfile | PASS, local image `unframe-worker:submission-audit`; no registry push. [Build](gradescope-simplification/worker-build.txt). |
| Linux Node 22 Lambda build | PASS, `deployment/lambda/Dockerfile --target build`; native dependencies installed, Jobs handler smoke passed, ZIP produced inside local image. No deployment or nested ZIP in source submission. [Build](gradescope-simplification/lambda-build.txt). |
| Offline real OpenCLIP under limits | PASS at **0.5 vCPU / 2 GiB**, network disabled, Linux x64, Node22.23.4, UID10001, one CPU thread. ViT-B-32 / laion2b_s34b_b79k, 512D, norm **1.0000000327253133**, startup **81.705s**, health check PASS, exit0. [Receipt](gradescope-simplification/worker-smoke.txt). |
| Final source/secret/hash/lock/scaling checks | PASS. [Receipt](gradescope-simplification/final-source-validation.json). |

The root/mobile host regression runs used Node25.9.0, not Node22. Linux Node22 was exercised by the Lambda build/smoke and worker OpenCLIP smoke. The one skipped test requires a host managed Python `.venv` for stdin-EOF behavior; it was not counted as a pass. The Docker smoke uses actual OpenCLIP inference and health checks, not the production SQS polling loop or a real AWS vector query. No peak RSS measurement or new live recognition/Analyse claim is made.

### Test issues found and resolved

An early Metro export reused stale environment transforms: the local browser suite saw a Jobs-mode bundle containing the existing public API URL. Three `/a3/jobs` POST attempts appeared with no HTTP response; browser diagnostics reported missing CORS allow-origin. No successful create response, raw upload or completed job was observed. We cannot infer a successful live job from these failures, nor claim that absolutely no network traffic reached AWS. Sanitized [network](gradescope-simplification/stale-cache-network-check.json) and [CORS](gradescope-simplification/stale-cache-cors-check.json) receipts preserve the observation. Subsequent tests use reserved `jobs.example`, clear Metro caches, verify bundled mode/hostname, and block AWS/CloudFront domains at the shared browser fixture before installing specific mocks.

The final multi-worker Expo export failed with `FATAL ERROR: Zone Allocation failed - process out of memory` in local Metro workers. Repeating the build with `--max-workers 1` passed. This was a host build-process failure, not an ECS/OpenCLIP OOM; no runtime limits or recognition behavior were changed. The failed log remains [available](gradescope-simplification/web-export-jobs-final.txt).

The mixed recognitionJobs unit suite contained an obsolete saved-route snapshot test, removed with that feature. New regression coverage verifies legacy route fields are ignored while bookmarks/preferences/feedback survive. Camera, Scan, recognition and Analyse implementations were not rewritten to satisfy the removed-navigation assertions.

### Reproduction commands used

Run from the separate `app/`; these are local tests/builds. Mode-specific browser commands require the matching preceding export.

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd --prefix mobile ci --no-audit --no-fund
node --test tests/*.test.js
npm.cmd run check
npm.cmd --prefix mobile test
npm.cmd --prefix mobile run check
$env:EXPO_PUBLIC_API_URL='https://jobs.example'
$env:EXPO_PUBLIC_RECOGNITION_MODE='local'
npm.cmd --prefix mobile run export:web -- --clear
npx.cmd playwright test --config playwright.mobile.config.js mobile/e2e/ai.spec.js mobile/e2e/general-artwork.spec.js mobile/e2e/goma.spec.js mobile/e2e/mobile.spec.js mobile/e2e/profile-pages.spec.js mobile/e2e/qut.spec.js mobile/e2e/submission-scope.spec.js
# Targeted rerun after QUT assertion repairs:
npx.cmd playwright test --config playwright.mobile.config.js mobile/e2e/qut.spec.js
$env:EXPO_PUBLIC_RECOGNITION_MODE='jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS='300000'
npm.cmd --prefix mobile run export:web -- --clear --max-workers 1
$env:UNFRAME_CLOUD_WEB_TEST='1'
npx.cmd playwright test --config playwright.mobile.config.js mobile/e2e/cloud-scan.spec.js
```

Docker commands used the Desktop Linux Engine explicitly and a temporary empty Docker config (`{}`, no credentials/helper). With `$app` set to the absolute separate source directory and `$cfg` the temporary empty config directory:

```powershell
docker --config $cfg --host npipe:////./pipe/dockerDesktopLinuxEngine build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:submission-audit .
docker --config $cfg --host npipe:////./pipe/dockerDesktopLinuxEngine build --platform linux/amd64 -f deployment/lambda/Dockerfile --target build -t unframe-jobs:submission-audit .
docker --config $cfg --host npipe:////./pipe/dockerDesktopLinuxEngine run --rm --platform linux/amd64 --network none --cpus 0.5 --memory 2g --memory-swap 2g --mount "type=bind,source=$app/scripts,target=/app/scripts,readonly" unframe-worker:submission-audit node scripts/smoke-worker.mjs
```

Generated `node_modules` (root/mobile), `mobile/dist`, `mobile/.expo` and `test-results` were removed only from the separate copy after validation. Reinstall dependencies to rerun checks. Original repository validators hardcode the original snapshot/evidence paths; they were not misreported as validation of this different copy. The copy-specific read-only audit and exclusive-create packager are saved as `gradescope-simplification/audit-cleaned.py` and `package-cleaned.py`; the latter refuses to replace any existing ZIP.

## ZIP integrity and comparison

| Property | Original | Cleaned |
| --- | --- | --- |
| Application source files | 319 | 296 |
| Files including YAML | 320 | 297 |
| Archive entries including directories | 346 | 298 |
| Archive bytes | 8,409,004 | 8,277,569 |
| Archive size MiB | 8.02 | 7.89 |
| Root | Incorrect extra `CAB432-A3-Submission/` parent | Exactly `app/` and `submission-a3-infra.yml` |
| CRC | PASS | PASS |
| Each archived file matches source hash | PASS for baseline copy | PASS for final copy |

No nested ZIP, dependencies, model weights, virtualenv, build/export output, cache, private key, unsafe path, duplicate entry or symlink is included. Bounded credential/access-key/session-token/presigned-signature/read-token patterns found no matches; this is a pattern audit, not a guarantee against every possible secret format. Public endpoint URLs/ARNs and explicitly fake test capabilities are not AWS credentials.

Largest retained file is the required museum asset `app/mobile/assets/goma-exterior.jpg`, 765,672 bytes. The reduction is intentionally modest because public artwork/map assets remain necessary. Full archive receipt: [zip-validation.json](gradescope-simplification/zip-validation.json).

Original ZIP SHA-256 remains `48af7a4d910236c062ff9b4fb00f5529da0bf72ce0badce0e77a8ca210061aa1`. YAML SHA-256 remains `cd8b17a3ae2f0b98af081f06d243536611eec6ce6cdd0f86ec0bfd942c86a111`.

## Infrastructure declaration and remaining limitations

YAML unchanged: **33 unique declarations**, valid populated type/ARN/description, account901444280953 where applicable, regionap-southeast-2 for regional ARNs, global ARNs handled separately. No undeployed Planning Lambda or planning-only route is declared. Existing shared API/network dependencies remain necessary. Local configuration matches **min1 / max3 / target3 / cooldown30s out,120s in**, with scale-in enabled. See [YAML receipt](gradescope-simplification/yaml-validation.json).

This is local consistency against existing evidence, not a fresh AWS inventory or tag check. Shared API `purpose=assessment 2` and incomplete verification of shared/provider-managed dependency tags still require course review. No tags were changed. The optional deployed candidate-confirmation interpretation endpoint remains unavailable; existing graceful failure behavior remains, and deleting an undeployed Planning Lambda does not create that endpoint. Strict Bedrock validation and the separate Analyse job flow remain intact.

**Gradescope HTTP500 is not proven fixed.** The old parent folder is a confirmed layout defect now corrected, but server-side ingestion/assignment configuration or an unrelated upload failure remains possible. No server logs, failing response IDs or documented file-count/size ceiling establish the root cause. The new source package is ready for the student's upload attempt; upload acceptance and full report/video/tag compliance are not certified. If HTTP500 recurs, retain sanitized timestamp/request ID and contact the teaching team/Gradescope support; never share cookies, presigned URLs or session credentials.

## Final checklist

- PASS — approved separate-copy planning removal; complete per-file inventory.
- PASS — source manifests, shared assets and independent local build/test evidence.
- PASS — production recognition/camera/Jobs/worker/Bedrock core hashes retained; 0.80 threshold and 512D model unchanged.
- PASS — normalized OpenCLIP inference and health under the university task limits, offline.
- PASS — correct ZIP roots, all file hashes, CRC, cache exclusion and bounded sensitive-data scan.
- PASS — original source/evidence, original ZIP and YAML unchanged.
- NOT VERIFIED — Gradescope upload acceptance; HTTP500 cause beyond the confirmed wrapper defect.
- REMAINS — course review of shared tags and original report/video/calculator obligations; optional cloud confirmation limitation.
