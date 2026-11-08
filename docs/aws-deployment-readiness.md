# Unframe: CAB432 Assignment 3 deployment readiness

Prepared 27 October 2026 (Australia/Brisbane). This is a source-code preparation, **not a deployed or cloud-verified system**. No AWS resources were created, modified or deleted; no AWS credentials were used; no images were pushed; no cloud indexing/load test ran; no commit/push was made.

## 1. Scope and preserved behavior

- OpenCLIP remains **ViT-B-32 / laion2b_s34b_b79k**, normalized **512-dimensional** embeddings. No Titan integration was introduced.
- Museum filtering, cosine similarity threshold (default 0.80), maximum three candidates, visitor confirmation, uncertain identity labels and artwork/background prototypes remain.
- The physical route algorithm, Dijkstra, accessibility filtering, viewing/walking budgets and graph data remain unchanged. The single change in `routes.js` reports `bedrock` instead of incorrectly labeling its recommendations `ollama`.
- Static catalogue/graph JSON and all artwork/museum data remain in place. The active recognition catalogue remains 15 references: 8 Met, 4 GOMA, 3 QUT. The expanded Met experiment is not promoted to production.
- AsyncStorage, avatars, visits, saves and preferences were not migrated. Existing saved routes remain valid; the route validator now also accepts Bedrock as an AI recommendation source.
- Ollama and local vector JSON remain the defaults. Local startup/camera/scan-loop/file-cleanup/result screens are preserved.
- The new DynamoDB table holds cloud jobs only. No unrelated legacy API was migrated to Lambda.

## 2. Files created

| Files | Responsibility |
| --- | --- |
| `server/ai/s3-vectors.js` | S3 Vector index validation, filtered querying, distance conversion and reference upserts. |
| `server/ai/bedrock.js`, `providers.js`, `job-context.js` | Converse inference, validated JSON, vision adapter, provider selection and worker log correlation. |
| `server/cloud/config.js` | Resource/runtime settings; no hard-coded bucket/table/queue names. |
| `server/cloud/job-repository.js` | Conditional DynamoDB job transitions and leases. |
| `server/cloud/uploads.js` | Presigned immutable PUT, bounded S3 reads and version-aware deletion. |
| `server/cloud/jobs.js` | Transport-independent job creation/status logic. |
| `server/cloud/handlers.js` | API Gateway v1/v2 event adapter; Lambda export `jobsHandler`. |
| `worker/process-job.js` | S3 event validation, processing, result persistence, cleanup, retries and duplicate handling. |
| `worker/worker.js`, `start.js`, `healthcheck.js` | SQS long polling, local Python subprocess, shutdown and container health. |
| `worker/Dockerfile`, `Dockerfile.dockerignore`, `.dockerignore` | CPU worker image and build-context exclusions. |
| `mobile/src/recognitionJobs.ts` | Create/upload/poll abstraction with browser Blob helper and native upload callback boundary. Not wired to Scan yet. |
| `scripts/load-recognition-jobs.mjs` | Explicit opt-in HTTP job generator, 1–50 jobs, default 30. |
| `tests/aws-vectors.test.js`, `aws-bedrock.test.js`, `aws-jobs.test.js` | Mock-only AWS adapter/workflow tests. |
| `mobile/tests/recognitionJobs.test.ts` | Mocked client flow, failure and cancellation tests. |
| `docs/aws-deployment-readiness.md`, `docs/aws-changes-summary.md` | Deployment handover and short review summary. |

## 3. Files modified

- `package.json`, `package-lock.json`: AWS SDK v3 clients/presigner, Ajv; `test:aws`, `worker`, `load:jobs` scripts.
- `.env.example`: commented cloud settings; real `.env` and `mobile/.env.local` were not changed.
- `scripts/index-artworks.mjs`: cloud writes require explicit `--execute-aws`.
- `server/ai/config.js`: provider/index/Bedrock settings, region default Sydney.
- `server/ai/embeddings.js`: selects local or S3 Vectors store.
- `server/ai/recognition.js`: optional remote-search path; existing result semantics retained.
- `server/ai/artwork-analysis.js`: remote global catalogue retrieval while keeping the distinct-match margin and public-reference comparisons.
- `server/ai/ollama.js`: optional structured-generator seam before any Ollama wire-payload construction; catalogue prompts/validators reused.
- `server/ai/vision.js`: exports compact schema/parser for reuse by Bedrock.
- `server/ai/handler.js`: provider selection, museum ID for remote search, honest configuration-only cloud status.
- `server/ai/routes.js`: provider label only; route-search body unchanged.
- `shared/ai-types.ts`, `mobile/src/profileData.ts`, `mobile/src/screens/AIItinerary.tsx`: recognize/display the Bedrock source without changing UI layout or storage schema.

