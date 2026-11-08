# CAB432 A3 final verification follow-up

31 October 2026. Local changes only. No image push, deployment, IAM change, resource deletion or load-test execution was performed in this follow-up.

## Bedrock Analyse: fenced JSON reproduced and parser corrected locally

Historical worker evidence for job `19446b07-c342-4a75-82c7-f609db1e3b8f` shows five failed attempts with `BEDROCK_JSON` at `bedrock_analysis`. In `server/ai/bedrock.js`, `parseBedrockJSON` emits that code only when `JSON.parse` rejects the concatenated response text. The response has already passed the `end_turn`, assistant role, text-block and size checks.

At 15:55 Brisbane time, one real Converse call with the public Water Lilies image reproduced `BEDROCK_JSON`. Gemma returned a complete JSON object wrapped in a Markdown `json` fence. The original parser passed that wrapper directly to `JSON.parse`. The inner JSON was valid against the existing vision schema, with zero unexpected fields. This is a confirmed formatting defect reproduced against real Bedrock. The original private job response was not retained, so its precise bytes cannot be independently confirmed.

Authentication now succeeds using the refreshed local default profile, account `901444280953`, region `ap-southeast-2`. No failed Analyse job was resubmitted. The diagnostic called the existing vision implementation directly, so the catalogue shortcut could not substitute for inference.

| Actual diagnostic evidence | Value |
| --- | --- |
| Model / image | `google.gemma-3-12b-it` / `mobile/assets/water-lilies.jpg` |
| Model calls | Exactly 1 |
| Completion | `end_turn`, one text block, 434 characters |
| Markdown fence | Present; inner JSON and schema valid |
| Tokens | 686 input, 102 output, 788 total |
| Original parser | `BEDROCK_JSON` |
| Corrected parser | PASS on the sanitized captured response through the existing vision service, replayed locally |
| Truncation / unexpected fields | No evidence of truncation in this response; zero unexpected fields |

The direct probe took approximately 6.19 seconds including CLI processing. The CLI response did not expose an AWS request ID; none is invented. The preserved evidence deliberately records the pre-fix rejection. There was no second live inference and no post-deployment Analyse verification.

### Local changes

| File | Change |
| --- | --- |
| `server/ai/bedrock.js` | Strip a whole-response JSON/bare Markdown fence before parsing; retain completion, size, JSON and schema validation. Log bounded response shape on rejection and preserve safe SDK request metadata. Handle a null content block as `BEDROCK_RESPONSE`. No response text, prompts or images are logged. |
| `server/ai/diagnostics.js` | Identify the `bedrock_response` boundary as Bedrock `ParseResponse`. |
| `tests/aws-bedrock.test.js` | Replay the sanitized actual Gemma response through the vision service. Test bare/JSON/CRLF wrappers and split text blocks; reject prose, multiple objects/fences, truncation, unknown fields, unsupported languages and oversized responses. |
| `tests/fixtures/bedrock-gemma-vision-sanitized.json` | Actual response envelope and wrapper with descriptive strings redacted; provenance records model and capture time. |
| `tests/aws-diagnostics.test.js` | Verify safe request ID retention and that rejected content never appears in diagnostics. |
| `scripts/probe-bedrock-response.mjs` | Opt-in, single direct Converse invocation with the public Water Lilies fixture. Account guard, no automatic CLI retries, exclusive evidence guard, bounded shape evidence and schema-valid sanitized fixture capture. No queued job or catalogue shortcut. |
| `scripts/check-scaling-readiness.ps1` | Read-only authentication-gated scaling, queue, metric, quota and Lambda checks. |
| `scripts/estimate-scaling-test.mjs` | Retrieve public Sydney prices and calculate the bounded compute/address estimate. |
| `docs/aws-scaling-test-plan.md` | Prepared 30-job experiment, evidence criteria, readiness gates and limitations. |

