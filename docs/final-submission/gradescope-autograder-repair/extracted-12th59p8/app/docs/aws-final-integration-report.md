# Unframe final AWS integration evidence

**Historical snapshot:** superseded by [recognition-only final verification](recognition-final-verification.md). Cloud tour planning is now explicitly Future Work, not an A3 deployment requirement. Do not use the older statuses below as current deployment claims.

Verified 31 October 2026 AEST, account **901444280953**, profile **default**, region **ap-southeast-2**. This is a factual deployment handover, not the student's assessment report. Evidence is in [verification/2026-10-31/aws-final](../verification/2026-10-31/aws-final/). Earlier reports are historical snapshots.

## Status

| Phase | Status | Actual result and remaining action | Evidence in the evidence directory |
| --- | --- | --- | --- |
| C Analyse | **FAIL against the Bedrock acceptance criterion** | Job `d697fc84-9c23-4f15-abd0-2bcd5f040dc8` succeeded, but `method=collection`, `visionMs=0`: no Bedrock invocation. A separate pre-existing Analyse job fails with `BEDROCK_JSON`. Diagnose that response-format failure before more generative tests. | `F12-analyse.json`, `F12-persisted-result.json`, `F12-image-cleanup.txt`, `final-worker-events.json` |
| D scaling target | **PASS** | Registered min 1/max 4 on `service/n12281212-strobe-a2/a3-n12281212-unframe-worker`. Registration succeeded despite quota inspection denial. | `F13-target.json`, `F13-register-target.txt` |
| D scaling policy | **PASS configuration** | `unframe-sqs-backlog`, visible SQS Sum / RunningTaskCount Average, target 3, cooldowns out 30/in 120. Two real managed alarms exist. This is not scale-out proof. | `F13-policy.json`, `F13-alarms.json` |
| D load test | **BLOCKED** | No load generator run. Quota permission/capacity is unverified and a pre-existing Analyse job repeatedly failed. No task-count increase or scale-out was observed. | `quota-denial.txt`, `final-scaling-activities.json`, `final-service.json` |
| F Web Scan | **BLOCKED for complete confirmation; recognition PASS** | Browser job `f81413e3-2075-4571-898c-8e05701bd1c5` succeeded and displayed Water Lilies, similarity `0.9999953508377075`. Exactly one job, no suppressed extra jobs. Candidate selection opens details but AI interpretation fails because its API transport is undeployed. | `F18-browser.json`, `F18-candidate.png`, `F18-confirmation.png` |
| F caching | **PASS** | Real static JS returned `RefreshHit`, `Hit`, `Hit`; no miss was manufactured. API job responses use `no-store` and go directly to API Gateway. | `F19-cache.json`, `F18-browser.json`, `cloudfront.json` |
| G dashboard | **PASS** | Updated only the combined CPU/memory widget in `a3-n12281212-unframe`; all six other widgets preserved. Eight series returned real data. | `F20-widget-change.json`, `F20-dashboard-after.json`, `F20-metric-data.json` |
| H Planning | **BLOCKED** | Node 22 Linux ZIP verified; AWS explicitly denied CreateFunction. No function, integration, routes or invoke permissions were created. No live planning request was submitted. | `planning-package.json`, `planning-create.txt`, `planning-role-inspection.txt` |
| Gradescope readiness | **PENDING** | Draft inventory YAML and source-only `app/` prepared. Shared-resource tagging/identifier handling needs course review. Scaling proof, generative inference, report, video and calculator share link remain incomplete. | `resource-inventory.json`, `source-manifest.json`, [submission audit](a3-submission-audit.md) |

## Live baseline and changes

ECS remains on task definition **a3-n12281212-unframe-worker:4**, task **cb916ca6f0484d318109cddf9c3436a1**, desired/running **1/1**, pending **0**, healthy. The actual image digest equals `sha256:ba7c946125932a59495a56c37ea299911a345514c0775ff9e4a4d1f7798cdada` (v3), at **512 CPU / 2048 MiB / Linux x86_64**. No image rebuild, push, ECS revision or worker deployment occurred in this continuation.

Actual API: **4xfbhsso7a**, shared name `n12281212-strobe-api`; both `$default` and `prob` stages auto-deploy. The verified A3 frontend base is **https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob**. Jobs routes use integration `fffmtna`. No `/api/ai/` Planning or confirmation routes exist. API-wide CORS and unrelated A2 routes were preserved.

CloudFront **E2CK5412ICFTJX**, **https://d3x3iexpafsgf.cloudfront.net**, still serves `a3-n12281212-unframe-web`. The deployed bundle contains the correct API base and no localhost API base. The browser test demonstrates actual job-mode transport rather than merely checking the word `jobs` in the bundle.

Applied AWS changes:

1. Registered scalable target `arn:aws:application-autoscaling:ap-southeast-2:901444280953:scalable-target/0ec5ae38e76bce6147649316c9b9741c455c`.
2. Created target-tracking policy `unframe-sqs-backlog` and AWS-managed high/low alarms. Full identifiers are in `F13-policy.json`.
3. Replaced dashboard widget index **3**, retaining its position, size, period and six unrelated widgets. Both metrics now use `AWS/ECS`, `CPUUtilization`/`MemoryUtilization`, Average, ClusterName/ServiceName. Guarded the write by comparing the live DashboardBody with the inspected snapshot. PutDashboard returned no validation messages.
4. Added `purpose=assessment 3` to the private image bucket via S3 Control additive tagging. Added the correct purpose and username tags to the two dedicated log groups. Preserved the existing misspelled worker log tag `" purpose"`; the exact required `purpose` now also exists. Verified the resulting tags. No bucket access settings changed.
5. Added both required tags to the new scaling target and its two managed alarms after discovering they lacked the full tag pair. This did not change policy behaviour or alarm thresholds.

The shared API still has `purpose=assessment 2`. Shared networking, course IAM roles and provider-managed resources were not retagged. The official FAQ permits existing ECS cluster reuse without relabelling. Instructor guidance is needed for shared API/managed dependency inclusion in Gradescope; their tags were not silently altered.

## Analyse and failure diagnosis

The one requested Analyse used `mobile/assets/water-lilies.jpg`, `museumId=met`, `operation=analyse`. Create **201**, raw S3 PUT **200**, poll **200**, terminal **SUCCEEDED**, attempt **1**. Client elapsed **4604 ms**, matching **510 ms**, visual inference **0 ms**. The result contains `collection:water-lilies`, similarity **0.9999953508377075**. A consistent DynamoDB read confirmed the persisted result, while S3 HeadObject returned **404** after worker completion. Nothing was manually deleted or acknowledged.

`server/ai/artwork-analysis.js` intentionally returns catalogue notes for a distinctive reference match. Therefore this exact fixture cannot establish a real Bedrock Analyse call while preserving existing business logic. Worker logs show received, processing, result saved and completed, but no `bedrock_complete` for this job. The API, S3 notification, SQS worker delivery and durable result path were exercised; Bedrock was not.

Preflight discovered an already-existing job **19446b07-c342-4a75-82c7-f609db1e3b8f**, operation `analyse`, retrying every visibility interval. Its bounded logs identify:

```text
code=PROCESSING_FAILED
stage=bedrock_analysis
service=Bedrock
operation=Analyse
exceptionType=AIError
errorCode=BEDROCK_JSON
awsErrorCode=null
awsRequestId=null
httpStatusCode=null
```

`server/ai/bedrock.js:parseBedrockJSON` emits this error only when JSON.parse fails after a completed assistant text response. This identifies response parsing, not an IAM or S3 Vectors validation failure. The current logger emits `bedrock_complete` only after parsing and loses response request metadata on parse failure. The raw response was not retrieved or logged, so Markdown fences, prose or another formatting cause remain **unconfirmed**. Do not treat null request metadata as evidence of no model request. The final log snapshot records repeated failures; no new generative fixture, redrive or deletion was attempted.

Next technical work: capture only safe response-shape facts and AWS request metadata on parser failure, reproduce with a non-private fixture in a bounded test, and fix only a confirmed transport/parsing issue with schema-validation regression coverage. Do not weaken schema validation, change model, silently fall back or keep submitting jobs to produce evidence.

## Scaling evidence and limitations