Review with `git diff` and `git status --short`. In this sandbox ordinary Git discovery reports dubious ownership; read-only `git --git-dir=.git --work-tree=. diff` and `status` work without changing global Git configuration. New files are visible in status but are not included in an unstaged tracked-file diff until added by the reviewer.

## 4. Environment configuration

Use Lambda environment variables and ECS task settings/roles tomorrow. Do not commit AWS access keys, secret keys, session tokens or presigned URLs. `EXPO_PUBLIC_*` settings are public.

| Variable | Default / requirement | Consumer |
| --- | --- | --- |
| `AWS_REGION` | `ap-southeast-2` | AWS adapters |
| `AI_PROVIDER` | `ollama`; use `bedrock` for cloud | Node AI API / worker |
| `VECTOR_STORE` | `local`; use `s3vectors` for cloud | Store/indexer/worker |
| `S3_VECTOR_INDEX_ARN` | Required for S3 Vectors | Worker/indexer |
| `S3_VECTOR_VERSION` | `openclip-v1`; publish a new value for a new index generation | Worker/indexer |
| `BEDROCK_MODEL_ID` | `google.gemma-3-12b-it` | Explanations |
| `BEDROCK_PLANNING_MODEL_ID` | Falls back to `BEDROCK_MODEL_ID` | Planning |
| `BEDROCK_VISION_MODEL_ID` | Falls back to `BEDROCK_MODEL_ID` | General analysis |
| `BEDROCK_TIMEOUT_MS` | 120000; range 1000–600000 | Bedrock requests |
| `JOBS_TABLE_NAME` | Required | Jobs Lambda/worker |
| `JOB_IMAGES_BUCKET` | Required; temporary-image bucket | Jobs Lambda/worker |
| `JOB_IMAGE_PREFIX` | `uploads/`; relative prefix ending in `/` | Jobs Lambda/worker/S3 notification filter |
| `JOBS_ALLOWED_ORIGINS` | Empty by default; comma-separated exact frontend origins | Jobs Lambda CORS |
| `JOB_UPLOAD_TTL_SECONDS` | 300; 60–900 | Presigned PUT |
| `JOB_TTL_SECONDS` | 86400; 3600–604800 | DynamoDB TTL, epoch seconds |
| `RECOGNITION_QUEUE_URL` | Required for worker | SQS |
| `WORKER_VISIBILITY_SECONDS` | 300 | Receive visibility and DynamoDB lease |
| `WORKER_JOB_TIMEOUT_MS` | 180000; must leave >=60 seconds before visibility expiry | Worker |
| `WORKER_MAX_ATTEMPTS` | 5; align with SQS redrive policy | Worker |
| `OPENCLIP_URL` | `http://127.0.0.1:8001` | Node calls its Python subprocess |
| `OPENCLIP_DEVICE` | Container `cpu` | Python |
| `OPENCLIP_THREADS` | Container 2; tune to task vCPU | Python |
| `OPENCLIP_TIMEOUT_MS` | Container 30000 | Embedding calls |
| `OPENCLIP_CACHE_DIR` | Container `/opt/models` | Baked weights |
| `PYTHON_EXE` | Container `/opt/venv/bin/python` | Container supervisor |
| `ARTWORK_MATCH_THRESHOLD` | 0.80 | Recognition/public-reference comparisons |
| `AI_ANALYSIS_BUDGET_MS` | 125000 | Full analysis budget |
| `ARTWORK_PUBLIC_SEARCH` | Enabled unless `false` | Existing public catalogue lookup |
| `OLLAMA_NUM_PREDICT` | 256 | Shared explanation output budget, also used by Bedrock |
| `OLLAMA_PLANNING_NUM_PREDICT` | 1024 | Shared planning output budget, also used by Bedrock |
| `OLLAMA_VISION_NUM_PREDICT` | 768 | Shared vision output budget, also used by Bedrock |
| `EXPO_PUBLIC_API_URL` | Existing client setting | Existing synchronous API client; set deployed URL before export |
| `AI_ALLOWED_ORIGINS`, `PORT`, `MOBILE_WEB_URL` | Existing settings | Retained Node HTTP API only |

