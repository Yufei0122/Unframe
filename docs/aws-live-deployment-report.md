# CAB432 A3 Unframe — live deployment report

31 October 2026, Australia/Brisbane. Account **901444280953**, profile **default**, region **ap-southeast-2**.

**Historical snapshot.** The later [final integration report](aws-final-integration-report.md) supersedes this state: the scaling target/policy are now active, percentage dashboard metrics corrected, and real browser recognition verified. Load evidence and Planning remain blocked for the reasons in that report.

## Status

| Item | Status | Actual result |
| --- | --- | --- |
| Corrected worker build/push | **PASS** | New `v3` image tested locally at 0.5 CPU/2 GiB, pushed to the existing ECR repository and digest verified. |
| ECS revision/service | **PASS** | Revision **4**, CPU **512**, memory **2048**, Linux/X86_64; desired **1**, running **1**, pending **0**, HEALTHY, rollout COMPLETED. |
| One real recognition job | **PASS** | `c52c3782-0b39-405f-86bf-8ca2b65b06cf`: SUCCEEDED on attempt 1; Water Lilies first, similarity **0.9999953508377075**, one candidate, confirmation required. |
| Step 20 frontend bucket | **PASS** | Existing Sydney bucket reused. Missing purpose tag added with S3 Control TagResource; username tag preserved. No bucket recreation. |
| Step 22 CloudFront | **PASS** | Distribution **E2CK5412ICFTJX**, Deployed/Enabled; **https://d3x3iexpafsgf.cloudfront.net**; HTML/JS/CSS and HTTP→HTTPS verified. No OAC created. |
| Step 23 CORS | **PASS — tested A3 transport** | Exact CloudFront origin allowed by Jobs Lambda, A3 OPTIONS routes and private upload-bucket CORS. Positive/negative preflights verified; shared A2 API-wide CORS left untouched. |
| Step 26 dashboard | **PASS — existing dashboard; PENDING exact percentage metrics** | Existing dashboard has seven widgets/eight series covering all categories. CPU/memory are raw CpuUtilized/MemoryUtilized, not requested percentage metrics. User chose to leave it unchanged. |
| Steps 16–17 autoscaling | **BLOCKED** | Container Insights and RunningTaskCount available, no existing target/policy. Quota read denied; permitted maximum concurrent capacity unknown. No target, policy, alarms or load test created. |

## Worker image and deployment evidence

Repository: `901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker`.

```text
Tag: v3
Image/index digest:
sha256:ba7c946125932a59495a56c37ea299911a345514c0775ff9e4a4d1f7798cdada

Linux amd64 platform manifest from build:
sha256:4a68a0e1893cbff117987f6e62a873c5d627f100b6e99aee1b7699324425fb57

Task definition:
arn:aws:ecs:ap-southeast-2:901444280953:task-definition/a3-n12281212-unframe-worker:4

Cluster: n12281212-strobe-a2
Service: a3-n12281212-unframe-worker
Running task: cb916ca6f0484d318109cddf9c3436a1
```

ECR DescribeImages and ECS DescribeTasks both returned the image/index digest above. The new task uses the image **by digest**, not a mutable tag. The service's final deployment list contains only revision 4 with rollout COMPLETED. ECS performed its normal rolling replacement of revision 3; no service/cluster was recreated and no manual StopTask was issued.

The revision preserves:

- Task role `Task-Role-CAB432-ECS` and execution role `Execution-Role-CAB432-ECS`.
- All 22 existing environment variables, including `AI_PROVIDER=bedrock`, `VECTOR_STORE=s3vectors`, the existing vector index ARN, `S3_VECTOR_VERSION=openclip-v1`, `ARTWORK_MATCH_THRESHOLD=0.80`, `OPENCLIP_THREADS=1`, `AI_ANALYSIS_BUDGET_MS=125000`, table/bucket/queue references and timeout/retry settings.
- Existing network configuration and awslogs group `/ecs/a3-n12281212-unframe-worker`, region Sydney, prefix `ecs`.

Changes are task CPU 1024→512, corrected digest, required purpose tag, and health-check command `['CMD','node','worker/healthcheck.js']` in place of the malformed escaped-shell command. Memory remains 2048 MiB. No IAM/SCP policy or model/recognition algorithm was changed.

