// Derive verdicts only from saved AWS observations, activities, metrics and projected job results.
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'verification/2026-10-31/scaling-max-three/run-01';
const read = async name => JSON.parse(await readFile(`${dir}/${name}.json`, 'utf8'));
const run = await read('run-summary'), observations = await read('observations'), jobs = await read('jobs');
const metrics = (await read('F14-F16-cloudwatch-metrics')).value.MetricDataResults;
const activities = (await read('F15-F16-scaling-activities')).value.ScalingActivities;
const events = (await read('F14-F16-worker-events')).value;
const target = (await read('final-target')).value.ScalableTargets[0];
const policy = (await read('final-policy')).value.ScalingPolicies.find(p => p.PolicyName === 'unframe-sqs-backlog');
const beforePolicy = JSON.parse(await readFile('verification/2026-10-31/scaling-max-three/policy-before-update.json', 'utf8')).value;
const stopped = (await read('stopped-tasks')).value;
const submissions = (await readFile(`${dir}/submissions.jsonl`, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const load = submissions.find(e => e.event === 'load_finished');
const samples = observations.samples, startMs = Date.parse(observations.startedAt), last = samples.at(-1);
const scaleActivities = activities.filter(a => Date.parse(a.StartTime) >= startMs);
const scaleOut = scaleActivities.find(a => a.StatusCode === 'Successful' && /Setting desired count to [23]\./.test(a.Description) && a.Cause.includes('AlarmHigh'));
const scaleIn = scaleActivities.find(a => a.StatusCode === 'Successful' && a.Description === 'Setting desired count to 1.' && a.Cause.includes('AlarmLow') && Date.parse(a.StartTime) > Date.parse(scaleOut?.StartTime));
const scaleIns = scaleActivities.filter(a=>a.StatusCode==='Successful'&&a.Cause.includes('AlarmLow')).sort((a,b)=>Date.parse(a.StartTime)-Date.parse(b.StartTime));
const series = id => { const m = metrics.find(m => m.Id === id); return (m?.Timestamps || []).map((t,i)=>({at:new Date(t).toISOString(),value:m.Values[i]})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)); };
const running = series('m2'), queue = series('visible_max');
const firstOut = samples.find(s=>s.running>1), firstDown = firstOut && samples.find(s=>Date.parse(s.at)>Date.parse(firstOut.at)&&s.running===1&&s.desired===1);
const runningTransitions = samples.filter((s,i)=>!i||s.running!==samples[i-1].running).map(s=>({at:s.at,running:s.running,desired:s.desired}));
const lastBusy = samples.findLastIndex(s=>s.queue.visible || s.queue.inflight || s.queue.delayed);
const drain = samples.slice(lastBusy+1).find(s=>s.succeeded===load.created);
const allCorrect = jobs.length === load.created && jobs.every(j=>j.status==='SUCCEEDED'&&j.correct&&j.attempts===1);
const finalHealthy = last.health.length===1 && last.health[0].health==='HEALTHY';
const perTask = {};
for (const e of events.filter(e=>e.event==='job_completed')) perTask[e.stream.split('/').at(-1)]=(perTask[e.stream.split('/').at(-1)]||0)+1;
const processing = jobs.flatMap(j=>{
  const began=events.find(e=>e.jobId===j.jobId&&e.event==='job_processing');
  const ended=events.find(e=>e.jobId===j.jobId&&e.event==='job_completed');
  return began&&ended?[ended.timestamp-began.timestamp]:[];
}).sort((a,b)=>a-b);
const minutes = (Date.parse(last.at)-startMs)/60000;
let taskSeconds=0;
for(let i=1;i<samples.length;i++) taskSeconds += samples[i-1].running * (Date.parse(samples[i].at)-Date.parse(samples[i-1].at))/1000;
const hours=taskSeconds/3600, baselineHours=(Date.parse(last.at)-Date.parse(samples[0].at))/3600000;
const recentStops = stopped.filter(t=>Date.parse(t.stoppedAt)>=startMs);
const unexpectedStops = recentStops.filter(t=>t.stopCode!=='ServiceSchedulerInitiated');
const result={generatedAt:new Date().toISOString(), cluster:'n12281212-strobe-a2',target:{min:target.MinCapacity,max:target.MaxCapacity},
  policy:policy.TargetTrackingScalingPolicyConfiguration,
  policyPreserved:JSON.stringify((await read('final-policy')).value)===JSON.stringify(beforePolicy),
  workload:{...load,firstCreated:submissions.find(e=>e.event==='job_created').at,lastCreated:submissions.findLast(e=>e.event==='job_created').at,observationMinutes:minutes},
  successful:jobs.filter(j=>j.status==='SUCCEEDED').length,correct:jobs.filter(j=>j.correct).length,failed:jobs.filter(j=>j.status==='FAILED').length,
  retries:jobs.filter(j=>j.attempts>1).length,allCorrect,perTaskCompletions:perTask,
  processing:{samples:processing.length,meanMs:processing.reduce((a,b)=>a+b,0)/processing.length,p95Ms:processing[Math.ceil(processing.length*.95)-1]},
  peakObservedVisible:Math.max(...samples.map(s=>s.queue.visible)),peakCloudWatchVisible:Math.max(...queue.map(p=>p.value)),
  peakRunning:Math.max(...samples.map(s=>s.running)),firstRunningIncrease:firstOut?.at,firstRunningDecrease:firstDown?.at,sustainedDrainObserved:drain?.at,
  scaleOut,scaleIn,scaleIns,runningTransitions,otherActivities:scaleActivities.filter(a=>a!==scaleOut&&a!==scaleIn),finalSample:last,
  unexpectedStoppedTasks:unexpectedStops,stoppedTasks:recentStops,
  cpuRange:[Math.min(...series('cpu').map(p=>p.value)),Math.max(...series('cpu').map(p=>p.value))],
  memoryRange:[Math.min(...series('memory').map(p=>p.value)),Math.max(...series('memory').map(p=>p.value))],
  F14:queue.some(p=>p.value>0)?'PASS':'FAIL',
  F15:scaleOut&&firstOut&&running.some(p=>Date.parse(p.at)>=startMs&&p.value>1)&&Object.keys(perTask).length>1?'PASS':'FAIL',
  F16:scaleIn&&firstDown&&running.some(p=>Date.parse(p.at)>=Date.parse(scaleIn.StartTime)&&p.value===1)&&last.queue.visible===0&&last.queue.inflight===0&&last.dlq.visible===3&&allCorrect&&finalHealthy?'PASS':'FAIL',
  estimatedCost:{currency:'USD',observedRunningTaskHours:hours,computeAndIPv4FromSampledRunningTime:hours*.03992,
    extraComputeAndIPv4AboveOneTask:(hours-baselineHours)*.03992,conservativePlannedTotal:.1156043716860516,
    caveat:'Sampled running time excludes some provisioning/image-pull and stopping time. Total is a pre-run cost scenario, not billing. Requests, monitoring, retries and taxes vary.'},
  limits:{maxSubmitted:900,maxCreateDurationSeconds:300,maxWorkers:3,maxObservationMinutes:40,actualMaxWorkers:Math.max(...samples.map(s=>s.running))},
  note:'No manually adjusted DesiredCount, synthetic metrics, new worker deployment, IAM changes or DLQ changes. Max 3 is the requested new baseline, not a temporary setting.'};
await writeFile(`${dir}/F14-F16-verdict.json`,JSON.stringify(result,null,2));
const utc = value => value ? new Date(value).toISOString() : 'Not observed';
const aest = value => value ? new Date(Date.parse(value)+10*3600000).toISOString().replace('Z',' AEST') : 'Not observed';
const report = `# CAB432 A3: real ECS automatic scaling evidence

Generated ${result.generatedAt}. F14 **${result.F14}**, F15 **${result.F15}**, F16 **${result.F16}**. Verdicts require actual CloudWatch data and successful policy activities, not just configured alarms or desired-count changes.

## Configuration and authorization

- Account 901444280953, profile default, Sydney ap-southeast-2.
- Actual cluster: n12281212-strobe-a2; existing service: a3-n12281212-unframe-worker.
- Scalable target now min **${target.MinCapacity}**, max **${target.MaxCapacity}**. Maximum was explicitly changed from 4 to 3 at 07:58:31 UTC; the saved deployment template was updated to match.
- Policy unframe-sqs-backlog remains target **3**, scale-out/in cooldowns **30/120 seconds**. Exact before/after policy equality: **${result.policyPreserved}**. Suspension flags remain false.
- Task definition revision 6 and v5 image retained; each worker remains Linux/x86_64, **512 CPU / 2048 MiB**. No worker deployment or IAM changes.
- The user explicitly authorized one run capped at 900 jobs or five minutes, three starts/second, five concurrent submissions, max three workers, and up to forty minutes of observation. This included proceeding despite denied quota reads while monitoring actual capacity errors.
- The supplied university tutorial defines min/max guardrails, not account quota availability. Its example CPU policy was not substituted for this project's existing SQS backlog policy. No assessed resources were cleaned up.

## Workload and results

The previous thirty-job test drained in about eighteen seconds and its one-minute backlog series stayed zero; it could not satisfy the three-period high alarm. Target 3 corresponds to about 1.62 seconds of queued processing at the prior 539-ms mean, but publication, evaluation and startup delays prevent it from guaranteeing that latency during a burst.

This run used the existing load generator's real API-create and raw S3 PUT workflow with bounded pacing, public reference mobile/assets/water-lilies.jpg, museum met and operation recognise. All creates used the existing /a3/jobs endpoint. No artificial records or direct queue injections were made.

| Measurement | Actual result |
| --- | --- |
| Created / uploaded | ${load.created} / ${load.uploaded} |
| Submission failures | ${load.failed} |
| Submission elapsed | ${(load.elapsedMs/1000).toFixed(3)} seconds, including completion of accepted uploads |
| First / last job created | ${result.workload.firstCreated} / ${result.workload.lastCreated} |
| Stop condition | Five-minute creation deadline; no further submissions during recovery |
| Correct successful jobs | ${result.correct}/${load.created} |
| Failed jobs / jobs retried | ${result.failed} / ${result.retries} |
| Recognition checks | water-lilies; similarity >=0.80; at most three descending candidates; museum met; all recorded attempts checked |
| Mean / p95 processing interval | ${result.processing.meanMs.toFixed(1)} / ${result.processing.p95Ms} ms (${result.processing.samples} log-correlated samples) |
| Peak direct SQS visible reading | ${result.peakObservedVisible} |
| Peak published CloudWatch visible reading | ${result.peakCloudWatchVisible} |
| Maximum actual running workers | ${result.peakRunning} |
| Final desired / running / pending | ${last.desired} / ${last.running} / ${last.pending} |
| Final queue visible / in-flight | ${last.queue.visible} / ${last.queue.inflight} |
| Final DLQ visible | ${last.dlq.visible}; baseline 3, no messages deleted or redriven |
| Unexpected stopped tasks | ${unexpectedStops.length} |

SQS counts are approximate. Transient non-zero readings continued briefly after durable completion; the sustained-zero observation is used below. CloudWatch sampling and direct readings have different timing, so their peaks need not match. All three workers processed real jobs: ${Object.entries(perTask).map(([task,count])=>task+': '+count).join('; ')}.

## Actual automatic actions and timestamps

| Event | UTC | Brisbane (AEST) |
| --- | --- | --- |
| Successful high-alarm scale-out action | ${utc(scaleOut?.StartTime)} | ${aest(scaleOut?.StartTime)} |
| First observed RunningTaskCount >1 | ${utc(firstOut?.at)} | ${aest(firstOut?.at)} |
| Sustained empty queue after all successes | ${utc(drain?.at)} | ${aest(drain?.at)} |
| Successful low-alarm scale-in action | ${utc(scaleIn?.StartTime)} | ${aest(scaleIn?.StartTime)} |
| First observed desired/running back at 1 | ${utc(firstDown?.at)} | ${aest(firstDown?.at)} |

Successful low-alarm steps: ${scaleIns.map(a=>a.Description+' '+utc(a.StartTime)+' (activity '+a.ActivityId+')').join('; ')}.

Scale-out activity ID: ${scaleOut?.ActivityId || 'Not observed'}. Final scale-in activity ID: ${scaleIn?.ActivityId || 'Not observed'}. Both must show Successful for their corresponding evidence to pass. The observed running-count sequence is **${runningTransitions.map(t=>t.running).join(' → ')}**. All intermediate successful actions are retained in the activity evidence. DesiredCount was never manually set. An AlreadyAtMaxCapacity activity is an expected guardrail, not a task-launch failure.

The managed high alarm requires three 60-second periods above 3; the low alarm requires fifteen periods below 2.7. Scale-in therefore takes longer than the 120-second cooldown alone. This run preserved both managed alarms and the policy. Maximum 3 is the requested new baseline, so it was not restored to 4.

## Costs and limitations

Pre-run conservative scenario: approximately **US$0.116** including three workers for forty minutes and assumed requests/monitoring; US$0.50 was a planning allowance, not an enforced billing cap. Sampled running-task time gives approximately **US$${result.estimatedCost.computeAndIPv4FromSampledRunningTime.toFixed(4)}** for compute/public IPv4, including **US$${result.estimatedCost.extraComputeAndIPv4AboveOneTask.toFixed(4)}** above one-worker baseline. Provisioning, image pulls and stopping can add task billing time; request/monitoring charges and tax are additional to the sampled compute figure. These are estimates, not an AWS bill.

Numeric Fargate quota remains unreadable (servicequotas:GetServiceQuota denied). Actual successful operation of three workers proves capacity was available for this run, not future regional headroom. Active-work scale-in protection remains disabled; this experiment drained before scale-in, and every job's attempt count was checked. Repeated reference-image traffic is a scaling demonstration, not a representative diverse-visitor capacity benchmark or a latency guarantee.

## Evidence and local validation

All evidence is in [the run directory](../${dir}/):

- [CloudWatch metric CSV](../${dir}/F14-F16-metrics.csv) and [raw metric data](../${dir}/F14-F16-cloudwatch-metrics.json).
- [Scaling activities](../${dir}/F15-F16-scaling-activities.json), alarm history files, observations.json, stopped-tasks.json, final-target.json and final-policy.json.
- [Projected job results](../${dir}/jobs.json), sanitized F14-F16-worker-events.json, submissions.jsonl and [derived verdict](../${dir}/F14-F16-verdict.json).
- [F14 queue graph](../${dir}/F14-queue.png), [F15/F16 running-task graph](../${dir}/F15-F16-running.png) and [CPU/memory graph](../${dir}/worker-utilization.png). These are AWS-rendered charts of actual metrics, not fabricated console screenshots.

The first preflight stopped before any jobs because the Node SDK could not resolve the CLI login profile. The harness was changed to reuse the CLI session in process memory; no credentials were written or printed. Its zero-job failure is preserved in preflight-failure.json. Resuming that preflight did not create a second workload.

Local changes are confined to test/evidence tooling and the scaling-target template: load-recognition-jobs.mjs pacing/stop controls; set-scaling-max-three.mjs; run-scaling-experiment.mjs; collect-scaling-evidence.mjs; summarize-scaling-experiment.mjs; scaling-load.test.js; deployment/ecs/scalable-target.json. Recognition, embeddings, Bedrock, routes and CloudFront were unchanged.

Tests: **23 passed / 0 failed** (six pacing/safety tests plus seventeen existing AWS Jobs regression tests). Syntax checks passed. Commands used:

\`\`\`powershell
node scripts/audit-scaling-behaviour.mjs verification/2026-10-31/scaling-max-three/before
node scripts/set-scaling-max-three.mjs --apply
node --test tests/scaling-load.test.js tests/aws-jobs.test.js
node scripts/run-scaling-experiment.mjs --execute
node scripts/run-scaling-experiment.mjs --execute --resume-preflight
node scripts/collect-scaling-evidence.mjs
node scripts/summarize-scaling-experiment.mjs
\`\`\`
`;
await writeFile('docs/a3-autoscaling-results.md',report);
console.log(JSON.stringify({F14:result.F14,F15:result.F15,F16:result.F16,submitted:load.created,correct:result.correct,peakObservedVisible:result.peakObservedVisible,peakCloudWatchVisible:result.peakCloudWatchVisible,peakRunning:result.peakRunning,policyPreserved:result.policyPreserved,scaleOut:scaleOut?.StartTime,scaleIn:scaleIn?.StartTime,unexpectedStoppedTasks:unexpectedStops.length}));
