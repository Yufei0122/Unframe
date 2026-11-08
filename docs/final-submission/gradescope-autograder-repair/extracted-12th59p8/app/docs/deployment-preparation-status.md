# CAB432 A3 deployment preparation — 31 October 2026

Historical preparation snapshot. See the latest [final integration report](aws-final-integration-report.md) for active scaling configuration, corrected dashboard metrics, live browser/cache evidence and the explicit Planning deployment deny. Earlier preparation-only statements below describe an earlier authorization state.

Final scope: **keep all AWS changes prepared only**, as explicitly selected during this task. No AWS configuration was applied, no assets uploaded, no worker image pushed/deployed, no IAM change made, no live job created, and no queue/DLQ message consumed or redriven. Read-only AWS checks and local tests/builds were completed. Existing automatic worker retries continued independently.

An initial autoscaling registration attempt was rejected by automatic approval review before execution because it treated earlier no-modification instructions as active. After reviewing the concrete target/tag/dashboard proposals, the user chose preparation only. These changes therefore remain unapplied; no further approval is being assumed.

## Status by requested phase

PASS means the stated local/preparation scope passed, not an untested cloud deployment.

| Phase / step | Status | Actual resources accessed | Changes and evidence | Remaining blocker / exact next action |
| --- | --- | --- | --- | --- |
| C, 11–14: diagnose/verify recognition | **FAIL — deployed recognition** | ECS cluster/service/task, ECR, worker Logs, job table, image bucket, work queue/DLQ, vector index, Bedrock model, IAM role | Authentication passed. Reconfirmed stale v1 image, invalid-filter AWS reproduction, 15 vectors and 160 local tests. Existing safe diagnostics retained. Job now FAILED after five attempts. | Corrected image plus 512-CPU task revision must be deployed in a separately authorized operation. Effective IAM remains unverified. Then authorize one fresh known-image job; do not claim historical pipeline success. |
| D, 16: scalable target | **BLOCKED** | Application Auto Scaling, ECS/ContainerInsights, Service Quotas | No existing target/policy. ACTIVE service and live RunningTaskCount confirmed. Prepared `deployment/ecs/scalable-target.json`, min 1/max 4. | User requests preparation only. Current task is 1024 CPU, not 512; quota read denied. Fix task size and confirm university concurrent capacity, then register/describe the target. Maximum permitted capacity is **unknown**, not established as four. |
| D, 17: backlog policy | **BLOCKED** | CloudWatch metrics; installed CLI schema; official AWS API documentation | Prepared `deployment/ecs/autoscaling.json`: m1/m2, target 3, cooldowns 30/120. Dimensions match live metrics; CLI schema validation passed without PutScalingPolicy. | No policy ARN/alarms exist from this task. After capacity/target approval, create `unframe-sqs-backlog`, verify policy and managed alarms. No load/scaling demonstration occurred. |
| E, 19: web Scan integration | **PASS — local** | No real job API calls in browser tests | Existing web transport already meets requirements; no additional frontend production edit needed. 71 npm tests, mobile typecheck, 40 mobile tests, 3 mocked browser scenarios and export passed. | Cloud browser use still needs fixed worker, CORS and deployed confirmation/planning routes. Native Scan untouched. |
| F, 20: frontend bucket | **BLOCKED — required tag** | `a3-n12281212-unframe-web` | Existing Sydney bucket verified empty/private, no website/policy. Prepared `bucket-tags.json`, preserving username tag and adding required purpose tag. | No creation necessary. Purpose tag is missing; apply reviewed tags only when writes are authorized. Preserve all public-access blocks until any separately reviewed origin decision. |
| F, 21: web export | **PASS — local preparation** | HTTP API `4xfbhsso7a`, both stages; frontend S3 listing/dry run | Verified `/prob` base in generated JS; 68 files, 13,345,406 bytes. `index.html` present; S3 sync dry run succeeded. | Upload withheld by final user instruction. Later sync without `--delete`; upload alone does not make a working/public deployment. |
| F, 22–23: CloudFront/CORS | **BLOCKED — final domain/review** | CloudFront distributions/OAC list, account/bucket public access, Jobs/API config and upload CORS | No project distribution/OAC. 100 account OACs; quota inspection denied. Exact public-static-origin and CORS proposals prepared under `deployment/web/`. | Instructor permission for an existing OAC or review of public-static workaround; final distribution domain; exact-origin CORS review across shared A2 API clients. No distribution/public policy/CORS changed. |
| G, 26: dashboard | **BLOCKED — application withheld** | CloudWatch dashboard lookup and eight live metric series | Named dashboard absent. Eight-widget `deployment/monitoring/dashboard.json` prepared; all eight metrics have datapoints. | Apply PutDashboard only when authorized, verify stored body and widgets. No unrelated dashboard overwritten. |
| H: Planning Lambda preparation | **PASS — local** | Bedrock model metadata, existing API routes; local Docker build | Existing bounded NDJSON transport reused. Minimal named-stage routing fix plus regression test. Linux Node 22 ZIP rebuilt and smoke-tested. Handler/routes/IAM/env instructions prepared. | No Planning Lambda/routes deployed. Real Bedrock access, quality, latency and final-origin behavior remain unverified. |