The current image includes `serializeMetadataFilter` with `$and`/`$eq` for museumId/model/pretrained/version/catalogueHash and the safe diagnostic wrappers added previously. Similarity remains `1 - cosine distance`; top-three/0.80 threshold and visitor confirmation are preserved. Plain recognition does not call Bedrock; model invocation was not added to this test.

Docker's Windows credential helper initially failed with `The stub received bad data.` A temporary ignored Docker file-store configuration completed the authorized ECR login/push. Its credential file/directory was removed afterward and was not displayed, committed or copied into the image. Existing v1/v2 tags were not overwritten.

## Local verification, separate from AWS evidence

- `node --test --test-concurrency=1 tests/*.test.js`: **160 passed**, zero failures, including AWS filter/diagnostics/Bedrock/SQS regression coverage.
- Build: `docker build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:a3-v3-local .` passed.
- Existing `scripts/verify-worker-limits.mjs` and private-cache wrapper ran the real worker entrypoint and OpenCLIP with **all AWS SDK boundaries mocked**, Docker networking disabled, `--cpus 0.5 --memory 2g --memory-swap 2g`.
- **12 mocked jobs**, MET positive/GOMA negative controls, three 25-megapixel stress inputs, **15 health checks**, normalized 512D embeddings, `$and` payload assertions, ranking/threshold/confirmation and persistence-before-cleanup all passed.
- Startup: **56.155 s**; test lifetime: **128.819 s**. Recognition durations: first cold request **15.007 s**, subsequent ordinary inputs **0.534–1.111 s**; large inputs **1.116–1.642 s**.
- Peak cgroup memory **1,800,675,328 bytes** (about **1717 MiB / 1.68 GiB**); OOM/OOM-kill/memory-limit events **0**, exit code **0**, Docker `OOMKilled=false`.
- CPU average **30.45% of one core** including idle observation. CPU quota was explicitly checked inside the container. No timeout or memory limit was increased.
- Docker health history contains successful running checks; its stopped-container health label is not used as evidence of a running failure.

Local evidence: `artifacts/live-deployment/root-tests.log`, `worker-build.log`, and `worker-limits/{run.log,summary.json,embedding.json}`. These mock tests do not substitute for the following real AWS result.

## One real recognition job

The actual A3 routes are on HTTP API **`4xfbhsso7a`**, whose existing name is `n12281212-strobe-api`. Both `$default` and `prob` stages were discovered; A3 Jobs routes were verified against integration **`fffmtna`** targeting **`a3-n12281212-unframe-jobs`**, payload 2.0. The API was not selected merely because its name contains Strobe.

Selected base: **`https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`**.

Exact live command, executed once after revision 4 was healthy:

```powershell
mobile/node_modules/.bin/tsx.cmd scripts/verify-one-cloud-job.ts --execute
```

This opt-in script reuses `createRecognitionJobClient` and `browserJobImage`. It refuses another submission if its evidence file exists, keeps read tokens/presigned URLs only in memory and omits raw transport errors from output. Do not remove its guard and rerun casually.

| Evidence | Observed |
| --- | --- |
| Input | `mobile/assets/water-lilies.jpg`, museum `met`, operation `recognise` |
| API create / raw S3 PUT | HTTP **201 / 200** |
| Job ID | **c52c3782-0b39-405f-86bf-8ca2b65b06cf** |
| API polling | WAITING_UPLOAD → PROCESSING → SUCCEEDED; all status reads HTTP 200 |
| Identification | `water-lilies`, similarity **0.9999953508377075**, one ranked candidate, `requiresConfirmation=true` |
| Attempt | **1** |
| Client round trip | **6121 ms**, approximately 05:32:41–05:32:47 AEST on 31 October |
| Worker processing → complete | Approximately **1230 ms**, from CloudWatch timestamps |
| DynamoDB consistent read | SUCCEEDED, attempts 1, matching artwork/similarity/candidate count; result remains available |
| Automatic input cleanup | S3 HEAD `uploads/c52c3782-0b39-405f-86bf-8ca2b65b06cf/image` returned **404 Not Found** after completion |
| Queue after completion | Visible **0**, in flight **0** |

Worker log stream:

```text
/ecs/a3-n12281212-unframe-worker
ecs/unframe-worker/cb916ca6f0484d318109cddf9c3436a1
```