The existing `OLLAMA_*_NUM_PREDICT` names are intentionally reused as service budgets; they become Converse `maxTokens`, not Ollama wire options. No cloud use of `num_gpu`, `think`, `keep_alive` or Ollama grammar format occurs. The dedicated future jobs client takes its base URL as an argument; it is not enabled by a new environment switch yet.

Do not start a cloud configuration with `npm start`/`ai:up`: those are local supervisors that prepare Ollama and a local index. Use the worker image for recognition, and `npm run server` only if testing the retained Node API with the provider adapter later.

## 5. IAM permissions (configure tomorrow only)

Scope permissions to the actual resource ARNs/prefixes. No wildcard administrator policy is needed by the application.

### Jobs Lambda execution role

- `dynamodb:PutItem`, `dynamodb:GetItem` on the jobs table.
- `s3:PutObject` on `arn:aws:s3:::<temporary-bucket>/<prefix>*`: presigned upload authorization uses this role.
- CloudWatch Logs: `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` (or a precreated log group and narrower permissions).
- This Lambda does **not** send SQS messages, invoke Bedrock or read vectors. S3 event notification performs queue delivery.

### ECS worker task role

- `sqs:ReceiveMessage`, `sqs:DeleteMessage` on the work queue. Visibility is supplied to ReceiveMessage; no heartbeat extension is implemented.
- `dynamodb:GetItem`, `dynamodb:UpdateItem` on the jobs table.
- `s3:GetObject`, `s3:DeleteObject` on the temporary prefix. If versioning is enabled: `s3:GetObjectVersion`, `s3:DeleteObjectVersion` too.
- `s3vectors:GetIndex`, `s3vectors:QueryVectors`, `s3vectors:GetVectors` on the selected index. Metadata filters/returns require GetVectors in addition to QueryVectors.
- `bedrock:InvokeModel` for configured model ARN(s), for `analyse` jobs. Plain `recognise` jobs do not invoke Bedrock.

### Other roles/policies

- ECS **task execution role**, separately from task role: ECR image pull permissions and CloudWatch log stream/write permissions for the `awslogs` driver.
- SQS resource policy: allow service principal `s3.amazonaws.com` to `sqs:SendMessage`, restricted by the temporary bucket's `aws:SourceArn` and your `aws:SourceAccount`.
- The later indexing operator needs `s3vectors:GetIndex` and `s3vectors:PutVectors`; the worker does not need PutVectors. Indexer currently reads persistent references from the repository.
- A future planning/explanation Lambda needs `bedrock:InvokeModel` and logs permissions; that Lambda transport is not part of this change.
- If choosing customer-managed KMS keys, add the corresponding key-policy/role permissions for the encrypted services. The simplest initial demo uses service-managed encryption where permitted.

## 6. S3 Vector index requirements and indexing

- Data type `float32`; **dimension 512**; distance metric **cosine**. `GetIndex` checks these before queries/writes.
- Query and reference vectors must come from the exact existing OpenCLIP model and preprocessing. Normalization is checked.
- Metadata: `artworkId`, `museumId`, `model`, `pretrained`, `version`, `catalogueHash`, `sourceHash`, `imageHash`.
- Keep `museumId`, `model`, `pretrained`, `version`, `catalogueHash` **filterable**. Source/image hashes can be non-filterable.
- Keys: `<version>:<catalogueHash>:<museumId>:<artworkId>`.
- Queries filter by model identity/version/catalogue and, for recognition, museum. The adapter rejects incompatible metadata and uses **similarity = 1 - cosine distance**. The 0.80 threshold remains a similarity threshold.
- The service performs approximate nearest-neighbor retrieval; unchanged similarity thresholds do not prove identical recall. Validate tomorrow with the existing reference/control images. The current small catalogues request all their references (up to 100), then retain the original ranking/three-candidate logic.
- The scene detector still uses the query OpenCLIP vector locally. No second embedding model is introduced.
- Use a fresh `S3_VECTOR_VERSION` when rebuilding/changing source images, even if filenames stay the same. A failed multi-batch publication is not atomic. Populate the new version completely before pointing workers at it. Old versions are excluded by filters and can be removed later by an operator.

