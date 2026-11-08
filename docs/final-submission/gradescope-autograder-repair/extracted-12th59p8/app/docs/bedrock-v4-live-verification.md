# Worker v4 deployment and F12 verification — 31 October 2026

**Deployment PASS. Real Analyse verification FAIL: `BEDROCK_SCHEMA`. Overall FAIL.**

The tested image was reused without rebuilding. After one live Analyse job failed, no additional jobs, direct Bedrock calls or deployment changes were initiated. Existing automatic retry behavior remains enabled and was not modified.

## Deployment identity

| Item | Verified result |
| --- | --- |
| AWS | Default profile, account `901444280953`, region `ap-southeast-2` |
| ECR repository/tag | `a3-n12281212-unframe-worker:v4` |
| ECR digest | `sha256:3899104485df64461bbba840c7639a51de541a20b88a8c578dbd5be9ccfed152` |
| Push time | 16:13:08 Brisbane time |
| ECS cluster/service | `n12281212-strobe-a2` / `a3-n12281212-unframe-worker` |
| New task definition | `arn:aws:ecs:ap-southeast-2:901444280953:task-definition/a3-n12281212-unframe-worker:5` |
| Running task | `47f6e647e2d34ee0b54e027ff906ce82` |
| Rollout | COMPLETED, zero failed tasks |
| Steady state | Desired 1, Running 1, Pending 0, HEALTHY |
| Resources | CPU 512, memory 2048 MiB, Linux/x86_64 |
| Running image | Pinned to the ECR digest above; exact match verified |

The existing Docker configuration was inspected without reading authentication values into output. The temporary configuration contained only the new ECR `auths` entry, with no `credsStore`, `credHelpers` or `currentContext`. It was created outside the repository in a current-user-restricted temporary directory. Docker explicitly used `npipe:////./pipe/dockerDesktopLinuxEngine`. The ECR token was obtained through AWS CLI and never printed. The temporary configuration and directory were deleted in `finally` after the push; removal was confirmed. The normal Docker configuration was not changed.

Revision 5 was prepared from revision 4. Deep comparison verified that only the worker image URI changed; CPU, memory, task/execution roles, all environment variables, runtime, health checks, logging and tags were preserved. Service comparison verified unchanged networking, deployment settings, desired count, launch type/platform, scheduling, capacity-provider configuration, load balancers, service registries and execute-command setting. No IAM/SCP policy was modified, no ECS service was recreated, and no DLQ messages were received, cleared or altered.

The existing image's earlier verification remains applicable: 164 root tests, 40 mobile tests, TypeScript, 11 image-local parser/diagnostic tests and the 0.5-vCPU/2-GiB real-OpenCLIP resource test passed. Peak memory was approximately 1.67 GiB with zero OOM events. No production source changed between that image test and this push.

## Single real Analyse job

Input: `mobile/assets/met-exterior.jpg`, a public repository asset credited in `mobile/assets/SOURCES.md`; `operation=analyse`, `museumId=met`.

A read-only preflight used the existing OpenCLIP implementation and the real S3 Vectors adapter. It generated a normalized 512D embedding and queried the actual configured index using the analysis path's model, pretrained, version and catalogue filters. Maximum similarity was `0.2678631544113159`, below the unchanged 0.80 threshold. Therefore the catalogue shortcut could not supply this result. No Bedrock call or job was made during preflight.

| Job evidence | Actual result |
| --- | --- |
| Job ID | `e606a64c-20fe-4b50-b781-a6f1ee78b63d` |
| Submission | Exactly one POST, HTTP 201 |
| Raw image upload | HTTP 200 |
| Observed status sequence | WAITING_UPLOAD → PROCESSING → RETRYING |
| Last observed persisted status | RETRYING, attempt 1, at 16:19:56 Brisbane time |
| Bedrock model | `google.gemma-3-12b-it` |
| Invocation evidence | HTTP 200, `end_turn`, AWS request ID `74412dfa-77b6-4444-92b9-63990709f319` |
| Response shape | One text block, 486 characters, Markdown fence present, no non-text blocks |
| Failure | `BEDROCK_SCHEMA`, stage `bedrock_response`, operation `ParseResponse`, exception `AIError` |
| Worker failure wrapper | `PROCESSING_FAILED`, attempt 1, approximately 3,886 ms |
| DynamoDB | Job failure/retry state persisted; no completed analysis result |
| S3 cleanup | Input object still exists; successful-job cleanup was not reached |