Recorded events: `worker_ready`, `job_received`, `job_processing` attempt 1, `job_result_saved`, `job_completed`. Final inspection found **zero** job/startup/queue/cleanup failure events in this stream. `job_received` plus the worker's strict S3 event parser establishes delivery of the native S3 notification through SQS; `job_completed` occurs only after durable result persistence, S3 deletion and SQS acknowledgement. No queue message was manually consumed, no job status was edited, and no manual S3 cleanup was performed.

Read-only evidence is saved in `artifacts/live-deployment/recognition-job.json` and `worker-job-events.json`. The earlier failed job/DLQ evidence was not redriven or deleted. No second live job, negative-control cloud job or 30-job load test was submitted.

## Frontend, CloudFront and public-origin scope

- Existing bucket **`a3-n12281212-unframe-web`**, region **ap-southeast-2**, was reused. It initially contained zero objects and only the username tag.
- Added `purpose=assessment 3` with **S3 Control TagResource**, retaining `qut-username=n12281212@qut.edu.au`. The legacy PutBucketTagging call was rejected because ABAC is enabled; ABAC itself was not changed.
- After the user's explicit confirmation, changed only frontend bucket `BlockPublicPolicy=false` and `RestrictPublicBuckets=false`, retaining `BlockPublicAcls=true` and `IgnorePublicAcls=true`.
- Applied only `Principal:"*"`, `Action:"s3:GetObject"`, `Resource:"arn:aws:s3:::a3-n12281212-unframe-web/*"`. No public list/write rights, visitor images, vectors or job data. No account-level public-access setting was changed.
- Uploaded the verified static export with `aws s3 sync mobile/dist/ s3://a3-n12281212-unframe-web/ --profile default --region ap-southeast-2 --only-show-errors`; **no `--delete`**. Result: **68 objects / 13,345,406 bytes**.

Distribution:

```text
ID: E2CK5412ICFTJX
ARN: arn:aws:cloudfront::901444280953:distribution/E2CK5412ICFTJX
Domain: d3x3iexpafsgf.cloudfront.net
State: Deployed, Enabled=true
Origin: a3-n12281212-unframe-web.s3.ap-southeast-2.amazonaws.com
Origin type: S3 REST; no website hosting, OAI or OAC
Viewer protocol: redirect-to-https
Default root: index.html
Price class: PriceClass_100 (cost-conscious; may add latency for Australian viewers)
Static default TTL: 300 seconds; compression enabled
Custom error responses: none
Tags: purpose=assessment 3, qut-username=n12281212@qut.edu.au
```

Account OAC count remained **100**; no CreateOriginAccessControl call was made. Website root returned HTTPS **200**, HTTP returned **301** to HTTPS, JavaScript and CSS returned **200** with correct MIME types and SHA256 matching the local export. HTML exactly matched local index.html. The served JS contains the verified A3 `/prob` API base. No blanket SPA 403/404 rewriting was added; deep-link behavior was not claimed as tested.

## Step 23 CORS changes and evidence

Final origin: **`https://d3x3iexpafsgf.cloudfront.net`**.

1. Jobs Lambda now has `JOBS_ALLOWED_ORIGINS` set to that exact origin. All existing variables were preserved, with a RevisionId guard. No previous local-development origins were present to preserve. Its code, role and existing 3-second timeout were not changed.
2. Private job-images bucket CORS allows that origin, PUT, `Content-Type` and `If-None-Match`, exposes ETag, max age 300. No previous CORS rules existed. Its four Block Public Access flags remain **true**; its access policy was not changed.
3. Created only `OPTIONS /a3/jobs` (route `qxr7d01`) and `OPTIONS /a3/jobs/{jobId}` (route `gbit508`), pointing to existing integration `fffmtna`. Existing Lambda invoke permissions already allow these methods for those route paths. **No IAM/invoke policy change was needed.**
4. API-wide CORS remains unset, preserving the unrelated A2 routes. CORS is supplied by the Jobs handler and these explicit preflight routes, not a global wildcard.

Live GET/OPTIONS verification, without creating jobs:

| Check | Result |
| --- | --- |
| Jobs-create preflight | 204; exact origin; GET,POST,OPTIONS; Content-Type,X-Job-Token |
| Jobs-poll preflight | 204; exact origin; X-Job-Token permitted |
| Private S3 upload preflight | 200; exact origin; PUT; content-type, if-none-match |
| Unapproved origin | 403, no Access-Control-Allow-Origin |

Evidence: `artifacts/live-deployment/web-runtime.json`. This verifies the transport settings; no additional live browser-camera recognition job was generated. CORS is not authentication: job creation remains unauthenticated and status uses the existing per-job read capability.