Later, with authorized AWS access and a running local OpenCLIP service:

```powershell
$env:AWS_REGION = 'ap-southeast-2'
$env:VECTOR_STORE = 's3vectors'
$env:S3_VECTOR_INDEX_ARN = '<existing-index-arn>'
$env:S3_VECTOR_VERSION = '<new-published-version>'
npm.cmd run ai:index -- --execute-aws
```

The script uses the existing 15 application reference images under `mobile/assets`, normalizes them with Sharp, generates OpenCLIP vectors, and writes the configured index. **This operation has not been executed.** Without `--execute-aws`, cloud mode exits before embedding/indexing calls. Reference artwork images remain persistent assets; visitor images do not.

## 7. DynamoDB schema and lifecycle

Table partition key: **`jobId` (String)**. No sort key/GSI required initially. TTL attribute: **`expiresAt` (Number, epoch seconds)**. API enforces expiry itself because DynamoDB TTL deletion is asynchronous.

```json
{
  "jobId": "<UUID v4>",
  "status": "WAITING_UPLOAD",
  "operation": "recognise",
  "museumId": "met",
  "bucket": "<temporary-bucket>",
  "imageKey": "uploads/<UUID v4>/image",
  "contentType": "image/jpeg",
  "sizeBytes": 12345,
  "tokenHash": "<SHA256 of read capability>",
  "attempts": 0,
  "createdAt": 1793000000,
  "updatedAt": 1793000000,
  "expiresAt": 1793086400
}
```

Transitions:

1. API creates `WAITING_UPLOAD` with conditional PutItem.
2. S3 PUT creates an object notification. Queue depth represents queued work; no separate QUEUED database transition is needed.
3. Worker conditionally claims `WAITING_UPLOAD`/`RETRYING`, or an expired PROCESSING lease, setting `PROCESSING`, `leaseOwner`, `leaseUntil`, and incrementing `attempts`.
4. Successful inference conditionally saves `SUCCEEDED`, `result`, `completedAt`, `updatedAt`; removes lease/error fields.
5. Only after success is durable does the worker delete the temporary image/version, then acknowledge the SQS message.
6. Processing failure conditionally sets `RETRYING`, or `FAILED` at the attempt limit, with a bounded error object. Neither image nor queue message is deleted on processing failure.

Result JSON is limited to 300,000 bytes before writing, leaving room within DynamoDB's item budget. Results retain the original RecognitionResult or ArtworkAnalysis structure. API responses omit bucket/key, token hash and lease fields.

## 8. SQS message schema and delivery

Use a **Standard queue**, same Region as the S3 temporary bucket. Configure direct S3 `ObjectCreated:*` notifications filtered to `JOB_IMAGE_PREFIX`. Do not also attach a Lambda SQS event-source consumer to the worker queue.

The worker accepts the native S3 notification envelope, not arbitrary client-supplied job IDs:

```json
{
  "Records": [{
    "eventSource": "aws:s3",
    "eventName": "ObjectCreated:Put",
    "s3": {
      "bucket": {"name": "<temporary-bucket>"},
      "object": {
        "key": "uploads/<UUID v4>/image",
        "size": 12345,
        "eTag": "<object-etag>"
      }
    }
  }]
}
```

`versionId` is accepted when supplied. Keys are URL-decoded. The configured bucket/prefix, UUID, single-record shape, size, event type, database operation/museum and stored key must match. S3 reads verify size, content type and ETag; the existing image validator then verifies actual bytes. A valid S3 test notification is acknowledged without inference.

