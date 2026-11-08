# Final CAB432 A3 scaling test — deployed Unframe

**Result: PARTIAL.** All 30/30 real recognition jobs succeeded, 30/30 matched Water Lilies, and the queue drained. **RunningTaskCount stayed at 1; this run does not demonstrate scale-out or scale-in.**

## Scope and preflight

- Verified AWS account **901444280953**, using the supplied temporary credentials in process environment variables only; role `arn:aws:sts::901444280953:assumed-role/AWSReservedSSO_CAB432-STUDENT_f2baa6a2ba3c79c9/n12281212@qut.edu.au`.
- Region explicitly set to **ap-southeast-2** for every AWS command.
- Deployed API base: `https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`. Read-only reachability check: `OPTIONS /a3/jobs`, HTTP **204**, at **2026-11-01T11:42:04.485Z**.
- Worker: cluster `n12281212-strobe-a2`, service `a3-n12281212-unframe-worker`; deployment COMPLETED, desired/running/pending **1/1/0**, task health HEALTHY, task definition revision **6**. Existing min/max **1/3**.
- Recognition queue before load: visible/in-flight/delayed **0/0/0**. Existing DLQ baseline: visible **3**, in-flight/delayed **0/0**; existing messages were untouched.
- Source checkout: `D:\FlyFly\Study\Project\Unframe`. Input: `mobile/assets/water-lilies.jpg`, **372985 bytes**, museum **met**, operation **recognise**.
- The earlier expired-credential preflight submitted zero jobs. This report records the subsequently authenticated run.

## Required results

| Item | Measurement |
| --- | --- |
| 1. Exact test start | **2026-11-01T11:42:04.499Z UTC** / **2026-11-01T21:42:04.499+10:00 AEST**. Start of monitored test interval, before warm-up submission. |
| 1. Exact test finish | **2026-11-01T11:51:03.050Z UTC** / **2026-11-01T21:51:03.050+10:00 AEST**. End of load/recovery observation; final read-only evidence collection followed. |
| 2. Submitted jobs | **30** total: **5 warm-up + 25 main**. All created and uploaded; zero submission failures. |
| 3. Submission concurrency | Warm-up **2**; main **5**. No overlap between batches. |
| 4. Initial SQS visible depth | **0**; also zero in-flight and delayed. |
| 5. Peak SQS visible depth | **15** in direct 20-second samples; CloudWatch one-minute Maximum peak **3**. Counts are approximate and these are sampled peaks. Oldest-message-age metric peak: **0 seconds**; brief waits can be missed by metric publication. |
| 6. Initial ECS RunningTaskCount | **1**. |
| 7. Maximum observed ECS RunningTaskCount | **1** in direct observations; CloudWatch Maximum **1**. |
| 8. Final ECS RunningTaskCount | **1**, desired **1**, pending **0**; already at minimum capacity. |
| 9. Approximate queue drain time | **60.1 seconds** from main command launch to first observed visible/in-flight/delayed **0/0/0**, at **2026-11-01T11:43:38.208Z**. Main batch's last worker completion was **16.5 seconds** after its first create response. |
| 10. Peak CPUUtilization | **26.1508%**, `AWS/ECS`, Maximum, period 60 seconds. |
| 11. Peak MemoryUtilization | **42.3096%**, `AWS/ECS`, Maximum, period 60 seconds. |
| 12. Lambda invocations/errors | **31 invocations / 0 errors**, `a3-n12281212-unframe-jobs`, one-minute Sum. Includes **30 job creates + 1 preflight OPTIONS** in the same metric minute. No status-poll Lambda calls were added; job completion was verified with consistent DynamoDB reads. |
| 13. DLQ before/after | **3 / 3 visible**; no observed growth. |
| 14. Failed jobs | **0**. **30 SUCCEEDED**, **30 correct**, **0 jobs with retries**; all recorded attempts were 1. Worker logs corroborate 30 `job_completed` events. |

## Submission commands and timestamps