## Dashboard and autoscaling limitations

Existing dashboard **`a3-n12281212-unframe`** was read and retained byte-for-byte. It contains the recognition queue depth/age, RunningTaskCount, raw CPU/memory usage, Lambda invocations/errors and DLQ depth. CPU and memory series are `ECS/ContainerInsights:CpuUtilized` and `MemoryUtilized`; these are not percentage `AWS/ECS:CPUUtilization` / `MemoryUtilization`. A two-widget append was prepared, but automatic approval review blocked PutDashboard under the no-overwrite instruction. The user then explicitly chose **Leave dashboard unchanged**, so no update occurred.

Container Insights is enabled; RunningTaskCount exists with `ClusterName=n12281212-strobe-a2`, `ServiceName=a3-n12281212-unframe-worker`. No scalable target or scaling policy exists for this service. The quota-read error was:

```text
AccessDeniedException when calling ListServiceQuotas:
... is not authorized to perform: servicequotas:ListServiceQuotas
because no identity-based policy allows the servicequotas:ListServiceQuotas action
```

Since registration was authorized **only if university quotas permit four tasks**, no target/policy was registered. An authorized instructor/admin must confirm permitted concurrent capacity and available Fargate quota. The maximum permitted capacity remains unknown. No IAM/SCP restrictions were bypassed.

Prepared files remain `deployment/ecs/scalable-target.json` (min 1/max 4) and `autoscaling.json` (`m1 / m2`, visible SQS Sum / running tasks Average, target 3, cooldowns 30/120). Use only after quota confirmation. The single measured 1.23-second job is not a representative latency benchmark; target 3 remains provisional. There is no scaling-policy ARN, managed alarm or demonstrated scale-out result to report.

## Remaining work and screenshot checklist

1. Obtain university confirmation of four permitted concurrent worker tasks, then register/verify the target and policy. No load test until separately authorized.
2. Leave the dashboard as requested; if exact percentage metrics are needed for marking, obtain approval for a guarded append that preserves existing widgets.
3. Planning/AI confirmation Lambda routes remain prepared but **not deployed**. The web shell and recognition pipeline work; do not claim that AI Planner or `/api/ai/artworks/confirm` is cloud-ready. This deployment did not invoke Bedrock or establish its runtime permissions/latency.
4. No broad photographic accuracy, sustained-load, browser-camera end-to-end or scale-out claim is made from the one reference-image job.

Capture these Console screenshots without showing environment credentials, job read tokens or presigned URLs:

- **ECR:** existing repository, tag `v3` and digest `ba7c9461…`.
- **ECS task definition 4:** 0.5 vCPU, 2 GiB, Linux/X86_64, pinned image; roles/logging retained.
- **ECS service:** cluster `n12281212-strobe-a2`, desired/running 1, HEALTHY task `cb916ca6…`, rollout completed, actual image digest.
- **CloudWatch worker stream:** the successful job ID and received/processing/result_saved/completed sequence. No failures for this run.
- **DynamoDB:** projection of jobId/status/attempts/result artwork ID/similarity for `c52c3782…`; exclude tokenHash and any capability.
- **S3 cleanup evidence:** successful PUT from the sanitized test report plus subsequent 404 HEAD; never manually delete to produce this evidence.
- **S3 frontend:** Sydney region, purpose tag, static object list and approved GetObject-only policy; contrast with job-images bucket's four public-access blocks still enabled.
- **CloudFront:** distribution `E2CK5412ICFTJX`, Deployed/Enabled, domain, S3 REST origin, no OAC, HTTPS redirect, index.html root, PriceClass_100.
- **Browser/network:** HTTPS homepage and 200 JS/CSS, API URL `/prob`; CORS preflight headers with exact frontend origin. Avoid starting another scan just for screenshots.
- **Dashboard:** existing eight metric categories, explicitly label raw CPU/memory units.
- **Autoscaling:** Container Insights/RunningTaskCount evidence and quota denial. Do not screenshot an empty policy list as proof of scaling.

Local files added/updated in this continuation: `scripts/verify-one-cloud-job.ts`, `deployment/web/frontend-public-access.review.json`, CloudFront review price class, this report and handover notices. Generated deployment JSON/logs are under ignored `artifacts/live-deployment/`. Production recognition/route code was not modified. No commit was made.