- Long polling: 20 seconds, one message/one inference at a time per task.
- Default receive visibility and lease: 300 seconds; processing budget: 180 seconds. Lease/visibility heartbeat extension is not implemented; increase both together if needed, maintaining >=60 seconds of headroom.
- Conditional claims prevent two active workers from owning one job. Completed-job redelivery only retries image cleanup and acknowledgement.
- An acknowledgement failure after result persistence is safe. If image deletion fails, the message is also retained for cleanup retry.
- Malformed/unknown/failed/expired jobs are not acknowledged; configure a **DLQ and redrive policy**, initially maxReceiveCount 5. Receive count can exceed processing-attempt count because lease conflicts and malformed messages do not claim a job.
- Inspect DLQ/RETRYING/FAILED jobs tomorrow. Lifecycle expiry is the final cleanup path for permanently failed or never-delivered uploads.

## 9. API contracts and Lambda packaging

Lambda handler: **`server/cloud/handlers.jobsHandler`**, Node.js 22, repository root as archive root. Include `server/`, `shared/`, root package manifests and production `node_modules/`. Build production dependencies for Linux, including Sharp; do not upload Windows `node_modules`. `server/index.js` is not a Lambda handler. No infrastructure template is deployed or supplied.

`POST /a3/jobs`, `Content-Type: application/json`:

```json
{"museumId":"met","operation":"recognise","contentType":"image/jpeg","sizeBytes":12345}
```

- `operation`: `recognise` (default) or `analyse`; `museumId`: `met` (default), `goma`, `qut`.
- Image types: JPEG/PNG/WebP, 1 byte to 5 MiB. The API request body itself is limited to 2048 bytes.
- No arbitrary object key, bucket or model can be supplied by the client.

Response HTTP 201:

```json
{
  "jobId":"<UUID v4>",
  "readToken":"<random 64 hex characters>",
  "status":"WAITING_UPLOAD",
  "upload":{"url":"<presigned HTTPS PUT URL>","headers":{"Content-Type":"image/jpeg","If-None-Match":"*"},"expiresAt":1793000300},
  "pollAfterMs":1500
}
```

PUT the **raw image bytes**, not FormData, to `upload.url` with every returned header. `If-None-Match: *` prevents overwriting an existing input. Automatic optional SDK checksums are disabled for presigning an as-yet-unknown body. The worker still checks uploaded bytes/metadata. A failed upload should start a new job; abandoned records expire.

`GET /a3/jobs/{jobId}`, header `X-Job-Token: <readToken>`:

```json
{
  "jobId":"<UUID v4>",
  "status":"SUCCEEDED",
  "operation":"recognise",
  "museumId":"met",
  "createdAt":1793000000,
  "updatedAt":1793000020,
  "result":{"matched":false,"candidates":[],"artworkDetected":false,"requiresConfirmation":true,"message":"..."},
  "pollAfterMs":1500
}
```

Nonterminal statuses omit `result`. RETRYING/FAILED can include `error: {code,message}`. Wrong capability/unknown job returns 404; expired record 410. Other errors use `{error: string, code: string}` with 400/403/413/415/500. Timestamps are epoch seconds. `analyse` returns the existing ArtworkAnalysis object, not a fabricated recognition match.

The read token is a per-job capability, not user account authentication. Creation is not authenticated by this code: configure API Gateway throttling and an appropriate authorizer/restricted demo access before public exposure. CORS is not authentication. Never log tokens, presigned URLs or request bodies. If adding an authorizer, pass its headers through the frontend client and load tool explicitly.

Configure S3 CORS for the exact CloudFront origin, method PUT, headers `Content-Type`, `If-None-Match`. Configure API CORS for GET/POST/OPTIONS and `Content-Type`, `X-Job-Token`. The handler supports v1/v2 payloads; map routes to `/a3/jobs` and `/a3/jobs/{jobId}` without an extra stage prefix in the parsed path, or normalize that prefix at the API integration.

## 10. Docker / ECS CPU readiness

From the repository root, tomorrow:

```powershell
docker build --platform linux/amd64 -f worker/Dockerfile -t unframe-recognition-worker:local .
docker run --rm --init --env-file worker-runtime.env unframe-recognition-worker:local
```

`worker-runtime.env` is an operator-created, untracked runtime configuration file containing resource names and settings, not hard-coded credentials. In ECS, use the task role. A local AWS-connected container additionally needs an authorized SDK credential mechanism; it is not supplied or exercised tonight. Running this container with valid configuration will access AWS.

