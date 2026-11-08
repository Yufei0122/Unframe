# Verified technical results and limits

Preparation date: 2026-11-01. All cloud outcomes below are **historical observations on 2026-10-31**. Nothing was rerun for this pack. Source hierarchy: timestamped AWS exports / test receipts first; narrative deployment notes second. Older notes describing scaling as pending or Bedrock as failed are superseded only by the specific later successful cases below.

## Deployment and recognition

| Fact | Verified value / evidence |
| --- | --- |
| Account / region | 901444280953 / ap-southeast-2 |
| Service / cluster | `a3-n12281212-unframe-worker` / `n12281212-strobe-a2` |
| Image / task | v5, revision 6; [deployed digest check](evidence/config/v5-deployment-verified.json) |
| Digest | `sha256:a0e14f0a51d37614f8ca567abdeb19f0f9edb1d0837413c85f1ead7ba9ceb258` |
| Task allocation | Linux/x86_64, 512 CPU units (0.5 vCPU), 2048 MiB (2 GiB), single serial job processor; `OPENCLIP_THREADS=1` |
| Model | OpenCLIP ViT-B-32, `laion2b_s34b_b79k`; normalized 512 D vectors |
| Store / filters | Real S3 Vectors, 15 references; `$and` equality filters for `museumId`, `model`, `pretrained`, `version`, `catalogueHash`; sourceHash/imageHash non-filterable |
| Recognition contract | Similarity = 1 − cosine distance; threshold 0.80; descending accepted candidates, at most 3; visitor confirmation required |
| Real browser case | `993cca74-1545-4786-8f63-427ae7984723`, `met`, `water-lilies` first, similarity 0.9999953508377075; one returned candidate; [trace](evidence/recognition/F18-browser.json) |
| Initial cloud batch | 30/30 first-attempt successes; mean 539.47 ms, range 473–724 ms, p95 709 ms; [batch evidence](evidence/recognition/F14-load-results.json) |
| Sustained batch | **883/883 correct successes**, zero submission failures, zero retried/failed jobs; [verdict](evidence/scaling/F14-F16-verdict.json), [all projected results](evidence/scaling/jobs.json) |
| Processing interval | **548.454 ms mean / 663 ms p95**, 883 log-correlated samples |
| End-to-end interval | Created-to-complete mean 88.267 s, p95 approximately 163 s, maximum approximately 180 s in this deliberately backlogged experiment; not interchangeable with 548 ms processing time |
| Work distribution | 765 / 59 / 59 completions across the three task IDs in the verdict |

**Measurement limit:** these runs repeatedly used the same 372,985-byte public `water-lilies.jpg`. A 100% known-reference success rate is not a general artwork-recognition accuracy score. Different paintings, camera angles, lighting, unrelated photos and user concurrency were not comprehensively benchmarked. GOMA exclusion and filter-payload checks are covered by local tests; do not relabel mocked AWS results as live queries.

**UI boundary:** POST job/create, direct S3 PUT, status polling and candidate display worked. The optional interpretation request after confirmation did not have a deployed endpoint. [Confirmation screenshot](evidence/recognition/F18-confirmation.png) contains that failure notice. Cloud Planning Lambda is undeployed; local route algorithms are not evidence of a working cloud planner.

## Local resource evidence versus real ECS metrics

| Measurement | v5 local Docker benchmark | Meaning |
| --- | ---: | --- |
| Completed jobs / health checks | 12 / 15 | Production entrypoint, real OpenCLIP, **all AWS SDK calls mocked**, network disabled |
| CPU / memory limits | 0.5 CPU / 2 GiB, no swap | Approximation of Fargate allocation, not identical CPU scheduler |
| Worker + model readiness | 53.987 s | Includes imports and readiness polling; not just weight deserialization |
| Cgroup memory peak | 1,537,060,864 bytes = 1465.855 MiB = 1.4315 GiB | Includes charged cache; more useful than summing separate process peaks |
| Inference sampled memory peak | 1,490,587,648 bytes = 1421.535 MiB | Peak sampled after startup; sampling can miss transients |
| CPU average over harness lifetime | 33.4338% of one core | Includes idle time; not ECS CPUUtilization percentage |
| Job durations | 0.511–1.801 s; mean approximately 0.786 s | Local mocked-service processing, not live cloud latency |
| OOM / OOM kill / exit | 0 / 0 / exit 0 | No limit increase required; [v5 receipt](evidence/local/v5-worker-limits.json) |