## Discovered deployment inventory

- AWS: default profile authenticated to **901444280953**, region **ap-southeast-2**.
- ECS cluster **`n12281212-strobe-a2`**; service **`a3-n12281212-unframe-worker`**, ACTIVE, desired/running **1/1**, HEALTHY; task `b81f902404d244fcacf4a0d277d11f02`.
- Task definition **`a3-n12281212-unframe-worker:3`**, Linux/X86_64, **1024 CPU / 2048 MiB**, task role `Task-Role-CAB432-ECS`.
- Running image **`a3-n12281212-unframe-worker:v1`**, digest `sha256:5ae12c97f44429064ed21a3da67f5f64f65eb961efea78ceec81eb3bb85f82c6`. Newer ECR **v2** digest `sha256:991f56e039b92a5d444d5ba6117900e38b55720e536fdbd401d33c7933811db0` exists but is not running. v2 contains the filter/resource changes; the later diagnostic changes still need a newly built image. No worker build/push/deployment in this task.
- HTTP API **`4xfbhsso7a`**, name `n12281212-strobe-api`. Both **`$default` and `prob`** are auto-deployed on deployment `e5ijb9`. Token-free GET to a nonexistent job returned **404 `JOB_NOT_FOUND`** on both, proving application routing without creating jobs.
- Selected frontend API base: **`https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`**. API root without `/prob` is also a discovered valid stage, not the selected export target.
- `POST /a3/jobs` and `GET /a3/jobs/{jobId}` use integration **`fffmtna`**, payload **2.0**, integration timeout **30000 ms**, Lambda **`a3-n12281212-unframe-jobs`**. Jobs runtime Node 22.x/x86_64; handler `server/cloud/handlers.jobsHandler`; observed Lambda timeout only **3 seconds**. The earlier 15-second recommendation has not been applied.
- Jobs routes currently have authorization NONE. No HTTP API CORS config, no `JOBS_ALLOWED_ORIGINS`, and no upload-bucket CORS were present. Read-token protection still applies to job status. Do not confuse CORS with account authentication.
- Work queue **`a3-n12281212-unframe-recognition`**, DLQ **`a3-n12281212-unframe-recognition-dlq`**; 300-second visibility, maxReceiveCount 5. S3 notification is `ObjectCreated:*`, prefix `uploads/`; queue policy restricts S3 sending to this account and the job-images bucket.
- DynamoDB **`a3-n12281212-unframe-jobs`** ACTIVE, PAY_PER_REQUEST, `jobId` string hash key; `expiresAt` TTL enabled.
- Bucket **`a3-n12281212-unframe-job-images`** retains all four public-access blocks. Static frontend bucket **`a3-n12281212-unframe-web`** likewise private; account public-access blocks were all false, which does not override either bucket's blocks.
- Vector index **`arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors/index/a3-n12281212-unframe-vectors`**: 15 vectors, float32/512/cosine; only sourceHash/imageHash non-filterable.
- Bedrock `google.gemma-3-12b-it` model metadata reports ACTIVE, ON_DEMAND, TEXT/IMAGE. This is not proof that the ECS task or future Planning role can invoke it.

