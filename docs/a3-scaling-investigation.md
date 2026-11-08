# CAB432 A3 ECS scaling investigation — 31 October 2026

> Subsequent authorized experiment completed: 883/883 correct successes, min 1 / max 3, and genuine automatic running-count changes 1 ? 3 ? 2 ? 1. See [final scaling results](a3-autoscaling-results.md). The earlier diagnosis/preflight below is retained as historical evidence.

The original 30-job burst was too short to trigger the existing scaling policy. It completed within approximately 18 seconds. Although direct SQS observation captured 13 visible messages and one in flight, every published one-minute backlog datapoint was zero. The high alarm therefore never breached. **Recognition passed 30/30; actual automatic scale-out and subsequent scale-in remain unproven.**

This investigation made read-only AWS calls. No new jobs, policy changes, deployments, manual desired-count changes or DLQ operations were performed. The larger experiment below is prepared for review, not executed.

## Evidence and timeline

Fresh AWS evidence was retrieved at approximately **07:24 UTC / 17:24 AEST**. Account authentication returned `901444280953`, profile `default`, region `ap-southeast-2`. Evidence is in [scaling-investigation](../verification/2026-10-31/scaling-investigation/); prior workload records are in [recognition-final](../verification/2026-10-31/recognition-final/).

| UTC on 31 October | AEST | Actual observation |
| --- | --- | --- |
| 07:04:32–07:04:37 | 17:04:32–17:04:37 | Thirty job records created, approximately six creates/second; timestamps have one-second precision. This is creation rate, not a precise SQS arrival rate. |
| 07:04:33.739–07:04:50.758 | 17:04:33.739–17:04:50.758 | Worker logs span first receive to last completion: 17.019 seconds. |
| 07:04:39.504 | 17:04:39.504 | Direct SQS read: visible 13, in-flight 1, delayed 0; service desired/running 1/1. This is an observed sample, not a guaranteed queue peak. |
| 07:04:54.705 | 17:04:54.705 | Queue empty; desired/running still 1/1. |
| 07:03–07:10, one-minute timestamps | 17:03–17:10 | CloudWatch visible Sum and Maximum both 0; RunningTaskCount 1; exact policy expression 0. Refetched at 07:24 to allow publication delay. |

Processing from `job_processing` to `job_completed` averaged **539.467 ms**, p95 **709 ms**, range **473–724 ms**. Receive-to-complete averaged **549.2 ms**. Receive/get/claim and between-message overhead mean that inverse processing time, **1.854 jobs/s**, is only a capacity approximation. All 30 jobs succeeded on attempt 1 with `water-lilies` and similarity approximately **0.99999535**. No Bedrock calls occurred in this recognition batch.

Relevant files: `original-timing.json`, `original-metric-math.json`, `original-minute-metrics.csv`, and prior `F14-load-results.json`, `F14-worker-events.json`, `F14-F16-observations.json`.

## Actual configuration and alternative causes

| Check | Observed configuration/result | Interpretation |
| --- | --- | --- |
| ECS | Cluster `n12281212-strobe-a2`; service `a3-n12281212-unframe-worker`; revision 6, v5; desired 1, running 1, pending 0, healthy | No scale-out deployment occurred during the burst. Earlier rolling-deployment task overlap is not scaling evidence. |
| Per-task limits | CPU 512, memory 2048 MiB, Linux/X86_64 | University limits preserved. Four tasks would require 2 aggregate vCPU and 8 GiB. |
| Target | `ecs:service:DesiredCount`, resource `service/n12281212-strobe-a2/a3-n12281212-unframe-worker`, min 1/max 4 | Correct service dimensions. |
| Policy | `unframe-sqs-backlog`, TargetTrackingScaling, target 3, out/in cooldown 30/120 seconds, scale-in enabled | No temporary changes proposed. |
| Math | `m1 / m2`; m1 = `AWS/SQS ApproximateNumberOfMessagesVisible`, Sum, QueueName `a3-n12281212-unframe-recognition`; m2 = `ECS/ContainerInsights RunningTaskCount`, Average, exact cluster/service above | Both input series exist. The actual managed alarms use 60-second periods. |
| High alarm | Enabled; `>3`, three evaluation periods; state OK | No transition/action in history queried from 07:03 through 07:24. None of the burst datapoints breached. |
| Low alarm | Enabled; `<2.7`, fifteen evaluation periods; state ALARM | Being low at minimum capacity is normal, not proof of scale-in. |
| Scaling suspension | Dynamic in/out and scheduled suspension all false | Not the cause. |
| Activities | Only an earlier low-alarm action with `AlreadyAtMinCapacity` | Its `Failed` status does not indicate an IAM denial. There was no burst scale-out attempt to be blocked by a cooldown or quota. |
| Service events | Deployment completed and steady state before the burst; no capacity/placement failure reported | No evidence of a resource failure causing this non-event. Future capacity remains untested. |
| Queue / DLQ | Recognition 0 visible/0 in-flight/0 delayed; DLQ 3/0/0 | Existing DLQ messages left untouched. Visibility 300 seconds, redrive maxReceiveCount 5. |
| Shared cluster | Four running Fargate tasks, zero pending, four active services at the capacity read | Shared demand exists; cluster counts do not establish account-wide quota headroom. |
| Subnets | Existing service subnets have 3,339 and 3,361 available IP addresses | No observed subnet-address shortage. Regional Fargate capacity is not guaranteed. |
| Quota | `servicequotas:GetServiceQuota`, Fargate `L-3032A538`, denied because no identity policy allows the action | Exact permitted-capacity headroom remains unknown. No attempt to bypass the denial. |