Container Insights is enabled and RunningTaskCount has the correct cluster/service dimensions. Target tracking uses the existing `deployment/ecs/autoscaling.json`, following [AWS's SQS backlog-per-task metric-math example](https://docs.aws.amazon.com/autoscaling/application/userguide/application-auto-scaling-target-tracking-metric-math.html). One-minute metrics are visible Sum divided by running Average. Minimum one avoids division by zero; scale-to-zero is not implemented.

Target **3** is provisional. A prior real reference recognition took **1.230 s** from processing to completion; this continuation's reference Analyse used the faster catalogue shortcut. Assuming an illustrative acceptable queue wait of **5 s**, `5 / 1.23 = 4.07` jobs/task; target 3 is a conservative starting point (~3.69 s queued work) for that narrow workload. This is not a measured latency SLO, p95 estimate or representative generative workload. Retries, in-flight work, model latency, image variation, cold starts and metric delay can dominate.

AWS generated a high alarm with **3 evaluation periods** and low alarm with **15 evaluation periods**, each one minute. Cooldowns alone do not imply immediate scaling. The observed activity was `AlreadyAtMinCapacity` with minimum 1; no task-count change occurred. Thirty fast jobs may drain before three high periods. Do not increase test load or lower thresholds to manufacture scaling evidence.

Quota lookup failed with `AccessDeniedException`: `servicequotas:GetServiceQuota` on `arn:aws:servicequotas:ap-southeast-2:901444280953:fargate/L-3032A538` is not allowed by an identity-based policy. This did **not** prevent registration or policy creation, but available capacity for four tasks remains unverified. The load test was not run because its explicit prerequisites are unmet.

## Browser, caching and monitoring

The Playwright helper uses installed Chrome, denies camera access, uploads only the public reference and permits at most one POST job. The first two browser initialization attempts submitted **zero** jobs; their evidence is retained. The successful run used the real CloudFront UI, actual API and S3 upload. It captured the candidate screen and the selected-artwork screen. Selection did not auto-confirm recognition; the visitor chose Water Lilies. AI interpretation then failed at the missing endpoint, while catalogue details remained accessible. No claim is made about real-camera sustained scanning; local regression tests cover its concurrency controls.

The exact JS asset `/_expo/static/js/web/index-31a0793bc093765b55760af215024b9e.js` returned:

| UTC timestamp | HTTP | X-Cache | Age | Cache-Control | Download ms |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30T19:57:41.264Z | 200 | RefreshHit from cloudfront | absent | absent | 1306 |
| 2026-10-30T19:57:42.574Z | 200 | Hit from cloudfront | absent | absent | 282 |
| 2026-10-30T19:57:42.858Z | 200 | Hit from cloudfront | 1 | absent | 268 |

The distribution supplies a 300-second default TTL despite absent object Cache-Control. These samples establish cache reuse, not an origin-miss benchmark or general latency improvement. No invalidation was performed. CloudFront has a static S3 origin; Jobs uses direct API Gateway responses with `Cache-Control: no-store`.

All eight dashboard series returned Complete data. The inspected latest CPU sample was **3.56345%**, memory **40.55176%**, RunningTaskCount **1**. These are ordinary-operation samples, not load-test results. Full timestamps and values are in `F20-metric-data.json`; no fabricated Console screenshot is supplied.

## Planning deployment blocker

Package `artifacts/lambda/unframe-lambda-node22-x64.zip`: **25,889,437 bytes**, **6242 entries**, SHA256 **008a3dd6a2011fadb1db2672fc8c7ec17188dd57fa6d89b0e76f825faa567f73**. Archive handler matches local `server/cloud/planning.js`; Linux x64 Sharp is included and credential/environment filenames are absent. The earlier Docker build tested the imports in the official Node 22 Lambda image. This session rechecked package contents and ran stage-aware transport/route tests.

Requested function: `a3-n12281212-unframe-planning`, handler **server/cloud/planning.planningHandler**, runtime **nodejs22.x**, x86_64, memory **1024 MiB**, timeout **30 s**. Existing course role discovered from the Jobs Lambda: **arn:aws:iam::901444280953:role/CAB432-Lambda-Role**. No role or IAM policy was created or changed.

AWS returned:

```text
AccessDeniedException when calling the CreateFunction operation:
User: arn:aws:sts::901444280953:assumed-role/AWSReservedSSO_CAB432-STUDENT_f2baa6a2ba3c79c9/n12281212@qut.edu.au
is not authorized to perform: lambda:CreateFunction
on resource: arn:aws:lambda:ap-southeast-2:901444280953:function:a3-n12281212-unframe-planning
with an explicit deny in an identity-based policy:
arn:aws:iam::901444280953:policy/Do-Not-Delete-LT1-DenyPolicy-4
```

The original CLI error is retained in `planning-create.txt`. IAM ListAttachedRolePolicies also returned AccessDenied, so effective Bedrock permissions for that role could not be confirmed. Deployment stopped at the explicit deny. No alternate identity, region, role or configuration was tried to bypass it. Ask the course administrator which permitted deployment configuration or approved function should be used; do not overwrite the unrelated Strobe functions.

## Local changes and verification

No production recognition, embeddings, model weights, threshold, retry logic, native scanner, routes, graph or Dijkstra code changed. Added read-only audit helpers, one-job verification helpers, evidence/submission preparation scripts, tag-review JSON, documentation and the requested source snapshot. AWS changes are listed above. No commit was made.

- `node --test tests/*.test.js`: **160 passed**.
- `node --test tests/aws-*.test.js tests/planning-runtime.test.js`: **66 passed** (overlapping subset, not 66 additional tests).
- `npm.cmd --prefix mobile test`: **40 passed**.
- `npm.cmd --prefix mobile run check`: **passed**.
- Real CloudFront browser recognition and static-cache checks: passed within the limitations above.

Exact read/verification commands are in [the command record](aws-final-verification-commands.md). The official submission audit and F1–F20 checklist are in [a3-submission-audit.md](a3-submission-audit.md).
