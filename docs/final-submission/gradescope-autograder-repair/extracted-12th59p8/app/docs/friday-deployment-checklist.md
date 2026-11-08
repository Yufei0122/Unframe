# Friday deployment checklist — 30 October 2026

**Current handover:** [aws-final-integration-report.md](aws-final-integration-report.md). Worker v3 / task revision 4 remains at 512/2048; real CloudFront browser recognition passed. Scaling target/policy are active and dashboard percentage metrics corrected. Load testing is gated, and Planning creation was explicitly denied by AWS. Earlier preparation-only statements and validation records below are historical.

31 October resource update: the university worker limit is **512 CPU units / 2048 MiB**. Use `deployment/ecs/worker-task-definition.example.json` and the measurements in `worker-resource-verification.md`; the earlier 2 vCPU / 8 GiB validation below is historical, not the deployment size.

**Latest continuation:** see [deployment-preparation-status.md](deployment-preparation-status.md) for the 31 October live inventory, current ZIP hash/tests and remaining blockers. The refreshed web export uses the verified `https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob` API base, rather than the historical same-origin export described below. All AWS changes are now explicitly preparation only.

This checklist superseded the original pending-work sections in `aws-deployment-readiness.md`; its earlier validation record remains historical. No AWS resource changes, deployment, ECR push, reference upload, load test or commit were performed for that preparation. Existing Step 15 verified the 15-vector index with real AWS; do not recreate or reindex it.

## Prepared artifacts and behavior

| Artifact | Use |
| --- | --- |
| `artifacts/lambda/unframe-lambda-node22-x64.zip` | One Linux-built ZIP usable by two separate Node.js 22, x86_64 Lambda functions. Archive root contains `package.json`, `server/`, `shared/`, production `node_modules/`. |
| `unframe-worker:a3-512-2048-local` | Local Docker tag only, not an AWS resource. Built for Linux/amd64; CPU OpenCLIP weights baked into the image. |
| `mobile/dist/` | Web export with jobs enabled and same-origin API routing; no developer localhost URL injected. |
| `deployment/ecs/backlog-target-tracking.json` | Application Auto Scaling target tracking configuration. Replace the three resource placeholders before use. |
| `deployment/lambda/*-env.example.json` | Environment templates; copy to ignored `artifacts/` and fill actual values. |

ZIP size: 25,887,034 bytes compressed; 64,258,355 bytes uncompressed. SHA-256: `49bf4da69fd3336d61610c17f6dbf1275c3a6f9ecafc450a904ba8959a27d6e0`. Rebuilding can change the ZIP hash. Build smoke tests passed in the official Amazon Linux Node 22 image, including native Sharp decoding and both handler imports. ZIP inspection found Linux x64 Sharp, both handlers, and no `.env`, `.aws`, `.git` or Windows Sharp binary.

The worker keeps OpenCLIP **ViT-B-32 / laion2b_s34b_b79k**, normalized **512D**, cosine similarity `1 - distance`, threshold **0.80**, maximum three candidates and visitor confirmation. No changes were made to `routes.js`, `graph.js`, Dijkstra, or shared route algorithms in this task. Static museum JSON and native Scan/local mobile storage remain unchanged.

Web Scan uses jobs when `EXPO_PUBLIC_RECOGNITION_MODE=jobs`; `local` remains the explicit development default. Recognition and analysis use separate jobs; frames remain serial, and the existing detector decides when to freeze a frame. Pausing, backgrounding and leaving cancel the current upload/polling and ignore late results. Already-uploaded jobs continue server-side and their images are cleaned by the worker/lifecycle. Confirmation stays a separate JSON request with no photo upload.

The planning Lambda uses Bedrock and the existing deterministic planner. `/routes/visit` returns the existing **answer then route/route_error NDJSON protocol, buffered in one Lambda response**. It does not stream early tokens. The existing web parser accepts this without a UI change. Route retries require Bedrock and do not silently fall back to local recommendations. Confirmation reuses existing catalogue-grounded explanation validation.

## 1. Confirm actual resources and permissions

All AWS commands below are **operator instructions, not commands executed during preparation**. Replace angle-bracket placeholders; never use them as actual names. Use the account's approved resource names and roles. Do not put AWS credentials into source files, images, ZIPs or Expo variables.

