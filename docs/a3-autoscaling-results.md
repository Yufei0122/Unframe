# CAB432 A3: real ECS automatic scaling evidence

Generated 2026-10-31T08:35:26.979Z. F14 **PASS**, F15 **PASS**, F16 **PASS**. Verdicts require actual CloudWatch data and successful policy activities, not just configured alarms or desired-count changes.

## Configuration and authorization

- Account 901444280953, profile default, Sydney ap-southeast-2.
- Actual cluster: n12281212-strobe-a2; existing service: a3-n12281212-unframe-worker.
- Scalable target now min **1**, max **3**. Maximum was explicitly changed from 4 to 3 at 07:58:31 UTC; the saved deployment template was updated to match.
- Policy unframe-sqs-backlog remains target **3**, scale-out/in cooldowns **30/120 seconds**. Exact before/after policy equality: **true**. Suspension flags remain false.
- Task definition revision 6 and v5 image retained; each worker remains Linux/x86_64, **512 CPU / 2048 MiB**. No worker deployment or IAM changes.
- The user explicitly authorized one run capped at 900 jobs or five minutes, three starts/second, five concurrent submissions, max three workers, and up to forty minutes of observation. This included proceeding despite denied quota reads while monitoring actual capacity errors.
- The supplied university tutorial defines min/max guardrails, not account quota availability. Its example CPU policy was not substituted for this project's existing SQS backlog policy. No assessed resources were cleaned up.

## Workload and results

The previous thirty-job test drained in about eighteen seconds and its one-minute backlog series stayed zero; it could not satisfy the three-period high alarm. Target 3 corresponds to about 1.62 seconds of queued processing at the prior 539-ms mean, but publication, evaluation and startup delays prevent it from guaranteeing that latency during a burst.

This run used the existing load generator's real API-create and raw S3 PUT workflow with bounded pacing, public reference mobile/assets/water-lilies.jpg, museum met and operation recognise. All creates used the existing /a3/jobs endpoint. No artificial records or direct queue injections were made.

| Measurement | Actual result |
| --- | --- |
| Created / uploaded | 883 / 883 |
| Submission failures | 0 |
| Submission elapsed | 300.115 seconds, including completion of accepted uploads |
| First / last job created | 2026-10-31T08:06:03.779Z / 2026-10-31T08:11:01.327Z |
| Stop condition | Five-minute creation deadline; no further submissions during recovery |
| Correct successful jobs | 883/883 |
| Failed jobs / jobs retried | 0 / 0 |
| Recognition checks | water-lilies; similarity >=0.80; at most three descending candidates; museum met; all recorded attempts checked |
| Mean / p95 processing interval | 548.5 / 663 ms (883 log-correlated samples) |
| Peak direct SQS visible reading | 337 |
| Peak published CloudWatch visible reading | 321 |
| Maximum actual running workers | 3 |
| Final desired / running / pending | 1 / 1 / 0 |
| Final queue visible / in-flight | 0 / 0 |
| Final DLQ visible | 3; baseline 3, no messages deleted or redriven |
| Unexpected stopped tasks | 0 |

SQS counts are approximate. Transient non-zero readings continued briefly after durable completion; the sustained-zero observation is used below. CloudWatch sampling and direct readings have different timing, so their peaks need not match. All three workers processed real jobs: 14d226de342f4ebb95672558bd499a7b: 765; 619534e3312c409b908b3ee8a1058d3a: 59; 9e358b2881884eb1bb39f74dd293307e: 59.

## Actual automatic actions and timestamps

| Event | UTC | Brisbane (AEST) |
| --- | --- | --- |
| Successful high-alarm scale-out action | 2026-10-31T08:11:06.016Z | 2026-10-31T18:11:06.016 AEST |
| First observed RunningTaskCount >1 | 2026-10-31T08:12:15.317Z | 2026-10-31T18:12:15.317 AEST |
| Sustained empty queue after all successes | 2026-10-31T08:14:15.806Z | 2026-10-31T18:14:15.806 AEST |
| Successful low-alarm scale-in action | 2026-10-31T08:32:35.511Z | 2026-10-31T18:32:35.511 AEST |
| First observed desired/running back at 1 | 2026-10-31T08:32:56.047Z | 2026-10-31T18:32:56.047 AEST |