CloudWatch events came from `ecs/unframe-worker/47f6e647e2d34ee0b54e027ff906ce82`, matching the verified v4 task. Bedrock was actually invoked; this is not a catalogue-note fallback. However, the generated JSON failed the existing response schema, so there is no `bedrock_complete` or `job_result_saved` event for the captured attempt.

The parser proceeds through `JSON.parse` before emitting `BEDROCK_SCHEMA`. Thus the fenced-JSON parsing fix worked for this response, but the parsed value did not satisfy the required schema. The exact invalid field/value is not retained in the safe logs. It would be inaccurate to claim a specific field defect, truncation or successful analysis. The HTTP 200 and `end_turn` also distinguish this failure from an AWS authentication/model-access error or a reported token-limit stop.

The job is **not claimed to be terminal FAILED**: RETRYING is the last observed status. Its existing SQS visibility/retry policy can trigger further automatic attempts. No new attempt was initiated by the verification tools and no retry/queue policy was changed. The retained S3 image is consistent with the existing failure/retry design; automatic deletion is performed after a successful durable result.

## Commands and evidence

The existing image was pushed with an ephemeral configuration, using this command shape (the temporary path and token are not retained):

```powershell
docker --config $authDir --host npipe:////./pipe/dockerDesktopLinuxEngine push 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v4
aws ecr describe-images --repository-name a3-n12281212-unframe-worker --image-ids imageTag=v4 --profile default --region ap-southeast-2
aws ecs register-task-definition --cli-input-json file://artifacts/bedrock-v4-deployment/task-v4.review.json --profile default --region ap-southeast-2
aws ecs update-service --cluster n12281212-strobe-a2 --service a3-n12281212-unframe-worker --task-definition a3-n12281212-unframe-worker:5 --profile default --region ap-southeast-2
```

The following verification commands were executed; **do not repeat the job submission**:

```powershell
node scripts/preflight-analyse-input.mjs
$env:UNFRAME_ANALYSE_EVIDENCE_DIR='verification/2026-10-31/bedrock-v4-live'
$env:UNFRAME_ANALYSE_IMAGE='mobile/assets/met-exterior.jpg'
& mobile/node_modules/.bin/tsx.cmd scripts/verify-one-cloud-analyse.ts --execute
node scripts/collect-analyse-evidence.mjs
```

Sanitized evidence in `verification/2026-10-31/bedrock-v4-live/`:

- `deployment-and-F12-summary.json`: combined deployment PASS / Analyse FAIL result.
- `task-preservation.json` and `service-preservation.json`: unchanged configuration checks.
- `input-preflight.json`: normalized embedding identity and real-index similarity results.
- `F12-analyse.json`: one-job HTTP/status history, without presigned URLs or read tokens.
- `F12-worker-events.json`: allowlisted CloudWatch diagnostics with the Bedrock request ID.
- `F12-dynamodb.json`: consistently read projected job record, excluding token fields.
- `F12-summary.json`: persisted status, response rejection and input-object presence.

ECR, registration, service, running-task and push receipts are in `artifacts/bedrock-v4-deployment/`.

Only local verification helpers changed during this resumed run: the one-job helper accepts a selected public image path; a preflight helper checks for catalogue matches; the evidence collector uses aliases for DynamoDB projected attributes and records schema-rejection evidence. The initial collector projection returned a `ValidationException`; correcting its read-only projection allowed the job state to be verified. That was a local evidence-query defect, separate from the confirmed Worker `BEDROCK_SCHEMA` failure.

## Next action

Keep this deployment evidence and investigate the schema mismatch before another controlled Analyse test. Safe follow-up diagnostics should identify schema validation keywords/paths without exposing response content; the schema should not be relaxed speculatively. No further fix or deployment was attempted after the failed job. The 30-job scaling test was not run.