```powershell
aws sts get-caller-identity --profile default --region ap-southeast-2
```

Confirm account `901444280953`. Record actual frontend bucket/domain, temporary-image bucket, queue/DLQ URLs and ARNs, jobs table, ECR repository URI, cluster/service, task family, roles, Lambda names, API ID and CloudFront distribution ID. Verify account/lab permissions for Bedrock Gemma, ECS/Fargate, CloudWatch and Application Auto Scaling.

Reuse the existing index ARN:

```text
arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors/index/a3-n12281212-unframe-vectors
```

It must stay `float32`, dimension 512, cosine; version `openclip-v1`. Keep `museumId`, `model`, `pretrained`, `version`, `catalogueHash` filterable. Only `sourceHash` and `imageHash` are currently non-filterable. The production adapter now serializes combined filters as `$and`/`$eq`.

## 2. Prepare storage and queue before admitting uploads

Inspect/reuse existing resources first. Where absent, the operator must provision/configure:

1. Private frontend bucket and a **separate private temporary-image bucket**, with Block Public Access.
2. Temporary-image prefix `uploads/`; lifecycle expiration after one day, plus noncurrent-version expiration/delete-marker cleanup if versioning is enabled. Worker deletion handles successes; lifecycle handles abandoned/permanently failed inputs.
3. Temporary bucket CORS: exact frontend HTTPS origin, allowed method `PUT`, allowed headers `content-type` and `if-none-match`. S3 answers preflight automatically; do not add `OPTIONS` as an S3 CORS allowed method.
4. DynamoDB table with partition key `jobId` (String), no sort key required, TTL attribute `expiresAt` (Number/epoch seconds). Do not migrate unrelated application data.
5. Standard SQS queue and DLQ in Sydney. Set visibility to 300 seconds, long polling to 20 seconds, maxReceiveCount initially 5. Retain DLQ messages long enough to diagnose the demonstration.
6. Queue resource policy permits only the temporary bucket's S3 service notifications, restricted by source bucket ARN and source account. Configure S3 `ObjectCreated:*` notifications with prefix `uploads/` to this queue. Do not attach a Lambda SQS consumer and do not enqueue deletes.

The existing worker expects the native S3 event envelope with one record, not a custom `{jobId}` body or SNS wrapper. Keep the jobs Lambda and worker's table, bucket and prefix settings identical.

## 3. Configure roles and networking

| Role | Minimum application permissions |
| --- | --- |
| Jobs Lambda | `dynamodb:PutItem`, `dynamodb:GetItem` on the jobs table; `s3:PutObject` on the upload prefix; CloudWatch Logs write permissions. |
| Planning Lambda | `bedrock:InvokeModel` on the configured permitted model resource(s); CloudWatch Logs. No vector, image, queue or table access required. |
| ECS task role | `sqs:ReceiveMessage`, `sqs:DeleteMessage`; `dynamodb:GetItem`, `dynamodb:UpdateItem`; `s3:GetObject`, `s3:DeleteObject` on temporary inputs; version-specific Get/Delete permissions if versioned; `s3vectors:GetIndex`, `s3vectors:QueryVectors`, `s3vectors:GetVectors`; `bedrock:InvokeModel` for analysis. |
| ECS task execution role | ECR pull and CloudWatch Logs stream/write permissions. This is separate from the application task role. |

Scope policies to actual ARNs. Add key-policy/KMS permissions if the chosen resources use customer-managed keys. Index write permissions are not needed for recognition.

Fargate requires outbound HTTPS to AWS APIs, ECR and Logs through the chosen public/NAT/endpoint design. No inbound worker port is required. OpenCLIP listens on task-local loopback 8001. Public catalogue analysis also needs Internet egress unless `ARTWORK_PUBLIC_SEARCH=false`. Planning Lambda does not need to join a VPC for these public AWS endpoints.

## 4. Upload the verified Lambda package and set handlers

Two separate functions use the same ZIP:

| Function | Runtime / architecture | Handler | Initial timeout / memory |
| --- | --- | --- | --- |
| Jobs | `nodejs22.x` / `x86_64` | `server/cloud/handlers.jobsHandler` | 15 seconds / 512 MB |
| Planning + confirmation | `nodejs22.x` / `x86_64` | `server/cloud/planning.planningHandler` | 30 seconds / 1024 MB |

Copy `deployment/lambda/jobs-env.example.json` and `planning-env.example.json` to ignored `artifacts/`, replace placeholders and review. Lambda supplies reserved `AWS_REGION`; do not add it to the environment JSON. Region for all deployment commands is `ap-southeast-2`.

Jobs settings: `JOBS_TABLE_NAME`, `JOB_IMAGES_BUCKET`, `JOB_IMAGE_PREFIX=uploads/`, `JOBS_ALLOWED_ORIGINS=https://<FRONTEND_DOMAIN>`, `JOB_UPLOAD_TTL_SECONDS=300`, `JOB_TTL_SECONDS=86400`.

Planning settings: `AI_PROVIDER=bedrock`, `BEDROCK_MODEL_ID=google.gemma-3-12b-it`, `BEDROCK_PLANNING_MODEL_ID=google.gemma-3-12b-it`, `BEDROCK_TIMEOUT_MS=24000`, `PLANNING_API_TIMEOUT_MS=25000`, `AI_ALLOWED_ORIGINS=https://<FRONTEND_DOMAIN>`, `OLLAMA_PLANNING_NUM_PREDICT=1024`, `OLLAMA_NUM_PREDICT=256`. The legacy output-budget names map to Bedrock `maxTokens`; no Ollama server is used.

For an existing function, the operator's update commands are:

```powershell
aws lambda update-function-code --region ap-southeast-2 --function-name '<JOBS_FUNCTION_NAME>' --zip-file fileb://artifacts/lambda/unframe-lambda-node22-x64.zip
aws lambda wait function-updated --region ap-southeast-2 --function-name '<JOBS_FUNCTION_NAME>'
aws lambda update-function-configuration --region ap-southeast-2 --function-name '<JOBS_FUNCTION_NAME>' --runtime nodejs22.x --handler server/cloud/handlers.jobsHandler --architectures x86_64 --timeout 15 --memory-size 512 --environment file://artifacts/jobs-env.json

aws lambda update-function-code --region ap-southeast-2 --function-name '<PLANNING_FUNCTION_NAME>' --zip-file fileb://artifacts/lambda/unframe-lambda-node22-x64.zip
aws lambda wait function-updated --region ap-southeast-2 --function-name '<PLANNING_FUNCTION_NAME>'
aws lambda update-function-configuration --region ap-southeast-2 --function-name '<PLANNING_FUNCTION_NAME>' --runtime nodejs22.x --handler server/cloud/planning.planningHandler --architectures x86_64 --timeout 30 --memory-size 1024 --environment file://artifacts/planning-env.json
```

For missing functions use Console Create function with the table above and actual role; then upload the ZIP. Environment updates replace the variable map: preserve other intentional settings in the reviewed JSON. Set log retention explicitly and avoid logging payloads/presigned URLs/read tokens.

## 5. API Gateway routes

Use a Lambda proxy **HTTP API**, preferably a `$default` stage. Both handlers understand v1/v2 events. If using a named stage, supply that stage in the CloudFront API origin path/base URL; the Lambda route paths below must remain unchanged.

| Method and route | Integration |
| --- | --- |
| `POST /a3/jobs` | Jobs Lambda |
| `GET /a3/jobs/{jobId}` | Jobs Lambda |
| `OPTIONS /a3/{proxy+}` | Jobs Lambda or equivalent API CORS preflight |
| `POST /api/ai/routes/visit` | Planning Lambda |
| `POST /api/ai/routes/plan` | Planning Lambda |
| `POST /api/ai/routes/chat` | Planning Lambda |
| `POST /api/ai/artworks/confirm` | Planning Lambda |
| `GET /api/ai/planning/status` | Planning Lambda (configuration only, not a model-access proof) |
| `OPTIONS /api/ai/{proxy+}` | Planning Lambda or equivalent API CORS preflight |

Set planning integration timeout to **30000 ms**. The handler enforces at most 25000 ms, reduced for remaining Lambda time, and returns a structured 504 on timeout. Do not configure response streaming for this buffered implementation. Preserve `application/x-ndjson` response content type.