Successful low-alarm steps: Setting desired count to 2. 2026-10-31T08:29:35.529Z (activity 6bbb5138-26c3-4572-94d4-25bcdace075c); Setting desired count to 1. 2026-10-31T08:32:35.511Z (activity 8978998f-05aa-45d6-aa7b-eedbd240453b).

Scale-out activity ID: 5a0295b6-b643-4649-8589-8a1b8d0271b4. Final scale-in activity ID: 8978998f-05aa-45d6-aa7b-eedbd240453b. Both must show Successful for their corresponding evidence to pass. The observed running-count sequence is **1 → 3 → 2 → 1**. All intermediate successful actions are retained in the activity evidence. DesiredCount was never manually set. An AlreadyAtMaxCapacity activity is an expected guardrail, not a task-launch failure.

The managed high alarm requires three 60-second periods above 3; the low alarm requires fifteen periods below 2.7. Scale-in therefore takes longer than the 120-second cooldown alone. This run preserved both managed alarms and the policy. Maximum 3 is the requested new baseline, so it was not restored to 4.

## Costs and limitations

Pre-run conservative scenario: approximately **US$0.116** including three workers for forty minutes and assumed requests/monitoring; US$0.50 was a planning allowance, not an enforced billing cap. Sampled running-task time gives approximately **US$0.0434** for compute/public IPv4, including **US$0.0255** above one-worker baseline. Provisioning, image pulls and stopping can add task billing time; request/monitoring charges and tax are additional to the sampled compute figure. These are estimates, not an AWS bill.

Numeric Fargate quota remains unreadable (servicequotas:GetServiceQuota denied). Actual successful operation of three workers proves capacity was available for this run, not future regional headroom. Active-work scale-in protection remains disabled; this experiment drained before scale-in, and every job's attempt count was checked. Repeated reference-image traffic is a scaling demonstration, not a representative diverse-visitor capacity benchmark or a latency guarantee.

## Evidence and local validation

All evidence is in [the run directory](../verification/2026-10-31/scaling-max-three/run-01/):

- [CloudWatch metric CSV](../verification/2026-10-31/scaling-max-three/run-01/F14-F16-metrics.csv) and [raw metric data](../verification/2026-10-31/scaling-max-three/run-01/F14-F16-cloudwatch-metrics.json).
- [Scaling activities](../verification/2026-10-31/scaling-max-three/run-01/F15-F16-scaling-activities.json), alarm history files, observations.json, stopped-tasks.json, final-target.json and final-policy.json.
- [Projected job results](../verification/2026-10-31/scaling-max-three/run-01/jobs.json), sanitized F14-F16-worker-events.json, submissions.jsonl and [derived verdict](../verification/2026-10-31/scaling-max-three/run-01/F14-F16-verdict.json).
- [F14 queue graph](../verification/2026-10-31/scaling-max-three/run-01/F14-queue.png), [F15/F16 running-task graph](../verification/2026-10-31/scaling-max-three/run-01/F15-F16-running.png) and [CPU/memory graph](../verification/2026-10-31/scaling-max-three/run-01/worker-utilization.png). These are AWS-rendered charts of actual metrics, not fabricated console screenshots.

The first preflight stopped before any jobs because the Node SDK could not resolve the CLI login profile. The harness was changed to reuse the CLI session in process memory; no credentials were written or printed. Its zero-job failure is preserved in preflight-failure.json. Resuming that preflight did not create a second workload.

Local changes are confined to test/evidence tooling and the scaling-target template: load-recognition-jobs.mjs pacing/stop controls; set-scaling-max-three.mjs; run-scaling-experiment.mjs; collect-scaling-evidence.mjs; summarize-scaling-experiment.mjs; scaling-load.test.js; deployment/ecs/scalable-target.json. Recognition, embeddings, Bedrock, routes and CloudFront were unchanged.

Tests: **23 passed / 0 failed** (six pacing/safety tests plus seventeen existing AWS Jobs regression tests). Syntax checks passed. Commands used:

```powershell
node scripts/audit-scaling-behaviour.mjs verification/2026-10-31/scaling-max-three/before
node scripts/set-scaling-max-three.mjs --apply
node --test tests/scaling-load.test.js tests/aws-jobs.test.js
node scripts/run-scaling-experiment.mjs --execute
node scripts/run-scaling-experiment.mjs --execute --resume-preflight
node scripts/collect-scaling-evidence.mjs
node scripts/summarize-scaling-experiment.mjs
```
