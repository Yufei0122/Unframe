# CAB432 A3 controlled scaling evidence plan

> Historical 30-job plan: the run has now completed (30/30 successful, no scale-out). See [31 October scaling investigation](a3-scaling-investigation.md) for the verified cause, current baseline and proposed sustained experiment. The older revision/DLQ baseline below is historical.

Prepared 31 October 2026. **NOT EXECUTED.** Maximum 30 recognition jobs; concurrency 5. No Analyse requests, policy changes, queue receives/deletes, redrives, or deployments are part of this plan.

## Preconditions

Refresh the default AWS profile locally, then run the read-only check from the repository root:

```powershell
powershell -NoProfile -File scripts/check-scaling-readiness.ps1
```

Review every result in `verification/2026-10-31/bedrock-followup/`. Authentication must resolve account `901444280953` in `ap-southeast-2`. Do not interpret a failed command or an empty output file as verification. The refreshed default profile authenticated successfully on 31 October at approximately 15:55 Brisbane time.

Fresh checks around 15:56 confirm cluster `n12281212-strobe-a2`, service `a3-n12281212-unframe-worker`, revision 4, 512 CPU units / 2048 MiB, one healthy task. Min/max are 1/4 and policy `unframe-sqs-backlog` is target 3, visible SQS backlog / running task count, with 30-second scale-out and 120-second scale-in cooldowns. Alarm reads confirm three 60-second high periods (>3) and fifteen 60-second low periods (<2.7). Confirm these again immediately before execution.

The refreshed 30-minute window contains 30 SQS depth/age and `ECS/ContainerInsights` `RunningTaskCount` datapoints: depth/age 0 and running count 1. Scaling is unsuspended and the rollout completed. Queue visible/in-flight/delayed counts are 0/0/0; the DLQ baseline is 2/0/0. The low alarm is active but the only scaling activity is `AlreadyAtMinCapacity`, not an actual task-count change. Recheck immediately before submission and preserve the two existing DLQ messages. Do not delete or redrive them as part of this experiment.

The regional Fargate On-Demand vCPU quota (`L-3032A538`) is not confirmed: the refreshed `servicequotas:GetServiceQuota` read is denied. Four worker tasks require 2 aggregate vCPU, in addition to other account workloads; this shared cluster currently has four running tasks across four services. Obtain quota/headroom confirmation from the course administrator if it cannot be read. Check available subnet addresses and any per-service or account restriction before claiming scale-out readiness. Do not attempt to bypass a denial.

## Single bounded submission command — prepared only

After a separate instruction authorizes execution and the preconditions pass:

```powershell
npm.cmd run load:jobs -- --execute --url https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5
```

This existing script creates `recognise` jobs and uploads raw JPEG bytes. It prints job IDs, never presigned URLs or read tokens. It does not poll completion and does not automatically stop on downstream processing failures. Have monitoring open before submission; interrupt the submitting process on new failures, retries, DLQ growth or unhealthy tasks. An interruption stops future submissions only; already accepted jobs still run. Do not immediately repeat the batch or increase the count to force scaling.

## Evidence collection and acceptance

Use UTC timestamps throughout, retaining a baseline before submission and observing until the queue drains and the service returns to its baseline (allow at least 20–30 minutes for observation; do not claim this is a guaranteed deadline).

| Evidence | Collect | Acceptance |
| --- | --- | --- |
| F14, queue pressure | SQS visible/in-flight/delayed depth, oldest message age, policy math and high-alarm history | Show actual backlog over time and correlate with submitted job IDs; missing datapoints are not zero. |
| F15, scale-out | Scaling activities and reasons, desired/running/pending task counts, task start times and health, CPU/memory | Actual running healthy tasks increase above 1 because of the policy. A configured policy or increased desired count alone is insufficient. |
| F16, recovery/scale-in | Queue drain, low-alarm history, successful scale-in activity and task count returning to 1 | Demonstrate all submitted jobs reach terminal success, no new DLQ entries and actual return to baseline. |

For correctness, use the submitted job IDs to correlate `job_received`, `job_processing`, `job_completed` and failure events. Read DynamoDB with a projection restricted to job ID, status, attempts, timing and required result fields; do not dump tokens, token hashes, or complete records. Confirm `water-lilies`, museum `met`, similarity >= 0.80, top-three descending candidates for results. Count unique job IDs, not log lines; SQS delivery can repeat. Capture processing duration separately from submission-to-completion latency. Preserve existing dashboard configuration; export metrics or screenshots without editing it.

**Important limitation:** a previously measured reference recognition took about 1.23 seconds inside the worker. Thirty similar serial jobs could drain in approximately 37 seconds, shorter than the high alarm's three-minute evaluation window. Startup, delivery, throttling and caching may change this. Therefore this batch can validate bounded throughput and correctness but may produce no scale-out. Record that outcome honestly as incomplete F15/F16 evidence, and seek approval for a different experiment rather than altering production settings or silently exceeding 30 jobs.

## Cost and risk estimate

The retrieved [AWS Sydney ECS price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-2/index.json) lists Linux/x86 Fargate at USD 0.04856 per vCPU-hour and USD 0.00532 per GB-hour. At 0.5 vCPU and 2 GB, compute is USD 0.03492/task-hour. Assuming four tasks run for the full 30-minute window, compute is USD 0.06984. With one [public IPv4 address](https://aws.amazon.com/vpc/pricing/) per task at USD 0.005/hour, this becomes approximately **USD 0.07984**; the three additional tasks contribute USD 0.05988 above the one-task baseline for that window.

This is a compute/address estimate, not the complete bill or a spending cap. S3, SQS, DynamoDB, S3 Vectors, API Gateway, Lambda, CloudWatch/Container Insights, ECR, applicable transfer, taxes and runtime beyond the window are excluded. Thirty copies of the current 372,985-byte image upload approximately 10.67 MiB. Recognition mode does not intentionally invoke Bedrock Analyse. Retries, continued baseline operation, cold starts, other account demand and failure to scale in can extend costs. Calculation and timestamp are in `verification/2026-10-31/bedrock-followup/cost-estimate.json`; `node scripts/estimate-scaling-test.mjs` refreshes public prices without submitting jobs.
