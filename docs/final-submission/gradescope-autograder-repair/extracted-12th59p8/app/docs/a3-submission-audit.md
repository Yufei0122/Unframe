# CAB432 A3 submission audit

**Current scope/status update (31 October, final recognition run):** Cloud AI Tour Planning is deliberately excluded and is Future Work, not an outstanding A3 deployment task. See [the current final verification](recognition-final-verification.md) and [cost worksheet](a3-cost-and-sustainability.md). Worker v5/revision 6 is healthy; the one real Bedrock case passed; 30/30 recognition jobs passed but did not cause scale-out. Current evidence and source manifest are under `verification/2026-10-31/recognition-final/`. The tables below retain the earlier audit as historical context; their former deployment blockers are not the current checklist.

This checklist is based on the official assignment text in `D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\SS.docx`, read on 31 October 2026, and the marking criteria supplied by the student. It records requirements and evidence; it is not a drafted assessment report. F1–F20 are project evidence labels, not an official marking scheme.

## Submission format and readiness

| Required deliverable | Verified requirement | Current readiness |
| --- | --- | --- |
| Report to Canvas | PDF, maximum 30 pages including diagrams, excluding references/appendices; student drafts the whole report | **PENDING student authorship** |
| Video to Canvas | 4–5 minute screen recording showing functionality, scaling, caching and asynchronous behaviour; explicitly click Submit | **PENDING**, scaling evidence blocked |
| Source to Gradescope | Application source code | **PREPARED** in root `app/`; manifest records source hashes; review snapshot before submission |
| Infrastructure to Gradescope | `cloudInfrastructure` entries with type, actual ARN/identifier and one-sentence purpose; `metaData.qutUsernameTag` | **DRAFT** `submission-a3-infra.yml`; not CloudFormation, must review managed/shared resource handling |
| Cost estimate | Average demand of 50 concurrent users, or an explicitly justified lower supported demand; AWS Pricing Calculator public share link and per-service totals | **PENDING**; assumptions worksheet prepared, no invented price total/link |
| Resource identity | Sydney regional resources, student ID names, `purpose=assessment 3`, username tag | Dedicated resources audited and three tag omissions corrected; shared API/managed dependencies require clarification |

The official FAQ explicitly permits reusing an ECS cluster without relabelling and extending the existing API with new prefixed paths. Unframe is a separate application; reuse of cluster/API infrastructure is not a continuation of Strobe application functionality. CloudFront, IAM and the dashboard are global resources; identify that exception explicitly rather than claiming their ARNs contain a regional component.

Gradescope checks declared infrastructure existence/tags/region, **not** end-to-end correctness. Passing its checks cannot replace missing runtime evidence. The proposed YAML deliberately includes actual shared networking, course roles and the configured AWS-managed model as dependencies. Before submission, ask the teaching team how their checker expects these shared/provider-managed/global identifiers to be declared; do not retag school-owned resources or remove dependencies merely to hide a failure.

## Pattern coverage

The following are implemented concepts, not a claim that every service is a distinct pattern. At least eight selected concepts must be justified by the student, with at least one from each mandatory category.

| Pattern/category | Implementation/evidence | Limitation to explain |
| --- | --- | --- |
| Structured storage (required storage) | DynamoDB conditional job state/lease updates, persisted results, enabled expiresAt TTL | TTL deletion is asynchronous; job read capability is not account authentication |
| Unstructured storage | Private S3 uploads; public static frontend bucket | Failed images use one-day lifecycle expiry; public static origin is the instructor-approved course workaround |
| Edge caching (required caching) | CloudFront actual RefreshHit/Hit evidence F19 | No origin miss observed; object Cache-Control absent, distribution TTL supplies caching |
| API gateway (required communication) | HTTP API 4xfbhsso7a, payload v2, named-stage parsing | Shared A2 API, exact route scope; Planning routes missing |
| Message queue | S3 ObjectCreated -> SQS, visibility/retry/DLQ | Existing Analyse failures expose a parser issue; duplicates need conditional claims |
| Polling | Web job client uses per-job token until terminal state | More poll requests increase request cost; cancellation does not necessarily cancel queued work |
| Containers (required compute) | Fargate Linux/x86 worker 0.5 vCPU/2 GiB, OpenCLIP single process | Minimum one always-on task; startup/model download/deploy latency |
| Serverless computing | Node 22 Jobs Lambda | Built-in Lambda scaling is **not** valid evidence for the mandatory scaling category |
| Metric-based scaling (required non-Lambda scaling) | Configured backlog-per-running-task target tracking, min 1/max 4 | **Runtime scale-out/scale-in evidence missing**; policy configuration alone is insufficient |
| Worker-pull (required load distribution) | SQS long polling, MaxNumberOfMessages=1, serial process/ack | Actual distribution across multiple workers is untested while running count is 1 |
| Event-driven architecture | Upload event drives processing independently of browser polling | No direct browser-to-worker invocation; delayed/repeated delivery is possible |
| Resilience | Leases/conditional writes, retry visibility, bounded inference and DLQ | Parser failure retries currently do not repair malformed model output |
| AI/ML | OpenCLIP, normalized 512D cosine retrieval, model/catalogue metadata | Successful reference retrieval is not visitor-photo accuracy or generative-model success |
| Monitoring | Worker stage diagnostics, eight CloudWatch series, scaling activity | Bedrock parse failures currently lose request metadata; log retention remains default |
| Garbage collection | Automatic successful-image deletion; lifecycle fallback; DynamoDB TTL | Cleanup is verified for completed jobs, not instantaneous for failures |