Grant API Gateway invocation permission on each function scoped to the API ARN. Configure exact frontend-origin CORS, `GET,POST,OPTIONS`, `Content-Type,X-Job-Token`; if API Gateway manages CORS, align it with handler allowed origins. Apply sensible throttling and restricted demonstration access before public exposure. Creation/planning have no built-in account authentication, and the status read token is a per-job capability, not a login. Adding a JWT authorizer requires corresponding frontend token handling; do not enable one and assume the current client supplies tokens.

## 6. Publish worker image and deploy one task

Only the operator should run the following later, using the actual ECR repository URI:

```powershell
$ecrRegistry = '<ACCOUNT_ID>.dkr.ecr.ap-southeast-2.amazonaws.com'
$ecrRepositoryUri = '<EXISTING_ECR_REPOSITORY_URI>'
$imageTag = '<REVIEWED_IMAGE_TAG>'
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin $ecrRegistry
docker tag unframe-worker:a3-512-2048-local "${ecrRepositoryUri}:${imageTag}"
docker push "${ecrRepositoryUri}:${imageTag}"
```

The local tag is not an ECR repository name. Record the pushed digest and preferably deploy by digest.

ECS task definition: Fargate `awsvpc`, `LINUX` / `X86_64`, **0.5 vCPU (512 units) / 2048 MiB**, desired count **1**, execution/task roles above, `awslogs` to the actual worker log group, no port mapping, `stopTimeout=120`. Use `deployment/ecs/worker-task-definition.example.json` with actual resource values. Copy the Docker health command into the ECS container definition explicitly (ECS does not automatically adopt an image HEALTHCHECK): `CMD node worker/healthcheck.js`, interval 30s, timeout 5s, startPeriod 180s, retries 3.

Required worker environment:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | `ap-southeast-2` |
| `AI_PROVIDER` / `VECTOR_STORE` | `bedrock` / `s3vectors` |
| `S3_VECTOR_INDEX_ARN` | Existing ARN from step 1 |
| `S3_VECTOR_VERSION` / `ARTWORK_MATCH_THRESHOLD` | `openclip-v1` / `0.80` |
| `JOBS_TABLE_NAME`, `JOB_IMAGES_BUCKET`, `RECOGNITION_QUEUE_URL` | Actual resources |
| `JOB_IMAGE_PREFIX` | `uploads/` |
| `WORKER_VISIBILITY_SECONDS` / `WORKER_JOB_TIMEOUT_MS` | `300` / `180000` |
| `WORKER_MAX_ATTEMPTS` | `5` |
| `BEDROCK_MODEL_ID`, `BEDROCK_VISION_MODEL_ID` | `google.gemma-3-12b-it` unless verified alternative is required |
| `BEDROCK_TIMEOUT_MS` / `AI_ANALYSIS_BUDGET_MS` | `120000` / `125000` |
| `ARTWORK_PUBLIC_SEARCH` | `false` for a catalogue-only demo; enable deliberately if public-source lookups are wanted |
| `OPENCLIP_URL` | `http://127.0.0.1:8001` |
| `OPENCLIP_DEVICE`, `OPENCLIP_THREADS`, `OPENCLIP_TIMEOUT_MS` | `cpu`, `1`, `30000` (updated image defaults) |
| `OPENCLIP_CACHE_DIR`, `HF_HUB_OFFLINE`, `PYTHON_EXE` | `/opt/models`, `1`, `/opt/venv/bin/python` (image defaults) |

Weights and Python/Node dependencies are inside the image; no host `.venv`, Ollama installation or model download at task startup is required. Start one task and require `worker_ready` plus a healthy OpenCLIP check before any load demonstration.

## 7. Smoke-test one job and one plan before publishing the frontend

Use actual API base URL. `POST /a3/jobs` accepts `{museumId:"met",operation:"recognise",contentType:"image/jpeg",sizeBytes:<actual bytes>}`. Upload raw `mobile/assets/water-lilies.jpg` to the returned URL using every returned header, including `If-None-Match: *`. Poll `GET /a3/jobs/{jobId}` with `X-Job-Token` until terminal. Do not print/store the upload URL or read token in screenshots/logs.