The parser accepts only a whole-response wrapper, without searching prose for JSON or repairing incomplete objects. `max_tokens` still raises `BEDROCK_INCOMPLETE`, and invalid fields still raise `BEDROCK_SCHEMA`. No model, embedding dimensions, threshold, vector filters, similarity calculation, top-three behavior, route calculation, retry behavior or timeout settings were changed.

Executed once (do not repeat automatically):

```powershell
node scripts/probe-bedrock-response.mjs --execute
```

The existing token budget and schema were preserved. Review `verification/2026-10-31/bedrock-followup/direct-probe.json` for the actual AWS result and `tests/fixtures/bedrock-gemma-vision-sanitized.json` for its sanitized regression structure. A public fixture cannot prove the precise contents of the historical private response.

**Worker deployment needed:** yes, a new Linux/x86 image and later task revision are required to activate the parser fix and diagnostics. Neither was built, pushed or deployed in this follow-up. Existing v3 remains unchanged. The earlier Lambda ZIP/source snapshot does not include these new local edits; rebuild artifacts only when preparing an authorized deployment.

## Planning endpoint feasibility

`server/cloud/handlers.js` exports `jobsHandler` for POST `/a3/jobs` and GET `/a3/jobs/{jobId}` with stage-aware HTTP API v2 routing, origin checks and job read-token validation. It does not dispatch planning requests. `server/cloud/planning.js` exports the separate `planningHandler`, which supports POST `/api/ai/routes/visit`, `/plan`, `/chat`, `/api/ai/artworks/confirm`, GET `/api/ai/planning/status` and preflight. It reuses the existing AI and route services, returning buffered NDJSON for a visit. Merely packaging both files does not expose the second handler.

The previous `CreateFunction` attempt for `a3-n12281212-unframe-planning` was denied by an **explicit identity-policy deny**, `arn:aws:iam::901444280953:policy/Do-Not-Delete-LT1-DenyPolicy-4`. The exact error is preserved in `verification/2026-10-31/aws-final/planning-create.txt`. No further creation attempt or alternate identity/name workaround was made.

Preferred deployment path: ask the course administrator to authorize/provision the prepared separate Planning Lambda and its HTTP API integration. It needs the existing intended role to allow `bedrock:InvokeModel` for the configured model, logging permissions, API Gateway invocation permission and approved route integration. No IAM policy has been changed here.

Conditional reuse option: an administrator-approved combined dispatcher could host the exact planning routes on the existing Jobs Lambda while delegating Jobs requests unchanged. This is technically possible, **not presently implemented or permission-confirmed**. It must not be used to evade the explicit creation restriction. Fresh configuration confirms Node.js 22, `server/cloud/handlers.jobsHandler`, only 3 seconds timeout and 128 MiB memory. Planning has a 25-second application deadline and a proposed 24-second Bedrock deadline, requiring an approved Lambda timeout change (30 seconds proposed). Memory/concurrency and resource contention would need evaluation. Separate origin configuration, lazy service initialization, error isolation, job-token enforcement, upload behavior and v2 stage handling require regression coverage before replacing the current handler. Existing Jobs environment variables must be retained.

Any reuse requires confirmation that `UpdateFunctionCode`, `UpdateFunctionConfiguration`, required API route/integration updates and invocation permission changes are permitted, plus confirmation that `CAB432-Lambda-Role` already has the necessary Bedrock permission. The refreshed `iam:ListAttachedRolePolicies` read remains denied because no identity-based policy allows it; no permission is assumed. Fresh API route inspection confirms the four Jobs method/preflight routes on integration `fffmtna` and no `/api/ai/*` routes. The successful diagnostic uses the local caller, not the Lambda execution role, so it does not establish Lambda model permissions. Unrelated Strobe functions are not candidates for repurposing.

## Scaling readiness

Fresh read-only checks around 15:56 Brisbane time confirm:

| Check | Actual result |
| --- | --- |
| Worker | Revision 4, desired 1/running 1/pending 0, healthy, rollout completed, 512 CPU / 2048 MiB |
| Image digest | `sha256:ba7c946125932a59495a56c37ea299911a345514c0775ff9e4a4d1f7798cdada`, unchanged v3 |
| Target | Min 1/max 4; scaling not suspended |
| Policy | `unframe-sqs-backlog`, target 3, SQS visible `Sum` / running tasks `Average`, 30s out / 120s in cooldown |
| Alarms | High OK: >3 for 3 x 60s; low ALARM: <2.7 for 15 x 60s; actions enabled |
| Activities | Only `AlreadyAtMinCapacity`; no actual scale-out/scale-in demonstration |
| Recognition queue | Visible 0, in-flight 0, delayed 0 |
| DLQ | Visible 2, in-flight 0, delayed 0; preserved unchanged |
| Last 30 minutes | 30 SQS depth/age and running-task datapoints; depth/age 0, running tasks 1; Container Insights enabled |
| Worker utilisation | Latest CPU approximately 1.40%, memory 40.67%; idle-window observations, not load measurements |
| Lambda metrics | No invocation/error datapoints in this window; absence is not a measured zero error rate |
| Shared cluster | Four running tasks across four services, including this worker |
| Quota | `servicequotas:GetServiceQuota` denied on `fargate/L-3032A538`; regional capacity headroom remains unknown |

The current queue is idle, but quota headroom must be confirmed before claiming scale-out readiness. Four worker tasks require 2 vCPU in addition to other workloads. A low alarm with `AlreadyAtMinCapacity` is consistent with the idle one-task baseline; it does not prove a provisioning failure or successful scaling.

The [prepared controlled plan](aws-scaling-test-plan.md) caps submissions at 30 and concurrency at 5. Fast reference recognition may drain the batch before the three-minute high-alarm window, so the experiment may not demonstrate actual scale-out or subsequent scale-in. Do not mark F15/F16 passed merely because all jobs finish. The illustrative four-task, 30-minute compute plus public-address cost is approximately USD 0.08, excluding other service charges and any additional duration; see the plan and price evidence for assumptions.

## Local validation

| Command/check | Result |
| --- | --- |
| `node --test tests/*.test.js` | 164 passed, 0 failed after the parser fix; includes AWS, Jobs, SQS, recognition and planning tests. |
| `npm.cmd run mobile:test` | 40 passed, 0 failed. |
| `npm.cmd run mobile:check` | TypeScript check passed. |
| `node --test tests/aws-bedrock.test.js tests/aws-diagnostics.test.js` | 11 passed after the parser fix. |
| Node syntax checks for changed JS/helper modules | Passed. |
| PowerShell AST parse of `scripts/check-scaling-readiness.ps1` | Passed. |
| Probe without `--execute` | Opt-in guard passed; no model call. |
| Real Bedrock probe | One call reproduced fenced-JSON rejection; corrected implementation passed local captured-response replay. |
| Fresh AWS reads | Passed except explicit quota and IAM inspection permission blockers above. |
| Load test | Deliberately not executed. |

Test evidence is in `verification/2026-10-31/bedrock-followup/`, including `root-tests-after-fix.txt`, `mobile-tests-after-fix.txt` and `mobile-check-after-fix.txt`. These are local tests on the host Node runtime, not a new container or deployed-Lambda verification. Source hash comparison confirms routes, recognition, vector adapter and AI configuration are unchanged from this follow-up's initial snapshot.

Next actions: obtain authorization for a corrected Worker image deployment and one controlled post-deployment Analyse check; seek administrator resolution of Planning permissions; confirm scaling capacity headroom; obtain separate instruction before executing the prepared load test. The local Bedrock defect is fixed and regression-tested, but deployed Analyse verification, Planning deployment and real F15/F16 scaling evidence remain incomplete.