There are enough implemented candidate patterns, but the required scaling demonstration is currently incomplete. The student must choose and explain relevant alternatives, trade-offs and measured limitations rather than list services as an architectural justification.

## Evidence checklist

Paths below are relative to `verification/2026-10-31/aws-final/`, except explicitly named historical artifacts. Console screenshots/video still need student capture where only JSON is present. Never expose job capabilities, token hashes, presigned URLs, private images or credentials.

| Figure | Intended evidence | Current evidence/status |
| --- | --- | --- |
| F1 | Separate Unframe requirements and architecture | **PENDING student diagrams/requirements**; inventory and this matrix are factual inputs |
| F2 | Worker container build and limited-resource baseline | Historical `artifacts/live-deployment/worker-build.log`, `worker-limits/summary.json`; not rerun this session |
| F3 | DynamoDB state and TTL | `jobs-table.json`, `jobs-ttl.json`, `F12-persisted-result.json` |
| F4 | Private image storage, lifecycle, cleanup | `public-access-a3-n12281212-unframe-job-images.json`, `image-lifecycle.json`, `F12-image-cleanup.txt` |
| F5 | SQS/DLQ/event notification | `image-notifications.json`, `attributes-*.json`; worker events corroborate receipt; no message bodies saved |
| F6 | Vector schema and 15 reference vectors | `vector-index.json`, `vector-keys.json`; float32/512/cosine, sourceHash and imageHash non-filterable |
| F7 | Correct filter and known-artwork retrieval | Live F18 similarity plus regression tests; previous Step 15 query evidence under `artifacts/worker-diagnosis/`; no reindexing |
| F8 | Lambda/API v2 and named stage | `lambda-functions.json`, `api.json`, `api-stages.json`, `api-routes.json`; API public base in F12/F18 |
| F9 | ECR image/digest | `ecs-task.json`; prior ECR push/inspection in `artifacts/live-deployment/`; actual task digest matches v3 |
| F10 | ECS resource constraints and health | `ecs-task.json`, `task-definition.json`, `final-service.json` |
| F11 | Real asynchronous recognition | `F18-browser.json`, `final-worker-events.json`; historical job c52c3782 also succeeded |
| F12 | Real Bedrock Analyse | **NOT SATISFIED**: requested image used catalogue shortcut; unrelated existing job reached parsing error BEDROCK_JSON; no successful generative result |
| F13 | Scaling target, policy and alarms | `F13-target.json`, `F13-policy.json`, `F13-alarms.json` **PASS configuration only** |
| F14 | Controlled load backlog | **BLOCKED**; baseline queue series exists, no load generated |
| F15 | Real scale-out and increased task count | **MISSING**; AlreadyAtMinCapacity is not scale-out |
| F16 | Load drainage and scale-in | **MISSING**; no controlled load/scale-out run |
| F17 | Frontend bucket and CloudFront configuration | `cloudfront.json`, `frontend-location.json`, frontend tag/access evidence; public static origin scope documented |
| F18 | Real CloudFront Web Scan | `F18-candidate.png`, `F18-confirmation.png`, `F18-browser.json`; recognition PASS, interpretation BLOCKED |
| F19 | CloudFront cache reuse | `F19-cache.json`; real RefreshHit/Hit/Hit; API `no-store` in F12/F18 |
| F20 | Correct eight operational metrics | `F20-widget-change.json`, `F20-dashboard-after.json`, `F20-metric-data.json`; no fabricated Console screenshot |

## Security, reliability and cost facts

- Private image bucket retains all four public-access blocks; only the static frontend bucket has approved anonymous GetObject. No public list/write access was added.
- Job creation is unauthenticated. Exact-origin CORS constrains browser access but is not authentication or protection against scripted API use. Per-job read tokens protect result retrieval; API-rate/cost abuse needs consideration before a public production launch.
- No credentials, read tokens, presigned URLs, model caches or visitor images are copied to `app/`. The browser evidence uses only the public Water Lilies asset. Evidence JSON projects DynamoDB fields to omit token hashes.
- ECS uses existing school roles and the shared default security group. The group allows intra-group traffic and general outbound IPv4; it is not a claim of dedicated least-privilege network isolation. The task uses public subnets/public IP; networking was not modified.
- Logs have no configured retention period in the inspected response. Earlier course permission constraints are documented; no retention change was attempted here. Do not claim seven-day deletion.
- Recognition filters preserve museum/model/pretrained/version/catalogue identity, with similarity `1 - cosine distance`, threshold 0.80, max three response candidates and visitor confirmation. General Analyse's existing collection search spans the catalogue without museumId; this was not changed or misrepresented as museum-scoped recognition.
- No AWS vector, queue message or job record was overwritten/deleted by this work. Successful-image cleanup was performed by the existing worker. Existing failing/DLQ evidence was retained.
- Scaling maximum 4 is a configured ceiling, not proof that school quotas permit four tasks. Current running count is 1. Load test remains explicitly gated.