The requested 30-job main run after five warm-up jobs would exceed the explicit **30-job total cap**. The main count was therefore reduced to **25**, with concurrency and workflow preserved.

```powershell
npm.cmd run load:jobs -- --execute --url https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob --image mobile/assets/water-lilies.jpg --museum met --count 5 --concurrency 2
npm.cmd run load:jobs -- --execute --url https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob --image mobile/assets/water-lilies.jpg --museum met --count 25 --concurrency 5
```

| Event | UTC | Brisbane (AEST, UTC+10) |
| --- | --- | --- |
| First warm-up create response | 2026-11-01T11:42:24.410Z | 2026-11-01T21:42:24.410+10:00 |
| Last warm-up upload response | 2026-11-01T11:42:25.785Z | 2026-11-01T21:42:25.785+10:00 |
| All five warm-up jobs verified successful and correct | 2026-11-01T11:42:38.079Z | 2026-11-01T21:42:38.079+10:00 |
| Main command launched | 2026-11-01T11:42:38.080Z | 2026-11-01T21:42:38.080+10:00 |
| First main create response | 2026-11-01T11:42:40.066+00:00 | 2026-11-01T21:42:40.066+10:00 |
| Last main upload response | 2026-11-01T11:42:43.818Z | 2026-11-01T21:42:43.818+10:00 |
| Last main worker completion | 2026-11-01T11:42:56.565Z | 2026-11-01T21:42:56.565+10:00 |
| All 30 successes first observed by consistent read | 2026-11-01T11:42:57.389Z | 2026-11-01T21:42:57.389+10:00 |
| Queue first observed empty after main completion | 2026-11-01T11:43:38.208Z | 2026-11-01T21:43:38.208+10:00 |
| Monitoring finished | 2026-11-01T11:51:03.050Z | 2026-11-01T21:51:03.050+10:00 |

## Monitoring and interpretation

Collected **28 timestamped snapshots** on a 20-second schedule, with one extra startup sample. Each captures direct SQS visible/in-flight/delayed counts, ECS running/desired/pending counts, DLQ depth, consistent job results, sanitized worker events, and all eight requested CloudWatch series. After startup the scheduled observation starts were approximately 20 seconds apart. CloudWatch metrics publish at one-minute resolution and can arrive later; every stored value retains its metric timestamp. Missing data was retained as missing, not replaced with zero. Raw responses and normalized CSVs are linked below.

CPU, memory, queue and task-count peaks use **Maximum**, period **60 seconds**. Lambda uses **Sum**. The metric window includes the full first and last minute containing the monitored interval; the preflight OPTIONS invocation explains the total of 31 rather than 30. CPU/memory percentages are `AWS/ECS` utilization, not raw Container Insights CPU units or MiB. No Lambda functions outside this recognition path were invoked by the harness or aggregated into the count.

SQS approximate readings temporarily remained nonzero after all job completions. The reported drain time uses the first observed full zero, rather than equating durable result persistence with immediate queue acknowledgement. It is bounded by the sampling interval and eventual consistency. A 20-second sampler can miss a short-lived larger backlog; **15 is an observed peak, not a guaranteed instantaneous maximum**. CloudWatch's peak may differ because its publication timing differs.

The existing target-tracking policy remained target **3 visible messages per running worker**, with scale-out/in cooldowns **30/120 seconds**. Its high alarm requires **three one-minute periods** above target; its low alarm requires **fifteen one-minute periods** below 2.7. A short burst did not sustain that scale-out condition. The high alarm was OK at the end; remaining at minimum is not evidence of a scale-in action.

Monitoring continued for at least **eight minutes after the main launch** to allow metric publication and alarm evaluation. End condition: Queue drained; no scale-out observed after eight-minute evaluation window; already at minimum. Because there was no scale-out, there could be no observed scale-back toward minimum; this is why the scaling demonstration is **PARTIAL**, while the recognition workload passed. No additional load was added to force scaling.

