# CAB432 A3 recognition-only final verification

Verified 31 October 2026, profile `default`, account `901444280953`, region `ap-southeast-2`. This is technical evidence for the student's own report and 4–5-minute video. Cloud AI Tour Planning is **Future Work**, not part of the deployed A3 scope. Existing local planning code, routes, graph and Dijkstra were preserved.

Evidence root **R** below is `verification/2026-10-31/recognition-final/`; **B** is `verification/2026-10-31/bedrock-v5-live/`; **D** is `artifacts/bedrock-v5-deployment/`. These results supersede earlier deployment/readiness reports.

| Area | Status | Resources and tests | Actual result | Evidence | Remaining work |
| --- | --- | --- | --- | --- | --- |
| Recognition | **PASS** | Jobs HTTP API, Jobs Lambda, private S3 images, SQS, Fargate, S3 Vectors, DynamoDB | 30/30 load jobs succeeded with correct Water Lilies result >=0.80; real browser recognition also succeeded | R `F14-load-results.json`, `F14-worker-events.json`, `F18-browser.json` | Broader photographic accuracy and 50-user performance remain untested |
| Bedrock Analyse | **PASS for one controlled case** | Gemma `google.gemma-3-12b-it`, worker revision 6, DynamoDB and S3 | One new MET exterior job succeeded first attempt, real Bedrock completion, persisted result and automatic cleanup; no schema failure | B `F12-summary.json`, `F12-worker-events.json`, `F12-dynamodb.json` | Original historical invalid field remains unrecoverable; preserve strict diagnostics for future failures |
| ECS Auto Scaling configuration | **PASS configuration** | Existing min-1/max-4 target and `unframe-sqs-backlog` policy | Enabled, target 3, cooldowns 30/120 seconds; queue and RunningTaskCount metrics available | R `before-F13-target.json`, `before-F13-policy.json`, `F13-alarms-before.json` | Account-wide quota is unknown because GetServiceQuota is denied |
| Real 30-job scaling demonstration | **FAIL scale-out criterion** | Existing `load:jobs`, count 30/concurrency 5; no manual DesiredCount changes | 30/30 succeeded, observed backlog 13 visible +1 in flight; drained on one task; no scale-out or subsequent scale-in | R `load-submissions.txt`, `F14-F16-observations.json`, `F14-load-results.json`, `after-scaling-activities.json` | A separately approved experiment that sustains observable backlog is needed; do not claim F15 or scale-in F16 |
| CloudFront Web Recognition | **PASS recognition; optional confirmation blocked** | `E2CK5412ICFTJX`, Jobs API and presigned S3 PUT | One real job, CORS/polling succeeded, Water Lilies similarity 0.9999953508377075, no duplicates; candidate/details controls visible | R `F18-browser.json`, `F18-candidate.png`, `F18-confirmation.png` | AI interpretation confirmation endpoint remains undeployed; core recognition result is valid |
| CloudFront Caching | **PASS** | Real static JavaScript requests; real Jobs responses | HTTP 200; RefreshHit then Hit/Hit, Age 1 on hits; static Cache-Control absent; dynamic API `no-store` | R `F19-cache.json`, `F18-browser.json` | No invalidation performed; measured hits are not a monthly hit ratio |
| CloudWatch Dashboard | **PASS** | Existing `a3-n12281212-unframe` dashboard | Seven widgets/eight series already correct; unchanged; workload metrics and AWS-rendered graphs collected | R `before-dashboard.json`, `after-dashboard.json`, `after-F20-metrics.json`, `F20-widget-*.png` | Capture the console/dashboard in the student's video if required |
| Cost and Sustainability | **PASS worksheet; share link pending** | Public Sydney AWS price lists and measured worker/job data | Recognition scenario subtotal $84.89/month; higher-frequency sensitivity $168.29; explicit assumptions and exclusions | R `cost-model.json`, `pricing/`; `docs/a3-cost-and-sustainability.md` | Student must create calculator share link and explain assumptions/trade-offs |
| Gradescope readiness | **PENDING** | Root `submission-a3-infra.yml` and `app/` | Current source snapshot and inventory prepared; local validation receipt records integrity/secret-pattern checks | R `source-manifest.json`, `submission-validation.json`, `resource-inventory.json` | Shared API tag review, missing scaling proof, calculator link, student-authored report/video and final upload |