- Root build context is required. `worker/Dockerfile.dockerignore` is the authoritative allowlist; `.git`, `.env`, local caches, credentials and Windows dependencies are excluded.
- Python 3.12 and Node 22 on Debian Bookworm; production Node dependencies installed inside Linux.
- CPU PyTorch 2.8.0 / torchvision 0.23.0 installed from the public CPU wheel index, then `local-ai/requirements.txt`.
- Public OpenCLIP weights downloaded/verified during build into `/opt/models`; runtime starts offline and does not depend on a developer `.venv` or model cache. No Ollama installation in the image.
- Build needs public registry/PyPI/PyTorch/model-host egress and enough disk for a multi-GB image. Pin a model artifact digest/base image digest after the first verified build if stricter reproducibility is needed; the existing model identifier is retained.
- Start with **2 vCPU / 8 GiB RAM**, OpenCLIP threads 2, one job at a time; measure before reducing memory/increasing concurrency. This is a starting recommendation, not a measured sizing result.
- Non-root UID 10001. Node starts a supervised loopback Python service and waits for the expected model identity. ECS sends SIGTERM; current work is aborted and not acknowledged, and Python is stopped. Enable ECS initProcessEnabled.
- No inbound application port is needed. Worker needs HTTPS egress to SQS, DynamoDB, S3, S3 Vectors and Bedrock; existing public catalogue analysis also needs internet egress unless disabled.
- Readiness requires Python health plus a successful vector-index configuration check. It does not prove Bedrock access or that every vector is present.
- Health command: `node worker/healthcheck.js`; configure the ECS container health check explicitly (interval 30s, timeout 5s, startPeriod 180s, retries 3). Docker's HEALTHCHECK alone is not a substitute for ECS task health configuration.
- `/tmp/unframe-worker-ready` is an ephemeral liveness marker. It contains no visitor data. Health allows the configured processing budget plus 90 seconds between worker ticks.

**Container validation limitation:** Docker CLI is installed, but the Docker daemon pipe is unavailable in this session. The image was not built/run. No ECR push occurred. Verify CPU dependencies, model cache/offline loading and signal handling on Linux tomorrow.

## 11. Tests and local checks

```powershell
npm.cmd test
npm.cmd run test:ai
npm.cmd run test:aws
npm.cmd run mobile:check
npm.cmd run mobile:test
```

AWS tests inject mock SDK clients/presigners; they do not resolve credentials or contact AWS. Coverage includes cosine conversion, incompatible indexes/metadata, candidate filtering/cap, analysis margin, Bedrock wire/parsing/invalid output, grounded explanations, route compatibility, message validation, persistence/cleanup order, processing failure, duplicate delivery, leases, retry exhaustion, API parsing and DynamoDB command conditions. The client tests cover create/upload/poll and failure/cancellation.

The original baseline `npm test` passed 71 tests before major changes. See the final validation record below for the completed post-change runs. This does not establish cloud permissions, actual Gemma output quality, vector retrieval accuracy, S3 notifications or autoscaling.

## 12. Frontend export and exact remaining wiring

**31 October update:** the web connection below is now implemented through `Lookup.web.tsx` → `createWebScanTransport` → `createRecognitionJobClient` / `browserJobImage`. Export with `EXPO_PUBLIC_RECOGNITION_MODE=jobs`; the default local mode and native Scan remain unchanged. Both separate job operations, existing confirmation flow, single pending request and cancellation are covered by local tests. See `docs/deployment-preparation-status.md` for the discovered API URL, current export and cloud blockers. The original preparation notes below describe the earlier state, not a remaining web implementation task.

Verified build process:

```powershell
npm.cmd ci
npm.cmd --prefix mobile ci
npm.cmd run mobile:export:web
```

Output: **`mobile/dist/`**. Both clean installs were run (with local cache/no-audit/no-fund flags). Do not deploy this checkout's current local export blindly: its existing `mobile/.env.local` points to localhost. Re-export with the real public endpoint tomorrow.

The asynchronous client is deliberately **not enabled in Scan**. Existing recognition/analysis calls remain unchanged until cloud end-to-end testing is possible.

Exact connection points:

1. `mobile/src/screens/Lookup.web.tsx:recognise(blob, ...)`: replace only its recognition HTTP call with `client.run(browserJobImage(blob), museumId, 'recognise', signal)`, then pass the RecognitionResult through existing candidate/capture handling.
2. `Lookup.web.tsx:analyse(blob)`: use a separate `analyse` job and pass ArtworkAnalysis through existing analysis rendering. Recognition must not automatically run a vision model on every sampled frame.
3. `Lookup.tsx:NativeLookupContent` scan `sample()` and `analyseImage()`: supply `JobImage` with the compressed file's actual byte size, JPEG type and a raw-file PUT callback. Use an Expo-supported file/body upload implementation, verify it on a device, and keep the current ownership/temporaryFiles/releasePhoto cleanup unchanged. Do not send multipart to the presigned PUT.
4. Keep `/artworks/confirm` separate; candidate confirmation requests grounded text and does not need to upload a photo. The provider adapter already supports Bedrock, but cloud API transport for confirmation is still needed.
5. Use a **job-specific** overall wait/cancellation budget; do not reuse the current 5-second CLIP scan timeout for queue waiting. Hold a single frame/job at a time to avoid creating a queue job every sample while the previous one is pending. Display WAITING_UPLOAD/PROCESSING/RETRYING through existing busy/error UI. Test pause/background/unmount cancellation and scan-again on web/native.
6. `requestAI()` in `mobile/src/ai.ts` remains the synchronous local transport. Instantiate `createRecognitionJobClient(deployedBaseUrl)` separately rather than changing all API calls.

Client cancellation stops upload/polling; it does not cancel a job already uploaded/queued. The worker still completes/deletes its input. An abandoned upload/job is handled by lifecycle/TTL.

## 13. Remaining AWS Console tasks

- Confirm CAB432 account/lab permissions for Gemma, S3 Vectors, ECS task roles and autoscaling. Verify actual model access in Sydney with a small allowed request tomorrow.
- Create/configure private frontend and temporary-image buckets separately, with Block Public Access. Configure CloudFront OAC for frontend delivery and HTTPS.
- Configure temporary prefix expiration (e.g. one day) and, if versioned, noncurrent-version expiration/delete-marker cleanup. Lifecycle cleanup is asynchronous, not an immediate deletion guarantee. Successful inputs are explicitly deleted by the worker; failed/abandoned inputs must not remain permanently.
- Create the jobs table and TTL; create the 512-dimensional cosine vector index with filterable identity metadata.
- Create Standard work queue, DLQ, queue policy and S3 ObjectCreated notification. Do not enqueue on object deletion.
- Create Lambda/roles/log groups, upload Linux-built package, configure jobs routes/CORS/throttling/access control.
- Build/test/push worker to ECR tomorrow, create ECS Fargate service, task/execution roles, networking, health and awslogs configuration.
- Configure ECS service autoscaling using backlog per running task or a documented queue-depth step-scaling policy. Suggested demo bounds: min 1 / max 4; tune cooldowns and alarm thresholds from actual processing time. There is no autoscaling code/resource configured tonight.
- Observe CloudWatch SQS visible/in-flight/oldest-message metrics, ECS running task count/CPU/memory, DLQ count and worker `job_*` events. Add alarms for DLQ messages, stuck backlog and task failures. Log retention should be explicit.

## 14. Blockers, uncertainties and work not safely completed

- Docker daemon unavailable: container build/runtime unverified.
- No AWS access used: permissions, resource policies, bucket CORS, presigned PUT, event delivery, Bedrock quality/availability, S3 Vector recall and actual DynamoDB expressions still need deployed smoke tests.
- AWS's Gemma model card documents Converse, image input and Sydney availability; account/lab access was not checked. Model IDs remain configurable. JSON-schema instructions plus Ajv/service validators are used, not an assumed Ollama grammar or unverified model-specific response field. Invalid/truncated output fails explicitly; no guessed fields/facts are substituted.
- `createJobsHandler` is ready to package, but no IaC/deployment package/authorizer is provisioned. API creation is not authenticated in application code.
- Async Scan UI wiring and native raw PUT remain intentionally pending; the client abstraction is tested in isolation. Existing UI still calls synchronous endpoints.
- Planning/explanation Bedrock services work behind the existing Node handler, but **planning/confirmation Lambda transport is not implemented**. The two jobs endpoints do not make all current `/api/ai/*` routes available in Lambda. Preserve the existing NDJSON visit protocol with an explicitly configured REST API streaming integration, or design a bounded alternative tomorrow; do not silently point the current planner at a buffered jobs handler.
- Bedrock recommendation provider labels are supported, but actual Gemma-generated Chinese planning, preserved-must-see behavior, and vision quality need existing acceptance scenarios against the deployed provider.
- Worker accepts one S3 notification record per message. If delivery infrastructure wraps/batches notifications (SNS/EventBridge/custom producer), adapt and test parsing/visibility deliberately; the current contract is direct S3-to-SQS.
- Permanent processing failures keep the image until S3 lifecycle cleanup, as required to allow retries. Configure lifecycle and DLQ before admitting uploads.
- The 15-reference S3 publication is not an atomic index-wide swap. Publish a fresh version then switch workers after verification.