## Phase C evidence and uncertainty

The exact deployed v1 image was previously inspected locally by matching its digest. Its `server/ai/s3-vectors.js` sends sibling identity conditions. Current source and v2 use the required `$and` conditions. The read-only reproduction was repeated in this task:

| Real AWS query, same public Water Lilies reference embedding | Result |
| --- | --- |
| v1 sibling filter | `ValidationException: Invalid filter` |
| Correct `$and` / `$eq` filter | Success; Water Lilies first, distance 0.000004649162292480469, similarity **0.9999953508377075** |
| Next MET references | Wheat Field with Cypresses **0.6676728129386902**; Self-Portrait with a Straw Hat **0.5928469896316528** |

Five filters remain: museumId, model, pretrained, version, catalogueHash. Similarity remains `1 - cosine distance`, threshold `0.80`, maximum three final candidates, confirmation required. No local-vector fallback was used for these AWS queries. The comparison uses the local AWS identity and a public reference vector; it is **not** a replay of the private uploaded image or a proof of task-role permissions.

The historical logs in `/ecs/a3-n12281212-unframe-worker`, stream `ecs/unframe-worker/b81f902404d244fcacf4a0d277d11f02`, contain generic PROCESSING_FAILED, not the original exception. Early attempts failed after roughly 0.4–0.6 seconds, not the 180-second deadline. **QueryVectors is the strongly supported failing-stage diagnosis; the precise historical exception remains unprovable.** IAM role listing and quota inspection were AccessDenied. Another task-role or earlier-stage failure cannot be excluded.

Job `d1964a3b-3090-4a41-87a6-83a2a69decac` progressed automatically to **FAILED, attempts 5**. Final snapshot: work queue visible **0**, in flight **0**; DLQ visible **1**, in flight **0**. No DLQ payload was read, so the message's job identity was not independently confirmed. A FAILED job is not reprocessable by simply redriving it; after the worker fix, use a fresh authorized known-image job. Existing DLQ evidence was left untouched.

Processing path remains SQS → DynamoDB read/claim → S3 GetObject/validation → Sharp → OpenCLIP → S3 Vectors → DynamoDB completion → S3 cleanup → SQS acknowledgement. Plain `recognise` does not invoke Bedrock; `analyse` can. Existing local diagnostics from the prior task record safe stages/service/error codes/request IDs without raw error bodies or private images. See [worker-failure-diagnosis.md](worker-failure-diagnosis.md).

## Autoscaling and monitoring evidence

Container Insights is enabled. The RunningTaskCount metric exists with exactly `ClusterName=n12281212-strobe-a2` and `ServiceName=a3-n12281212-unframe-worker`. SQS metric uses `QueueName=a3-n12281212-unframe-recognition`. All dashboard series had recent datapoints; a read-only six-hour query returned:

| Metric | Latest observed value | Data availability |
| --- | ---: | --- |
| Work queue ApproximateNumberOfMessagesVisible | 0 | 360 points |
| Work queue ApproximateAgeOfOldestMessage | 449 seconds | 360 points |
| RunningTaskCount | 1 | 9 points |
| ECS CPUUtilization | 0.7235% | 68 points |
| ECS MemoryUtilization | 41.5039% | 68 points |
| Jobs Lambda Invocations | 1 per reported minute | 6 points |
| Jobs Lambda Errors | 0 | 6 points |
| DLQ ApproximateNumberOfMessagesVisible | 0 at metric snapshot | 360 points; later direct queue snapshot found 1 |