## Worker deployment and local regressions

- ECR: `901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v5`.
- Verified digest: `sha256:a0e14f0a51d37614f8ca567abdeb19f0f9edb1d0837413c85f1ead7ba9ceb258`.
- Task definition: `a3-n12281212-unframe-worker:6`; cluster `n12281212-strobe-a2`; service `a3-n12281212-unframe-worker`.
- Verified running task: `14d226de342f4ebb95672558bd499a7b`; desired/running/pending **1/1/0**, HEALTHY, rollout COMPLETED, image digest matches exactly.
- CPU **512**, memory **2048 MiB**, Linux/x86_64. Only image URI changed. In-memory comparisons verified identical task settings apart from image/registration metadata, and identical service network/deployment settings. Roles, environment, logging and health checks were preserved. Raw configuration was not saved; D `image-only-review.json` stores safe metadata/hashes.
- Temporary ECR authentication used Docker Desktop Linux Engine, without credential helpers; its current-user-only temporary directory was removed after push. Existing Docker config was not modified.
- Root **171/171**, mobile unit **40/40**, TypeScript passed. New-image Linux Node 22 Bedrock/schema/diagnostic tests **18/18** passed.
- Resource test: production entrypoint, real OpenCLIP, AWS mocked and network disabled, **0.5 vCPU/2 GiB/no swap**. Twelve recognition jobs and 15 health checks passed; zero OOM events, exit 0, peak cgroup **1.4315 GiB**, startup **53.987 s**, mean job **0.786 s**. D `worker-limits/summary.json` distinguishes these local measurements from AWS results.

The four browser failures were test defects: three camera tests lacked fake-device/permission flags; one global `Claude Monet` locator matched both the home screen and result panel. Only the test files changed. The affected suites now pass **9 tests**, with one opt-in live test skipped. Camera capture logic and Scan UI were not changed. Earlier unrelated browser runs and their failures are historical, not a claim of a new full-suite pass.

## One real Bedrock case

Job **`48eb6b33-57e8-4d22-92bd-67690289915c`**, `operation=analyse`, `museumId=met`, public repository image `mobile/assets/met-exterior.jpg`. A previous real-index preflight for this asset found maximum similarity 0.2678631544113159, below the unchanged 0.80 threshold. This run returned `method=vision` and a correlated `bedrock_complete` event, not catalogue fallback.

CloudWatch on the verified v5 task records Gemma completion in **2,785 ms**, then `job_result_saved` and `job_completed`. The API reached SUCCEEDED; consistent DynamoDB read contained the result, whose canonical hash equals the API result; S3 HeadObject returned 404 after cleanup. End-to-end helper time was **9.268 s**. Exactly one Analyse job was created. No raw response text, read token, presigned URL or private image was retained in evidence; only result shape/hash and bounded events were stored.

No sanitized schema issues were emitted in this successful case. The previous job **`e606a64c-20fe-4b50-b781-a6f1ee78b63d`** is now **FAILED, attempts 5**. It was read only, never resubmitted or altered. Its precise invalid field is still unknown because the historical response/validation errors were not retained. One successful new case does not prove all future model responses satisfy the schema.

## Scaling evidence and limitation

The load command was executed once:

```powershell
npm.cmd run load:jobs -- --execute --url https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5
```

All 30 unique submissions uploaded successfully. All 30 persisted jobs succeeded with the correct artwork. Worker processing durations from real CloudWatch event timestamps were **473–724 ms**, mean **539.47 ms**, p95 **709 ms**. There were zero Bedrock completion events for the batch. No extra batches were run.