## Cost assumptions for student validation

Use [AWS Pricing Calculator](https://calculator.aws/) with Sydney Linux/x86 Fargate, 0.5 vCPU/2 GiB per task, 20 GiB included ephemeral storage unless live configuration differs, and 730 hours/month as an **assumption**. Enter actual per-service rates and save the required public share link. AWS documents [sharing an estimate](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/save-share-estimate.html) and [Fargate billing dimensions](https://aws.amazon.com/fargate/pricing/). No estimate/share link or dollar total has been generated in this session.

The following scenarios are calculations, **not measured user demand or capacity tests**:

| Assumption | Lower-frequency scenario | Higher-frequency sensitivity |
| --- | --- | --- |
| Average simultaneous visitors | 50 | 50 |
| One recognition per visitor | Every 5 minutes | Every 1 minute |
| Arrival rate | 0.1667 jobs/s | 0.8333 jobs/s |
| Jobs in 730 hours | 438,000 | 2,190,000 |
| Reference processing-time assumption | 1.23 s/job from one prior job | Same, not representative of analysis |
| Nominal worker utilization at one task | 20.5% | 102.5%, unstable without more capacity |
| Illustrative tasks at <=70% utilization | ceil(0.1667*1.23/0.7)=1 | ceil(0.8333*1.23/0.7)=2 |

Fifty simultaneous submissions are a different burst from fifty browsing visitors. A single serial worker at the reference duration would take roughly 61.5 seconds for 50 jobs, excluding cold start, retries and network delay; this was **not tested**. Model-call durations and schema failures can make the actual system much slower.

The student's calculator inputs should include: worker task-hours and public IPv4-hours; ECR image storage; S3 PUT/GET/DELETE and average retained bytes; DynamoDB item sizes/read/write requests and TTL behaviour; SQS request units/long polls/retries; Jobs Lambda invocations/GB-seconds plus poll frequency; API Gateway requests; CloudFront requests/data transfer and hit rate; S3 Vectors storage/query volumes; Bedrock input/output tokens by operation; CloudWatch metrics/log ingestion/storage/alarms/dashboard. Distinguish shared infrastructure allocation from incremental Unframe cost. Do not price the unrelated shared NAT gateways as used by these public-subnet worker routes without evidence.

For Bedrock, measure the fraction of jobs actually invoking the model and their token counts. Recognition and strong-match Analyse can make **zero** model calls; failed parse responses may still be billable. Configuration alone cannot determine token usage. A 15-minute representative interaction sample and its metrics are still needed; existing reference tests are too narrow to establish realistic demand.

Factual sustainability inputs: one shared in-memory model per worker; one CPU thread; cached static assets; catalogue shortcut avoids redundant generation; bounded image/result retention; minimum one Fargate task incurs idle resource use; wider scaling replicates model memory and startup costs. No energy/emissions savings were measured. The student should evaluate these trade-offs rather than claim numerical environmental benefits.

## Student report and video outline

Use the prescribed title `CAB432 Assignment 3 2026`, application subtitle, name/student ID, AI-use declaration, one-page executive summary and contents. Draft the introduction/requirements, vendor-agnostic architecture, AWS implementation, application data flow/error behaviour, cost/sustainability, reflection, references and appendices personally. Include two distinct readable architecture diagrams; text should remain approximately 12 pt at intended A4 size. Explain alternatives and the reasons for choices in your own words. The supplied evidence supports factual claims but does not supply the substantive analysis or personal reflection.

For the 4–5 minute video, prepare readable clips of the real async upload/result, caching headers and dashboard, followed by **actual** scaling once the blockers are resolved. Clearly label any incomplete feature. Do not substitute policy configuration or 30 successful jobs for task-count/scaling-activity evidence. Do not present historical local mocks as AWS results.

## Remaining actions in order

1. Resolve the existing Bedrock response-format failure with bounded safe diagnostics and regression tests; obtain one genuine successful generative Analyse result using an appropriate authorized fixture without disabling the catalogue shortcut.
2. Cloud planning is Future Work and excluded from this submission's deployed claims. Do not seek alternate infrastructure to bypass the historical CreateFunction deny.
3. After permitted deployment, verify the cloud Planner and candidate confirmation once with the existing route algorithms and budgets.
4. Obtain quota/capacity confirmation. Only after health, metrics, policy and failure/backlog gates pass, run the existing generator at max 30 jobs/concurrency 5. Capture task changes and activities; honestly report if it drains without scaling.
5. Complete cost sampling, Pricing Calculator totals and the public share link. Confirm shared/global/managed resource declaration and shared API purpose tag with the course.
6. Review the source snapshot/YAML, author the report and record/submit the video and Canvas/Gradescope deliverables. No submission has been uploaded by this agent.