Earlier optimized-image private-cache test: 30/30 jobs, readiness 32.688 s, peak 1488.32 MiB, 33 health checks, no OOM. This is a **different image/run**, documented in [worker-resource-verification.md](../worker-resource-verification.md), with originals in `artifacts/worker-limits/private-cache/`. Do not combine the fastest startup from one run and lowest memory from another as one result.

Live sustained run: peak service CPUUtilization 96.01225%, MemoryUtilization 43.6361% in the recorded samples; [AWS-rendered utilization graph](evidence/scaling/worker-utilization.png) and [metric data](evidence/scaling/F14-F16-cloudwatch-metrics.json). These service aggregates are not a measured per-container maximum RSS. Scaling workers stopped by ServiceSchedulerInitiated with exit 0; no unexpected task failures. The data supports serial recognition feasibility at the course allocation, not an unrestricted traffic guarantee.

## Automatic scaling timeline

Policy: visible SQS messages (`Sum`) / ECS Container Insights RunningTaskCount (`Average`), target 3; min 1/max 3; cooldowns 30 s out /120 s in. Managed high alarm: three 60-second breaching periods above 3; low alarm: fifteen periods below 2.7. No manual DesiredCount change. [Target](evidence/scaling/final-target.json), [policy](evidence/scaling/final-policy.json), [alarms](evidence/scaling/alarms.json).

| Event, 2026-10-31 | UTC | Brisbane AEST |
| --- | --- | --- |
| First accepted job | 08:06:03.779 | 18:06:03.779 |
| Last accepted job | 08:11:01.327 | 18:11:01.327 |
| High-alarm scale-out action starts | 08:11:06.016 | 18:11:06.016 |
| First observed actual running 3 | 08:12:15.317 | 18:12:15.317 |
| All 883 durable successes observed | 08:13:15.343 | 18:13:15.343 |
| Sustained empty queue observed | 08:14:15.806 | 18:14:15.806 |
| Scale-in to 2 action starts | 08:29:35.529 | 18:29:35.529 |
| Actual running 2 first observed | 08:29:56.083 | 18:29:56.083 |
| Scale-in to 1 action starts | 08:32:35.511 | 18:32:35.511 |
| Actual desired 1/running 1 first observed | 08:32:56.047 | 18:32:56.047 |
| Final read-only health check | 08:36:30.782 | 18:36:30.782 |

- Submitted/uploaded 883 jobs over 300.115 s; five-minute deadline stopped new submissions before scaling became observable. Approximate achieved throughput 2.94 submissions/s.
- Peak visible queue: **337 direct API observation**, **321 CloudWatch published sample**; peak oldest age 173 s. Counts are approximate and sampled at different times.
- Actual running sequence **1→3→2→1**. F14, F15, F16 **PASS**. Successful activities: out`5a0295b6-b643-4649-8589-8a1b8d0271b4`; in 2`6bbb5138-26c3-4572-94d4-25bcdace075c`; in 1`8978998f-05aa-45d6-aa7b-eedbd240453b`.
- [Activities](evidence/scaling/F15-F16-scaling-activities.json), [observations](evidence/scaling/observations.json), [running graph](evidence/scaling/F15-F16-running.png). `AlreadyAtMaxCapacity` is a guardrail outcome, not a launch failure.
- Earlier 30 jobs drained in roughly 18 s with zero backlog in the one-minute sampled series; no three-period breach, therefore no scale-out. Target 3 implies only about 1.65 s of queued compute at 548 ms/job, **not** a1.65 s latency guarantee because publication, alarms and startup take time.
- Numeric Fargate quota read denied. Three successful running tasks prove capacity then, not future headroom. Active-work scale-in protection is absent; this experiment drained before scale-in and does not prove mid-job termination safety.

