# Recognition-only submission evidence checklist

This is a factual checklist for the student's report and video. Recognition results are in [recognition-final-verification.md](recognition-final-verification.md); the completed 883-job automatic scaling experiment is in [a3-autoscaling-results.md](a3-autoscaling-results.md). Cloud tour planning is Future Work; local planning source remains included but is not a deployed feature.

## Required service categories and patterns

| Requirement/pattern | Actual implementation and code | Evidence / qualification |
| --- | --- | --- |
| Structured storage; externalized job state | DynamoDB job status/results, `server/cloud/job-repository.js` | Real result persistence and projected 30-job reads |
| Unstructured/object storage | Private image S3 bucket and public static frontend bucket; `server/cloud/uploads.js` | Real presigned PUT, bucket settings, cleanup; frontend public-read origin is an explicit exception |
| Edge caching / static content hosting | CloudFront + frontend S3 | F19 actual hits and Age; Jobs bypass CDN and use no-store |
| Asynchronous request/reply | `POST /a3/jobs`, token-protected polling, `server/cloud/jobs.js`, `mobile/src/recognitionJobs.ts` | F18 browser request/status sequence; upload body is separate from API request |
| Event-driven processing | S3 ObjectCreated notification to SQS | Bucket notification configuration and real job receipt; notification delivery is inferred from end-to-end receipt, not a captured message body |
| Queue-based load leveling | SQS buffer, serial worker `worker/worker.js` | F14 sustained experiment: peak 337 direct / 321 published visible messages, then drainage |
| Competing consumers / worker-pull load distribution | Multiple task replicas can pull the same SQS queue | Real three-worker distribution verified: 765 / 59 / 59 successful jobs; no ALB is claimed |
| Conditional/idempotent consumer and lease | DynamoDB conditional claim, attempts/lease owner, durable completion | Repository tests and all 30 batch jobs completed first attempt; do not claim exactly-once SQS delivery |
| Retry with dead-letter isolation | Existing 300-second visibility, bounded attempts and DLQ | Three historical DLQ messages preserved; old Analyse job terminal FAILED after five attempts |
| Stateless worker with horizontal autoscaling | Fargate task + backlog/running-task metric math | F13 active min1/max3 policy; **F15 and F16 PASS**, actual running count 1 ? 3 ? 2 ? 1 |
| Immutable deployment | ECR digest-pinned task revision, ECS rolling update | v5 digest matches running revision6; runtime settings preserved |
| Expiring data / garbage collection | Successful image deletion; S3 lifecycle and DynamoDB TTL | New real Analyse input absent after durable result; TTL expiration is asynchronous |
| Operational observability | Safe structured worker events and CloudWatch dashboard | F20 eight actual metric series and seven AWS-rendered images |

There are more than eight relevant implemented pattern candidates. A pattern list alone is not requirements analysis or justification: the student must explain trade-offs and alternatives using project-specific evidence. Non-Lambda compute/scaling is demonstrated on ECS by the bounded 883-job experiment, with successful automatic scale-out and scale-in.

## Evidence and deliverables

| Item | Status / action |
| --- | --- |
| F2 worker build/resource limits | PASS: `artifacts/bedrock-v5-deployment/build.log`, `worker-limits/summary.json`, container parser tests |
| F3–F8 storage, queue, vectors, Lambda/API | Current read-only inventory, tags, vector index/15 keys, bucket notifications/lifecycle and API routes in `verification/2026-10-31/recognition-final/`; older configuration evidence remains historical |
| F9–F10 image and worker health | PASS: v5 ECR receipt, revision6 receipt, `deployment-verified.json` |
| F11 asynchronous recognition | PASS: 30 successful records and real browser job |
| F12 Bedrock | PASS one case: `verification/2026-10-31/bedrock-v5-live/`; model completion, result hash comparison and S3 absence |
| F13 scaling configuration | PASS: min1/max3 verified; target3 and cooldowns30/120 preserved; numeric quota read denied, actual three-task execution succeeded |
| F14 backlog | PASS: sustained backlog captured in direct SQS readings and CloudWatch; see scaling-max-three/run-01 evidence |
| F15 scale-out | PASS: successful high-alarm action and actual RunningTaskCount 1 ? 3 |
| F16 drainage/scale-in | PASS: queue drained, successful low-alarm actions, actual RunningTaskCount 3 ? 2 ? 1 |
| F18 browser recognition | PASS core workflow; AI interpretation after candidate selection blocked by undeployed confirmation endpoint |
| F19 caching | PASS; real hit headers with timestamps, no manufactured miss |
| F20 monitoring | PASS configuration/data; dashboard unchanged; AWS-rendered graphs available |
| Infrastructure file | Root `submission-a3-infra.yml`, 32 entries; resource declaration, not a deployable CloudFormation template |
| Source submission | Root `app/`, approximately 9.8 MB plus generated submission README; exact file count and hashes in the final manifest/secret-pattern validation receipt |
| Resource tags | Dedicated A3 resources correct; shared API remains assessment2 and needs course interpretation; global CloudFront is not a Sydney regional resource |
| Calculator | Exact inputs and service estimates prepared; student must create public share link |
| Report | Student-authored PDF; official audit records maximum 30 pages excluding references/appendices; confirm current course requirements before upload |
| Video | Student records 4–5 minutes, showing real recognition, async status, caching, monitoring and timestamped real automatic scaling evidence; do not stage a manual DesiredCount change |
| Final submission | PENDING student review/upload to Gradescope and Canvas; no submission was sent by this agent |

## Source and configuration safety

`app/` retains existing planning algorithms, tests and local UI, while its submission README explicitly scopes cloud planning out. No Planning Lambda or planning API route was created. Root and mobile dependency lockfiles, worker Dockerfile, Python requirements, handlers, test scripts, shared catalogue/assets and deployment configuration examples are included. Build/install dependencies with Node22 and documented Docker commands; model weights download during image build. Environment files, node_modules, private credentials, local model caches and build outputs are excluded.

Review `docs/aws-deployment-readiness.md`, `docs/friday-deployment-checklist.md` and the current verified task metadata for environment configuration. Core worker values remain OpenCLIP ViT-B-32/laion2b_s34b_b79k, normalized 512D, `VECTOR_STORE=s3vectors`, version `openclip-v1`, threshold `0.80`, `OPENCLIP_THREADS=1`, `AI_PROVIDER=bedrock`, Gemma 3 12B IT, analysis budget125000ms; use IAM task roles rather than copied credentials. Jobs Lambda handler remains `server/cloud/handlers.jobsHandler` on Node22.

The local scanner checks excluded paths, access-key/private-key/presigned-signature patterns and source-manifest hashes. A zero-pattern result is a bounded automated check, not proof against every possible secret format. Do not add live read tokens, presigned URLs, AWS sessions or raw model/image content to the student report or video.