**Confirmed cause:** the transient backlog was absent from the published series used by the alarm. The three-period evaluation requirement independently makes an approximately 18-second burst unsuitable. Queue drainage plus sampling/evaluation timing explains the result; there is no evidence that incorrect dimensions, suspension, cooldown, IAM or quota blocked a requested scale-out. Their absence from this failed demonstration does not prove future launches will be allowed.

SQS publishes approximate metrics at one-minute intervals; a direct queue-attribute observation can capture a short burst that published datapoints miss. See [AWS SQS monitoring](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/monitoring-using-cloudwatch.html).

## Target and scaling approach

AWS calculates acceptable backlog as acceptable queue delay divided by average message processing time. With the measured processing interval, target 3 implies approximately **1.618 seconds** of queued processing; an illustrative five-second delay budget gives `floor(5 / 0.539467) = 9`. No queue-delay SLO has been specified, so changing to 9 is not justified. Cold starts and metric delay prevent either value from guaranteeing short latency. Retain **3** for this experiment. Lowering it cannot fix a sampled backlog of zero. The existing Sum/Average expression follows [AWS ECS queue-scaling guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-queue.html).

Target tracking is suitable for sustained traffic and needs no new infrastructure. Step scaling would permit a custom one-period high alarm and explicit increments, but needs separately configured alarms and policies. It still cannot react to an unobserved burst; high-resolution custom publication would be a larger architectural change. Starting a cold worker after an 18-second burst has drained also adds cost without serving that burst. Keep the existing policy for an honest demonstration of its intended workload. See [AWS step scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-stepscaling.html).

## Proposed sustained experiment — approval pending

The prior 30-job limit is insufficient. The smallest practical next experiment is a **paced, early-stopping run**, rather than another burst or an unconditionally large batch. Its conservative envelope is:

| Parameter | Proposed bound |
| --- | --- |
| Input | Existing public reference `mobile/assets/water-lilies.jpg`; museum `met`; operation `recognise` |
| Submission | At most 3 starts/second, five concurrent create/upload operations, no catch-up bursts |
| Hard workload cap | **900 job-creation attempts or five minutes**, whichever comes first; no automatic repetition or increase |
| Early stop | At least two healthy running workers, a scaling activity explaining the increase, and successful jobs on distinct worker task streams |
| Observation | Up to **40 minutes from first submission**, including metric publication, queue drainage and scale-in |
| Infrastructure | Existing API, queues, worker image, min 1/max 4, target 3 and cooldowns unchanged |

At 3 jobs/s and the optimistic measured capacity of 1.854 jobs/s, one worker accumulates approximately **206 queued jobs after three minutes**, or **344 after five minutes**, if scale-out has not yet occurred. Even the fastest observed 473-ms processing interval implies less than 2.12 jobs/s before overhead. Three jobs/s therefore provides useful margin without a large burst. Maintaining backlog for three minutes requires hundreds of jobs; 30 cannot do it at this service rate. The additional two minutes allow period alignment/publication delay and task startup. The 900 cap is a conservative envelope, not a claim of a mathematically minimal or guaranteed workload. Stop early as soon as useful evidence exists.

A fresh baseline must reconfirm account, service health, empty recognition queue, unchanged policy/max capacity, and DLQ count. Capture any new deployment, unrelated workload or policy change as a confounder. Stop new submissions on authentication failure, create/upload errors, processing failure/retry, DLQ growth, unhealthy workers, or a capacity/permission error. Do not retry an ambiguous job-creation response, extend the cap, change DesiredCount or repair IAM. Already accepted work remains eligible to finish. Quota headroom can be confirmed by the course administrator; current read access cannot guarantee it.

No policy restoration is needed because **no policy changes are proposed**. If automatic scale-in fails within the observation window, report the activity/error and continuing cost; do not force DesiredCount back to 1 to fabricate F16.

The existing `load:jobs` utility only supports 1–50 unpaced jobs and lacks downstream stop gates. **Do not run it with `--count 900` or loop batches.** Before an approved run, minimally extend the local test harness with pacing, hard bounds, cancellation, a unique run manifest and monitored stop conditions. Unit-test that harness with mocked HTTP responses. No worker/API business-code change or deployment is required for this proposal. A ready-to-execute large-load command is deliberately not claimed here.

## Scale-in and message safety

`worker/worker.js` processes one message at a time. `worker/start.js` aborts on SIGTERM; it does not drain the active job. Live `GetTaskProtection` reports `protectionEnabled=false`; revision 6 does not explicitly configure `stopTimeout`. Do not infer a graceful 120-second drain from the example task-definition file.