Require: `WAITING_UPLOAD` → `PROCESSING` → `SUCCEEDED`; correct Water Lilies candidate; confirmation still required; result persisted before original photo deletion; queue message removed. Repeat once with museum `goma` and once with operation `analyse`. Check duplicate delivery, transient failure/retry and DLQ behavior separately. Job cancellation in a browser does not cancel an already uploaded server job.

Send `/api/ai/routes/visit` a real planner request with `museumId`, `message`, `history:[]` and the existing preferences object. Require a valid NDJSON answer followed by a Bedrock-labelled route with the requested must-see works, time budget and accessibility. Verify `/routes/plan` retry and `/artworks/confirm`. Test Chinese/must-see preservation using the existing application scenarios. Actual Gemma latency and output quality are **not established by mocks**. If valid planning consistently exceeds the 25-second budget, this buffered transport is a blocker; do not merely raise Lambda timeout beyond the gateway limit or claim that it streams.

## 8. Publish web assets with same-origin API behaviors

The prepared `mobile/dist/` intentionally uses same-origin APIs when hosted. Set up CloudFront before testing it:

- Default behavior: private frontend S3 REST origin, OAC, default root `index.html`, HTTPS redirect. Limit SPA fallback handling to frontend paths; do not replace API errors with `index.html`.
- `/a3/*` and `/api/ai/*`: API Gateway origin over HTTPS, actual stage as origin path if needed, **caching disabled**, all needed HTTP methods enabled. Forward query strings and viewer headers including `Origin`, `Content-Type`, `X-Job-Token`, but do not forward the viewer `Host` to API Gateway (managed `AllViewerExceptHostHeader` is suitable).
- Browser uploads go directly to the presigned temporary S3 URL, not through the frontend origin. Match that bucket's CORS to the final HTTPS frontend origin.

Publish only after the API/worker smoke tests pass:

```powershell
aws s3 sync mobile/dist/ 's3://<FRONTEND_BUCKET>/' --region ap-southeast-2
aws cloudfront create-invalidation --distribution-id '<DISTRIBUTION_ID>' --paths '/*'
```

No `--delete` is needed for initial publishing. Verify camera permission on HTTPS, upload, serial scanning, pause/background/leave/scan-again, candidate confirmation, unknown-image analysis and Planner. Native Scan is deliberately unchanged and is not routed through jobs.

## 9. Configure backlog-per-task autoscaling and monitoring

Enable **Container Insights** on the actual cluster so `ECS/ContainerInsights:RunningTaskCount` exists with `ClusterName` and `ServiceName`. Copy `deployment/ecs/backlog-target-tracking.json` into `artifacts/`, replace `<QUEUE_NAME>`, `<CLUSTER_NAME>`, `<SERVICE_NAME>`, and review target/cooldowns.

Metric math is `IF(tasks > 0, backlog / tasks, backlog)`: visible SQS backlog (`Sum`) divided by running task count (`Average`), with an explicit zero denominator guard. Missing Container Insights data is not repaired by the guard. Use minimum capacity **1**, maximum initially **4**; this template is not a tested scale-from-zero design. The initial target **2 messages/task** is an example to tune: acceptable queue delay / measured mean processing time. Scale-out cooldown 60s, scale-in 300s. Current worker concurrency is one message per task.

Operator commands, after filling the copied JSON:

```powershell
aws application-autoscaling register-scalable-target --region ap-southeast-2 --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id 'service/<CLUSTER_NAME>/<SERVICE_NAME>' --min-capacity 1 --max-capacity 4
aws application-autoscaling put-scaling-policy --region ap-southeast-2 --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id 'service/<CLUSTER_NAME>/<SERVICE_NAME>' --policy-name '<SCALING_POLICY_NAME>' --policy-type TargetTrackingScaling --target-tracking-scaling-policy-configuration file://artifacts/backlog-target-tracking.json
```

The worker does not implement ECS task scale-in protection. Shutdown aborts processing and leaves unsuccessful messages for retry, with conditional DynamoDB leases and durable-success cleanup. Scale-in during work can delay completion until visibility expires; for the first demonstration consider disabling scale-in until the backlog has drained. No lease/visibility heartbeat is implemented: keep processing timeout at least 60 seconds below visibility and increase both together if measured work needs longer.