Metric samples are asynchronous and timestamped earlier than the final queue snapshot; they are not contradictory. CPU/memory values describe the running **1024/2048** task, not a new benchmark at 512 CPU.

Prepared target policy uses exactly the requested `m1 / m2`, Sum visible backlog, Average running task count, target 3, scale-out 30 seconds, scale-in 120 seconds. It assumes minimum one running task and is not a scale-from-zero policy. Missing/zero task-count data yields no usable division datapoint. Target is provisional; no load was generated to tune it.

The installed CLI accepted the metric-math schema using `--generate-cli-skeleton output`, which **does not call PutScalingPolicy**. Its synthetic response is not a real ARN. AWS documents this Metrics-based target-tracking structure: [Application Auto Scaling metric math](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking-metric-math.html). Service-side creation, alarms and actual scaling remain unverified.

## Local tests and artifacts

| Command/check | Result |
| --- | --- |
| `npm.cmd test` | 71 passed |
| `node --test --test-concurrency=1 tests/*.test.js` after final code fix | **160 passed** |
| `npm.cmd run test:aws` | **38 passed**, included in root total |
| `npm.cmd run mobile:check` | TypeScript passed |
| `npm.cmd run mobile:test` | **40 passed** |
| `npm.cmd run mobile:export:web` | Built, but initial output inspection caught stale localhost setting |
| `npm.cmd --prefix mobile run export:web -- --clear` with settings below | Passed; real API base verified in final bundle |
| Cloud Scan Playwright suite, all job/upload endpoints mocked | **3 passed in 24.1 seconds** against the final export |
| Lambda Docker build + smoke script | Linux x64 Node 22, native Sharp, imports/request parsing passed |
| ZIP inspection | 25,889,437 bytes compressed; 64,263,771 uncompressed; both handlers present; no environment/credential filenames |
| Syntax, deployment JSON, whitespace | Passed; 12 JSON files parsed; existing .gitignore line-ending warning only |
| Protected file SHA256 comparison | routes.js, graph.js and native Lookup.tsx unchanged |

The first browser run's three scenarios passed but Windows sandbox teardown stalled. Only its identified preview process was terminated; a fresh run with local process permissions against the final corrected export passed and exited normally. No live job request was made by these mocks. Detailed local logs are in ignored `artifacts/deployment-preparation/`.

ZIP: **`artifacts/lambda/unframe-lambda-node22-x64.zip`**, SHA256 **`008a3dd6a2011fadb1db2672fc8c7ec17188dd57fa6d89b0e76f825faa567f73`**. Handler/route/env/IAM details are in [planning-preparation.md](../deployment/lambda/planning-preparation.md).

## Exact prepared commands — not permission to apply

Read-only verification commands used include:

```powershell
aws sts get-caller-identity --profile default --region ap-southeast-2 --query '{Account:Account}'
aws ecs describe-services --profile default --region ap-southeast-2 --cluster n12281212-strobe-a2 --services a3-n12281212-unframe-worker
aws apigatewayv2 get-stages --profile default --region ap-southeast-2 --api-id 4xfbhsso7a
aws s3vectors query-vectors --profile default --region ap-southeast-2 --cli-input-json file://artifacts/worker-diagnosis/query-v1.json
aws s3vectors query-vectors --profile default --region ap-southeast-2 --cli-input-json file://artifacts/worker-diagnosis/query-corrected.json
```