## Bedrock, caching, persistence and errors

| Finding | Evidence and boundary |
| --- | --- |
| Real optional Analyse success | Job`48eb6b33-57e8-4d22-92bd-67690289915c`, method`vision`, attempt 1, SUCCEEDED. `bedrock_complete` identifies Gemma, elapsed 2785 ms; processing-to-completion 4.234 s. [Safe events](evidence/bedrock/F12-worker-events.json), [summary](evidence/bedrock/F12-summary.json). One actual invocation, not catalogue fallback. |
| Strict output contract | Worker v5 retains schema validation and safe diagnostics. Earlier v4 BEDROCK_SCHEMA failures are historical; success in this later case does not identify the exact earlier invalid field or prove all model responses valid. No raw response copied. |
| Durable results / cleanup | F12 verifies DynamoDB result equals API result, then image HEAD 404. Successful cleanup is explicit deletion; S3 lifecycle is fallback and DynamoDB TTL removal is asynchronous. Do not claim all 883 images individually received HEAD checks. |
| Cache | Three static JS requests, HTTP 200: RefreshHit, Hit, Hit; Age 1 on later responses; durations 1285/277/264 ms in the saved check. [Headers](evidence/recognition/F19-cache.json). No fabricated cold miss; no causal latency benchmark; no measured 95% monthly hit ratio. |
| Retry/DLQ | Visibility 300 s; source redrive maxReceiveCount 5; three historical DLQ messages remained 3. Zero new load-test retries/failures. Historical Analyse terminal failure after five attempts documents failure handling, not successful recovery of every poison message. |
| Logging | Safe stage/error/request-ID/schema-shape diagnostics; worker and Lambda logs have no expiry, CI performance logs 1 day. No private image, raw response, credentials or job capability belongs in report screenshots. |
| Restrictions | Planning Lambda CreateFunction denied; numeric quota/IAM detail/security coverage reads restricted. No permission bypass, IAM modification or cloud planner deployment claimed. Shared static origin workaround and API tag exception remain explicit limitations. |

## Prior regression receipts, not fresh runs

- [v5 root tests](evidence/local/root-tests.txt): **171 passed /0 failed**.
- [Mobile tests](evidence/local/mobile-tests.txt): **40 passed /0 failed**; [TypeScript check](evidence/local/mobile-check.txt) passed.
- [Focused browser suite](evidence/local/browser-focused.txt): **9 passed /1 skipped**, not all-browser coverage or live AWS tests.
- Scaling-tool regression: **23 passed /0 failed**, six pacing/safety plus 17 AWS Jobs tests; [scaling report](../a3-autoscaling-results.md).
- Earlier Python suite 32 passed in local resource report. This is older evidence, not a v5 full-language rerun.

## Measured operational inputs for costing

Closed window 08:05–08:35 UTC: Lambda 883 invocations /0 errors, runtime mean 54.591 ms, billed mean 59.414 ms, 5 cold starts, maximum 118 MiB. SQS 883 sent/883 received/883 deleted plus 177 empty receives, message 864 bytes. Worker logs 381,299 bytes; Lambda logs 304,103 bytes. [Lambda evidence](evidence/cost/lambda-reports.json); detailed metric sources linked from [pricing inputs](../a3-pricing-calculator-inputs.md).

Frontend 68 objects/13,345,406 bytes; reference JPEG 372,985 bytes; ECR about 3.61745 GiB deduplicated content. Poll delay 1500 ms comes from code. Six polls/job, 100 ms Lambda billing, 50 always-concurrent users, monthly token totals, 95% cache hit and 30 monthly scaling bursts are **forecasts**, not measurements. Model-level Bedrock token metrics include shared-account traffic and cannot attribute tokens to this project.