## 15. Load demonstration utility (not executed)

Later, after one real job succeeds and autoscaling is configured:

```powershell
npm.cmd run load:jobs -- --execute --url https://YOUR_API --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5
```

The utility creates separate jobs/uploads, caps count at 50 and concurrent submissions at 10, and logs job IDs without upload URLs/read tokens. It does not manipulate desired task count and does not claim completion. Use CloudWatch to record queue increase, task increase, processing logs and queue decrease. If API authorization is added, extend its HTTP headers accordingly. No load submissions were made during preparation.

## 16. Recommended deployment order tomorrow

1. Review the diff, run local tests, start Docker and build/test the CPU image. Confirm the assignment account's allowed services/models.
2. Create temporary bucket, lifecycle/CORS, jobs table/TTL, vector index, SQS queue/DLQ and narrowly scoped IAM roles/policies.
3. Populate a fresh OpenCLIP vector version from the existing references; verify all 15 IDs, dimensions and controlled matches.
4. Configure S3 notification to SQS. Confirm the harmless S3 test notification is accepted.
5. Package/deploy the jobs Lambda from Linux dependencies; configure API Gateway, origins, throttling and access controls.
6. Push the verified image to ECR and deploy **one** Fargate worker. Configure awslogs/health and resource environment variables.
7. Create/upload one job through the API. Verify WAITING_UPLOAD → PROCESSING → SUCCEEDED, original result schema, deleted image/version and removed queue message. Repeat for a non-match and `analyse` job.
8. Exercise failure/redelivery/duplicate cleanup, mismatched input and DLQ behavior. Verify Bedrock response contracts, including unknown/non-art images.
9. Wire/test the jobs client into web Scan; test native raw PUT separately. Prepare the narrow planning/confirmation Lambda transport if those features must be public for the demonstration.
10. Export frontend with deployed API configuration, upload `mobile/dist` to its private bucket and configure CloudFront. Test HTTPS camera permissions and cross-origin uploads/polling.
11. Configure ECS autoscaling and CloudWatch alarms/dashboard. Run the explicit 20–50 job demonstration and capture evidence.
12. Confirm no temporary photos remain beyond the intended lifecycle, and document actual measured limits and any remaining local-only feature.

## API references checked

- [S3 QueryVectors](https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_QueryVectors.html): cosine metric, distance/metadata results and permissions.
- [Gemma 3 12B IT model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-google-gemma-3-12b-it.html): configured ID, Converse, image input and Sydney availability.
- [Bedrock Converse](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html): supported request/response interface.
- [API Gateway response streaming](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode.html): REST API streaming is an explicit integration setting, not automatic.

## Final local validation

- Baseline root test suite: 71 passed before the migration changes.
- Final root suite (`node --test tests/*.test.js`): **145 passed**, including **23 mocked AWS tests**; no failures or skipped tests.
- Mobile suite: **36 passed**. Mobile TypeScript checking passed.
- Clean dependency installs completed for both root and mobile packages.
- `npm.cmd run mobile:export:web` succeeded; `mobile/dist/index.html` exists. Rebuild with the deployed API URL before publishing.
- JavaScript syntax checks and `git diff --check` passed. The route-search change is limited to the provider label; graph/Dijkstra code is unchanged.
- Docker build/runtime could not be verified because the local Docker daemon was unavailable. No cloud integration, indexing or load tests were executed, and no AWS credentials were used.