`worker/process-job.js` saves success before deleting the S3 image and acknowledging SQS. Completed duplicates skip inference. `server/cloud/job-repository.js` conditionally owns leases, records retries, and limits attempts; the 300-second visibility budget exceeds the 180-second processing deadline. An interrupted in-flight job can still retry and incur delay or eventual failure. This is not exactly-once execution.

For this short-job test, confirm every submitted job is successful and visible/in-flight queue counts are zero before interpreting subsequent scale-in as safe recovery. The fifteen-period low alarm supplies a long idle interval, but does not itself protect work. Production hardening should separately consider bounded task protection around processing and graceful shutdown; see [AWS task scale-in protection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-scale-in-protection.html). No protection, timeout or retry changes are included in this experiment.

## Evidence collection and acceptance

Record UTC timestamps plus AEST equivalents. Poll service desired/running/pending counts, task health and queue attributes every 10–15 seconds during submission; collect minute metrics and alarm/activity history through recovery. Retain missing metric points as missing, not zero. Preserve baseline/current policy hashes to show it was unchanged.

| Evidence | Required proof | Current result |
| --- | --- | --- |
| Policy configured | Target, dimensions, alarms, enabled actions and suspension settings | PASS |
| F14 backlog | Direct SQS depth plus published backlog/math time series during sustained demand | Original direct observation PASS; sustained series not yet demonstrated |
| Alarm triggered | High alarm transition with breaching datapoints and policy action | Not observed in original test |
| Desired increased | Scaling activity and ECS desired count >1 | Not observed |
| F15 running increased | Published RunningTaskCount >1, matching healthy tasks and task-stream job completions; caused by scaling, not deployment | NOT DEMONSTRATED |
| F16 scale-down | After drain, low-alarm action, scaling activity, actual running count returning from >1 to 1 and healthy baseline | NOT DEMONSTRATED; remaining at 1 is not scale-down |
| Correctness | Every unique accepted job SUCCEEDED, `water-lilies`, similarity >=0.80, <=3 descending candidates, MET/config filters preserved; no added DLQ messages | Original batch 30/30; proposed run not executed |

Save only allowlisted job/result fields, aggregate metrics, task IDs and sanitized log events. Keep presigned URLs/read tokens in memory only. Use bounded DynamoDB result projections for bulk verification rather than dumping full records. Collect CPU/memory and task-start timestamps to explain capacity and startup. Do not edit the existing dashboard.

## Cost and risks

The public Sydney prices retrieved on 31 October are USD 0.04856/vCPU-hour and 0.00532/GiB-hour: **$0.03492 compute per worker-hour**, or **$0.03992 including one public IPv4 address**. Four workers for all 40 minutes cost **$0.10645** for compute/address use; the three additional workers contribute **$0.07984** above one-worker baseline.

Including illustrative API/Lambda, DynamoDB, S3, SQS, vector-query, log and metric-read assumptions gives approximately **$0.14222** for the proposed window. Use **$0.50 as a planning allowance**, not an enforced billing cap. The full 900-image cap uploads about 335.7 MB. No Bedrock calls are planned. Price sources, formulas and assumptions are retained in [experiment-proposal.json](../verification/2026-10-31/scaling-investigation/experiment-proposal.json), based on the retrieved [Sydney ECS price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-2/index.json) and other service price inputs linked there.

This is an estimate, not a bill or complete upper bound: shared infrastructure, enhanced Container Insights observations, extra logs, transfer where applicable, retries, tax and runtime after 40 minutes can add cost. If three extra workers remain running, their compute/address cost continues at approximately **$0.11976/hour**. Baseline resources already incur costs. Unknown quota/capacity, cold starts, publication delays and absent active-work protection are the main operational limitations.

The original 30-job test added no worker task-hours through scaling. It still incurred normal request/processing charges on the existing worker. This investigation has incurred read/monitoring requests only; the proposed workload estimate is not a measured charge.

## Local changes and validation

Added read-only `scripts/audit-scaling-behaviour.mjs`, local-only `scripts/plan-sustained-scaling.mjs`, this report and sanitized evidence. Corrected the worker source path in the evidence checklist; linked the historical 30-job plan to these results. No application implementation changed.

Commands executed from the repository root:

```powershell
node scripts/audit-scaling-behaviour.mjs
node --check scripts/audit-scaling-behaviour.mjs
node --check scripts/plan-sustained-scaling.mjs
node scripts/plan-sustained-scaling.mjs
node --test tests/aws-jobs.test.js
```

Cluster/subnet capacity reads were also executed separately using the projections now included in the collector. Syntax checks passed. Jobs regression tests: **17 passed, 0 failed**, including durable completion ordering, retry handling, duplicate safety, conditional leases and visibility constraints. These local tests do not prove live autoscaling.

**Overall: diagnosis PASS; scaling demonstration NOT YET PASS.** Next action is approval of the larger bounded experiment above, followed by guarded harness preparation and one monitored run. This pause follows the user's explicit requirement to report a larger workload and its costs before execution; it is not an AWS deployment rejection.