No unexpected AWS errors, job retries, repeated Bedrock failures, runaway scaling or DLQ growth occurred during the authenticated run. No AWS infrastructure, alarms, autoscaling settings, DesiredCount or application source was modified. Final target equality: **True**; policy equality: **True**; load-utility SHA256 unchanged: **True**. The harness used only allowlisted read-only AWS CLI operations; writes were the authorized API job creates, S3 uploads, and local evidence/report files.

## 15. Exact CloudWatch time range for the video

Select an **absolute** range on **1 November 2026**:

- **UTC: 2026-11-01 11:41:00 through 2026-11-01 11:53:00.**
- **Australia/Brisbane (AEST): 2026-11-01 21:41:00 through 2026-11-01 21:53:00.**

Use region **ap-southeast-2** and 1-minute periods across graphs. This range shows the baseline, short load burst and recovery. State on screen that task count stayed at one and this run **did not demonstrate autoscaling**. It cannot support a claim that scale-out or scale-in occurred.

## 16. Graphs to show on screen

1. **Recognition queue depth:** `AWS/SQS / ApproximateNumberOfMessagesVisible`, QueueName `a3-n12281212-unframe-recognition`, Maximum.
2. **Oldest message age:** `AWS/SQS / ApproximateAgeOfOldestMessage`, same queue, Maximum, seconds.
3. **Actual worker task count:** `ECS/ContainerInsights / RunningTaskCount`, ClusterName `n12281212-strobe-a2`, ServiceName `a3-n12281212-unframe-worker`, Maximum. Show that it remains one.
4. **Worker CPU and memory:** `AWS/ECS / CPUUtilization` and `MemoryUtilization`, same cluster/service, Maximum, percentage.
5. **Recognition Lambda requests and errors:** `AWS/Lambda / Invocations` and `Errors`, FunctionName `a3-n12281212-unframe-jobs`, Sum. Explain the extra preflight request.
6. **DLQ:** `AWS/SQS / ApproximateNumberOfMessagesVisible`, QueueName `a3-n12281212-unframe-recognition-dlq`, Maximum. Show the unchanged baseline of three.

## Evidence

Evidence directory: `verification/2026-11-01/final-scaling-test/` in the Unframe checkout.

- [Preflight identity, API, task health, policy and queue checks](../verification/2026-11-01/final-scaling-test/preflight.json).
- [Timestamped observations](../verification/2026-11-01/final-scaling-test/observations.jsonl) and [direct observations CSV](../verification/2026-11-01/final-scaling-test/direct-observations.csv).
- [CloudWatch raw metric data](../verification/2026-11-01/final-scaling-test/final-metrics.json), [metric definitions](../verification/2026-11-01/final-scaling-test/metric-queries.json), and [normalized metric CSV](../verification/2026-11-01/final-scaling-test/cloudwatch-metrics.csv).
- [All submitted IDs](../verification/2026-11-01/final-scaling-test/submitted-jobs.json), [durable job results](../verification/2026-11-01/final-scaling-test/final-jobs.json), and [sanitized worker events](../verification/2026-11-01/final-scaling-test/final-worker-events.json).
- [Submission and monitoring events](../verification/2026-11-01/final-scaling-test/events.jsonl), [test start](../verification/2026-11-01/final-scaling-test/run-start.json), and [test finish](../verification/2026-11-01/final-scaling-test/run-end.json).
- [Final scaling state, activities and unchanged-configuration checks](../verification/2026-11-01/final-scaling-test/final-config.json), [end alarms](../verification/2026-11-01/final-scaling-test/end-alarms.json), and [Lambda execution report counts](../verification/2026-11-01/final-scaling-test/lambda-reports.json).

```text
SCALING TEST RESULT
Jobs submitted: 30 (5 warm-up + 25 main)
Peak queue depth: 15 sampled visible messages (CloudWatch: 3)
ECS tasks: 1 -> 1 -> 1; no increase observed
Queue drain time: approximately 60 seconds to observed empty queue
Peak CPU: 26.15%
Peak memory: 42.31%
DLQ before/after: 3 / 3
Result: PARTIAL
```
