# F15/F16 execution preflight — 31 October 2026, 07:45 UTC

> Subsequent authorized experiment completed: 883/883 correct successes, min 1 / max 3, and genuine automatic running-count changes 1 ? 3 ? 2 ? 1. See [final scaling results](a3-autoscaling-results.md). The earlier diagnosis/preflight below is retained as historical evidence.

**Blocked before load generation.** Default-profile authentication succeeded for account `901444280953`, but the current regional Fargate quota/headroom remains unverified. The latest task explicitly requires uncertain quota constraints to be reported before generating load. No new recognition jobs were submitted, and no AWS configuration was changed.

## Exact blocker

At **2026-10-31T07:45:07.967Z / 17:45:07.967 AEST**, AWS returned:

```text
AccessDeniedException: Current AWS principal is not authorized to perform:
servicequotas:GetServiceQuota
on resource:
arn:aws:servicequotas:ap-southeast-2:901444280953:fargate/L-3032A538
because no identity-based policy allows the action.
```

This is a denied quota-read operation, not a confirmed task-launch denial or evidence of an exhausted quota. Existing scaling max 4 does not prove regional headroom. The next input needed is course-administrator confirmation of the current On-Demand Fargate vCPU quota and available capacity for **three additional 0.5-vCPU tasks (1.5 extra vCPU)**, including other account workloads. No IAM/SCP change or credentials are requested.

## Refreshed AWS results

Evidence was collected between approximately **07:44:46 and 07:45:23 UTC / 17:44:46 and 17:45:23 AEST** into [scaling-recheck](../verification/2026-10-31/scaling-recheck/). Earlier evidence was preserved separately.

| Check | Result |
| --- | --- |
| Cluster/service | `n12281212-strobe-a2` / `a3-n12281212-unframe-worker` |
| Worker | Revision 6, existing v5 digest, Linux/x86_64, 512 CPU / 2048 MiB |
| Health | Desired 1, running 1, pending 0; worker and task HEALTHY |
| Target/policy | Min 1/max 4; `unframe-sqs-backlog`; target 3; out/in cooldown 30/120 seconds; all suspension flags false |
| High alarm | OK, enabled actions, >3 for three 60-second periods |
| Low alarm | ALARM, enabled actions, <2.7 for fifteen 60-second periods |
| Scaling activities | Only the earlier low-alarm `AlreadyAtMinCapacity` activity; no new scale-out or scale-in |
| Recognition queue | Visible 0, in-flight 0, delayed 0; oldest-age metric 0 |
| DLQ | Three existing visible messages, zero in-flight/delayed; untouched |
| Shared cluster | Four running Fargate tasks, zero pending; other services share capacity |
| Available subnet IPs | 3,346 and 3,367; no observed IP shortage |
| Task protection | Existing worker protection disabled |

The **07:30–07:44 UTC** minute metrics contain fifteen RunningTaskCount samples, all **1**, and fifteen visible-backlog samples, all **0**. CPU averages ranged **1.397–1.574%** over fourteen available samples; memory was **40.967%**. The missing latest CPU/memory sample is retained as missing, not replaced with zero. These are idle-baseline readings, not load-test measurements.

## Reused experiment and calculations

The [existing investigation](a3-scaling-investigation.md) remains valid: the original 30 jobs completed in approximately 18 seconds. Direct SQS sampling saw 13 visible plus one in-flight message, but the published one-minute backlog series remained zero. The three-period high alarm never requested scale-out. Original recognition correctness was 30/30; no new correctness result is claimed.

Using the existing backlog calculation, target = acceptable queue latency / average processing duration. At 0.539467 seconds, target 3 corresponds to approximately **1.618 seconds** of queued processing. A five-second queue-delay objective would suggest about **9** jobs/task, but that objective has not been specified by the user. Retain target **3**, with no temporary policy changes. Metric and cold-start delays prevent this calculation from guaranteeing a response-time SLO.

Once the quota prerequisite is resolved, reuse the bounded proposal: real `water-lilies.jpg` recognition jobs for museum `met`, at most **3 starts/second**, **5 concurrent submissions**, and **900 creation attempts or 5 minutes**, whichever occurs first. Stop early once automatic scale-out is corroborated by healthy workers and successful jobs on separate task streams. Observe natural drainage and scale-in for up to **40 minutes from first submission**. No manual DesiredCount, artificial records, worker deployment or DLQ changes.

At the measured approximate serial capacity of 1.854 jobs/second, 3 arrivals/second would leave about 206 queued jobs after three minutes without scaling. This maintains a visible backlog across multiple sampling periods; it is a planning estimate, not a guarantee. The guarded paced harness still needs preparation and mocked validation before execution; the existing unpaced 50-job-capped utility must not be looped to simulate this plan.

At full workload cap, expect 900 API job creates, 900 image PUTs, about 335.7 MB uploaded, and corresponding worker reads/vector queries/completions. The saved cost scenario allows up to 5,400 API/Lambda requests including status reads, approximately 2,700 message operations plus idle polls, and additional database/monitoring requests. Estimated total is **US$0.14222**, including the conservative assumption of all four workers running throughout the 40-minute window. Extra compute/public IPv4 above the one-worker baseline is approximately **US$0.07984**. A US$0.50 planning allowance is not a billing cap. See [saved formulas and exclusions](../verification/2026-10-31/scaling-investigation/experiment-proposal.json).

## Actual execution result

| Requested report item | Actual result this attempt |
| --- | --- |
| Workload/duration | **0 jobs; no load period** |
| Peak backlog | Current baseline 0; historical original-test observed sample 13 |
| RunningTaskCount before/during/after | Baseline 1; during/after load not applicable because no experiment ran |
| Scaling activity | No new activity; earlier `AlreadyAtMinCapacity` is not scale-down |
| F15 | **FAIL to demonstrate — blocked, not an observed scaling-system failure** |
| F16 | **FAIL to demonstrate — blocked, not an observed scaling-system failure** |
| Job success rate | No new sample; original 30/30 remains historical evidence |
| Cost impact | Read/monitoring requests only; no new load or incremental scaling task-hours. Billing total not measured. |
| Restoration | No settings were changed; nothing to restore |

Evidence files:

- `verification/2026-10-31/scaling-recheck/result.json`: structured outcome and proposed bounds.
- `quota.json`: exact sanitized denial and timestamp.
- `current-metric-math.json` and `current-minute-metrics.csv`: real CloudWatch queue, math, running-count, CPU and memory data.
- `activities.json`, `alarms.json`, `alarm-0-history.json`, `alarm-1-history.json`: policy actions and alarm state/history.
- `service.json`, `task-health.json`, `target.json`, `policy.json`: current service and scaling configuration.
- `recognition.json`, `recognition-dlq.json`, `cluster-capacity.json`, `subnet-capacity.json`: queue/capacity checks.

Local change: the read-only audit collector now accepts a separate output directory and includes CPU, memory, in-flight count and oldest-message age metrics. No application code changed. Its syntax check and collection run completed; the quota read is explicitly recorded as denied, not counted as a successful check.

```powershell
node --check scripts/audit-scaling-behaviour.mjs
node scripts/audit-scaling-behaviour.mjs verification/2026-10-31/scaling-recheck
```

**Next action:** resolve the quota/headroom uncertainty through the course administrator, then refresh the baseline and perform the single bounded run. F15/F16 cannot be reported as PASS from these idle metrics.