Rebuild the verified web export (these public settings are not credentials):

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_RECOGNITION_MODE='jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS='300000'
$env:EXPO_PUBLIC_API_URL='https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob'
npm.cmd --prefix mobile run export:web -- --clear
$env:UNFRAME_CLOUD_WEB_TEST='1'
node node_modules/@playwright/test/cli.js test mobile/e2e/cloud-scan.spec.js --config playwright.mobile.config.js
docker build --platform linux/amd64 -f deployment/lambda/Dockerfile --target artifact --output type=local,dest=artifacts/lambda .
```

Schema-only check executed; no policy creation:

```powershell
aws application-autoscaling put-scaling-policy --profile default --region ap-southeast-2 --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker --policy-name unframe-sqs-backlog --policy-type TargetTrackingScaling --target-tracking-scaling-policy-configuration file://deployment/ecs/autoscaling.json --generate-cli-skeleton output
```

**Future AWS writes, withheld.** Recheck current resources immediately before applying; tags replace the tag set, dashboard Put replaces its body, and scaling must wait for the 512-CPU task and permitted capacity. The named dashboard was absent at inspection; if subsequently created, inspect/merge rather than overwrite unrelated widgets.

```powershell
aws application-autoscaling register-scalable-target --profile default --region ap-southeast-2 --cli-input-json file://deployment/ecs/scalable-target.json
aws application-autoscaling describe-scalable-targets --profile default --region ap-southeast-2 --service-namespace ecs --resource-ids service/n12281212-strobe-a2/a3-n12281212-unframe-worker
aws application-autoscaling put-scaling-policy --profile default --region ap-southeast-2 --service-namespace ecs --scalable-dimension ecs:service:DesiredCount --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker --policy-name unframe-sqs-backlog --policy-type TargetTrackingScaling --target-tracking-scaling-policy-configuration file://deployment/ecs/autoscaling.json
aws application-autoscaling describe-scaling-policies --profile default --region ap-southeast-2 --service-namespace ecs --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker
aws cloudwatch describe-alarms --profile default --region ap-southeast-2 --alarm-name-prefix TargetTracking-service/n12281212-strobe-a2/a3-n12281212-unframe-worker
aws s3api put-bucket-tagging --profile default --region ap-southeast-2 --bucket a3-n12281212-unframe-web --tagging file://deployment/web/bucket-tags.json
aws s3api get-bucket-tagging --profile default --region ap-southeast-2 --bucket a3-n12281212-unframe-web
aws cloudwatch put-dashboard --profile default --region ap-southeast-2 --dashboard-name a3-n12281212-unframe --dashboard-body file://deployment/monitoring/dashboard.json
aws cloudwatch get-dashboard --profile default --region ap-southeast-2 --dashboard-name a3-n12281212-unframe
aws s3 sync mobile/dist/ s3://a3-n12281212-unframe-web/ --profile default --region ap-southeast-2
```

Only the S3 sync **`--dryrun`** variant ran. No `--delete`. CloudFront/public-policy/CORS proposals and review constraints are in [deployment/web/README.md](../deployment/web/README.md). Public access is limited in the proposal to frontend GetObject; job images and vectors must remain private. The final distribution domain is not known, so origin placeholders are intentional rather than invented resource names.

## Files changed in this continuation

- Production: `server/cloud/planning.js` only (named-stage parsing).
- Tests: `tests/aws-planning.test.js` (realistic named-stage/default-stage routing coverage).
- Documentation: `docs/aws-deployment-readiness.md` section 12 update; `docs/friday-deployment-checklist.md` current-status notice; this report; `deployment/lambda/planning-preparation.md`; `deployment/web/README.md`.
- Prepared configuration: `deployment/ecs/autoscaling.json`, `scalable-target.json`; `deployment/monitoring/dashboard.json`; `deployment/web/bucket-tags.json`, `upload-cors.review.json`, `api-cors.review.json`, `cloudfront-public-origin.review.json`, `frontend-public-policy.review.json`.
- Generated local artifacts: refreshed `mobile/dist/`, Lambda ZIP, ignored build/test/query-validation logs. Existing dirty changes from earlier work were preserved; nothing was committed.

Web Scan implementation, worker diagnostics, recognition/filter logic and Bedrock provider were reviewed and retained. No route-search or frontend client rewrite was needed. The next critical path is an explicitly authorized corrected worker deployment at **512 CPU / 2048 MiB**, effective-permission verification, then one fresh successful end-to-end job. Cloud success remains **unverified**.