The SQS API observer saw **13 visible +1 in flight at 07:04:39 UTC**, then zero at **07:04:54 UTC**. It continued through **07:09:42 UTC**; desired/running stayed **1/1**, DLQ stayed **3**. The one-minute CloudWatch queue/age samples were zero: the brief backlog was missed by the published metric interval. RunningTaskCount samples were one. Consequently the three-period high alarm did not receive sustained above-target data. The only returned scaling activity was historical `AlreadyAtMinCapacity`; it is neither a successful scale-out nor an IAM-denied scale-out.

Measured CloudWatch one-minute ECS averages during the selected window: CPU **1.86–12.39%**, memory **40.68–41.06%**. Lambda recorded **30 invocations, zero errors**. These are minute-level samples, not instantaneous inference peaks. SQS API observations prove backlog/drainage even though the CloudWatch backlog graph is zero. F13 configuration and F14 backlog are supported; F15 is missing, and F16 supports drainage but not a scale-in demonstration.

Quota inspection returned `AccessDeniedException` for `servicequotas:GetServiceQuota`. This prevents knowing account-wide quota headroom; it is not an explicit scaling prohibition. The bounded authorized test used the existing policy/max-four ceiling and permitted per-task resources. No capacity, alarm, policy, role or quota was changed. Three historical DLQ messages were left untouched; message identities were not inspected by receiving messages.

## Browser, monitoring and submission limits

Real browser job **`993cca74-1545-4786-8f63-427ae7984723`** used `https://d3x3iexpafsgf.cloudfront.net` and API base `https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`. POST returned 201, raw-image PUT 200, and polling GETs 200 with correct CORS. Exactly one job was created and zero duplicate requests suppressed. Selection retains the confirmation/details UI, but no `/api/ai/artworks/confirm` route exists on the A3 API. Do not demonstrate a successful AI interpretation after clicking the candidate; it remains an explicit limitation. No frontend or local planning behavior was altered.

Dedicated A3 resource tags have `purpose=assessment 3` and the student username. The shared API retains `purpose=assessment 2`; ask the teaching team how to declare/tag this shared dependency. An extra whitespace-prefixed purpose tag exists on worker logs, alongside the correct key; no tags were changed. CloudFront is global; other deployment resources are in Sydney. The frontend bucket's previously authorized public-read origin workaround remains in place; image uploads remain private. Do not claim every bucket is private or an OAC-only frontend.

The existing dashboard already had the correct CPU/memory percentages, so it was not updated. AWS rendered seven evidence graphs containing the eight requested metrics. No screenshots or data were fabricated. Cost inputs and sustainability trade-offs are in `a3-cost-and-sustainability.md`; the model is a subtotal with explicitly excluded charges, not a bill or measured 50-user SLA.

## Commands and next actions

Build: `docker --host npipe:////./pipe/dockerDesktopLinuxEngine build --platform linux/amd64 -f worker/Dockerfile -t 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v5 .`.

Deployment used `node scripts/deploy-worker-image.mjs --execute`, followed by `node scripts/verify-worker-rollout.mjs`. These are run receipts, **not instructions to rerun**. The one-job Analyse helper used `UNFRAME_ANALYSE_EVIDENCE_DIR=verification/2026-10-31/bedrock-v5-live` and `UNFRAME_ANALYSE_IMAGE=mobile/assets/met-exterior.jpg`; its exclusive evidence-file guard prevents accidental resubmission. `collect-analyse-evidence.mjs`, `collect-recognition-load.mjs`, `final-recognition-readiness.mjs` and `render-final-metrics.mjs` are read-only collectors.

Next: retain the successful recognition/Analyse evidence; explicitly disclose absent horizontal-scaling proof; obtain separate approval/course guidance for a suitable scaling experiment rather than exceeding 30 jobs; review the optional confirmation limitation and shared API tag; create the calculator share link; write the report and record the video. Do not deploy Planning Lambda or planning routes. The prepared `app/` source preserves local planning for future use, without representing it as a completed cloud feature.