Monitor queue visible/in-flight/oldest age, DLQ count, running task count, CPU/memory, Lambda errors/duration, and worker job IDs. Alert on DLQ messages, persistent backlog or unhealthy tasks. Retain bounded logs; never enable request-body logging for visitor photos/tokens. Only after a successful end-to-end job, optionally use the existing opt-in load utility:

```powershell
npm.cmd run load:jobs -- --execute --url 'https://<API_BASE>' --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5
```

This load command was not run during preparation.

## Local rebuild and verification commands

Run at repository root. Docker commands require the local Linux daemon, not AWS credentials:

```powershell
docker build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:a3-512-2048-local .
docker run --rm --platform linux/amd64 --network none --cpus 0.5 --memory 2g --memory-swap 2g --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" unframe-worker:a3-512-2048-local node scripts/smoke-worker.mjs
docker build --platform linux/amd64 -f deployment/lambda/Dockerfile --target artifact --output type=local,dest=artifacts/lambda .
node --test --test-concurrency=1 tests/*.test.js
npm.cmd run test:aws
npm.cmd --prefix mobile run check
npm.cmd --prefix mobile test
```

Web export with cloud jobs, without loading the developer's `.env.local`:

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_RECOGNITION_MODE = 'jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS = '300000'
$env:EXPO_PUBLIC_API_URL = ''
npm.cmd run mobile:export:web
$env:UNFRAME_CLOUD_WEB_TEST = '1'
node node_modules/@playwright/test/cli.js test mobile/e2e/cloud-scan.spec.js --config playwright.mobile.config.js
```

For a direct cross-origin API instead, set `EXPO_PUBLIC_API_URL` to its actual base URL **before** exporting, and configure matching CORS. Do not set an invented API URL. Expo settings are public. Keep secrets in IAM roles, never Expo configuration.

## Validation record and remaining blockers

- Root: **152 passed**; AWS subset: **30 passed**; mobile: **40 passed**; mobile TypeScript: passed.
- Linux Node 22 Lambda package build/native import checks: passed. ZIP integrity and size checks: passed.
- Cloud-mode web export to `mobile/dist/`: passed.
- Worker Linux/amd64 build: passed. Local image ID: `sha256:f62ea9998ee0cdbdc37aa6a81adc095e023dd40f946c092863c10196f5e7fdb7`; image size reported by Docker: 1,545,527,124 bytes.
- Worker offline runtime: passed with networking disabled, 2 vCPU / 8 GiB limits, Node 22.23.4 and UID 10001. CPU ViT-B-32 / laion2b_s34b_b79k returned 512 dimensions, norm `0.9999999353373191`; existing health check passed. Startup took 42,411 ms. The first attempt timed out during model loading while other checks were running; the isolated retry passed within the unchanged startup budget. Recheck cold startup on Fargate rather than treating this local result as a capacity guarantee.
- Cloud Scan browser checks: **3 passed** against the cloud-mode export with mocked job/upload endpoints. Covered one in-flight job beyond the old five-second timeout, confirmation, scan-again, background/pause/leave cancellation with late results, and separate unknown-image analysis. No synchronous recognition/analysis fallback occurred. An initial test selector was corrected to the actual Close scan button; the full three-test run then passed.
- Root syntax checks, new script/handler syntax checks, deployment JSON parsing and whitespace checks: passed. Protected route/graph/shared-domain file hashes match their starting values for this task.
- Actual resource names/roles/API/CloudFront configuration remain operator inputs; no infrastructure was deployed in this task.
- Full deployed S3 upload → notification → SQS → ECS → DynamoDB → deletion/polling flow remains to be smoke-tested using the final roles and CORS.
- Bedrock access, language quality and <25-second planning latency need a real deployed smoke test. Only transport/service contracts were tested with mocked Bedrock here.
- Native jobs integration, task scale-in protection, lease heartbeat, user-account authentication and deployment automation are outside this minimal web preparation.

References: [AWS ECS backlog-per-task scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-queue.html), [HTTP API integration timeout](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html), [Lambda Linux native dependencies](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-layers.html).
