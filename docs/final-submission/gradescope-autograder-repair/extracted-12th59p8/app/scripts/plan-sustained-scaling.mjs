// Local evidence calculations only. Never submits jobs or changes AWS configuration.
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'verification/2026-10-31/scaling-investigation';
const prior = 'verification/2026-10-31/recognition-final';
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const timing = await read(`${dir}/original-timing.json`);
const events = await read(`${prior}/F14-worker-events.json`);
const observations = await read(`${prior}/F14-F16-observations.json`);
const pricing = await read(`${prior}/cost-model.json`);
const r = pricing.rates;
const starts = events.filter(e => e.event === 'job_received');
const ends = events.filter(e => e.event === 'job_completed');
const processingSeconds = timing.processing.meanMs / 1000;
const meanWorkerSeconds = starts.reduce((total, start) => total +
  ends.find(e => e.jobId === start.jobId).timestamp - start.timestamp, 0) / starts.length / 1000;
const maxJobs = 900, rate = 3, minutes = 40, maximumTasks = 4;
const perTaskHourly = .5 * r.cpu + 2 * r.memory + r.ipv4;
const requestsPerJob = 6; // Create plus up to five sampled status reads; bulk result verification uses DynamoDB.
const lines = {
  fargateAndIPv4AllFourTasksWholeWindow: maximumTasks * minutes / 60 * perTaskHourly,
  apiAndLambda: maxJobs * requestsPerJob * (r.api + r.lambdaRequest + .125 * .1 * r.lambdaCompute),
  dynamodbRequests: maxJobs * (6 * r.ddbRead + 6 * r.ddbWrite),
  s3PutGetAndTenMinuteImageStorage: maxJobs * (r.s3Put + r.s3Get + 372985 / 1e9 * 600 / (730 * 3600) * r.s3Storage),
  sqsAndIdleReceives: (maxJobs * 3 + maximumTasks * minutes * 60 / 20) * r.sqs,
  vectorQueries: maxJobs * (r.vectorQuery + 15 * 3072 / 1e9 * r.vectorProcessed),
  logIngestionAssuming8KiBPerJob: maxJobs * 8192 / 1e9 * r.logIngest,
  metricReadsAssumingTwentyMetricsEachMinute: 20 * minutes * r.metricRead,
};
const result = {
  createdAt: new Date().toISOString(), status: 'PROPOSED_NOT_EXECUTED', policyChanges: [],
  observed: { ...timing, receivedToCompletedMeanSeconds: meanWorkerSeconds,
    receiveToLastCompletionSeconds: (Math.max(...ends.map(e=>e.timestamp))-Math.min(...starts.map(e=>e.timestamp)))/1000,
    peakObservedVisible: Math.max(...observations.samples.map(s=>Number(s.queues.recognition.ApproximateNumberOfMessages))) },
  targetReasoning: { formula: 'acceptable queue delay / average processing time', currentTarget: 3,
    currentImpliedQueueSeconds: 3 * processingSeconds, illustrativeFiveSecondTarget: Math.floor(5 / processingSeconds),
    caution: 'No queue-delay SLO has been specified. Retain target 3. Processing excludes receive/get/claim overhead; this is a planning approximation, not a latency guarantee.' },
  proposal: { maximumJobs: maxJobs, operation: 'recognise', museumId: 'met', image: 'mobile/assets/water-lilies.jpg',
    maximumStartsPerSecond: rate, maximumConcurrentSubmissions: 5, maximumSubmissionSeconds: maxJobs / rate,
    maximumObservationMinutesFromFirstSubmission: minutes, maximumTasks, cpuUnitsPerTask: 512, memoryMiBPerTask: 2048,
    stopEarly: 'At least two healthy running workers with successful jobs on distinct task streams and a scaling activity explaining the increase.',
    noScaleOutApproximationAt180Seconds: (rate - 1 / processingSeconds) * 180,
    noScaleOutApproximationAt300Seconds: (rate - 1 / processingSeconds) * 300,
    caveat: 'Projections assume warm serial throughput and successful paced uploads; capacity, alarm latency and cold starts remain uncertain. Never extend the cap automatically.' },
  cost: { currency: 'USD', source: `${prior}/cost-model.json`, priceRetrievedAt: pricing.createdAt,
    perTaskHourlyComputeAndIPv4: perTaskHourly, lines,
    modelledTotal: Object.values(lines).reduce((a,b)=>a+b,0),
    incrementalComputeAndIPv4AboveOneTask: 3 * minutes / 60 * perTaskHourly,
    planningAllowance: .50, allowanceIsNotEnforcedBillingCap: true,
    imageUploadBytes: maxJobs * 372985,
    exclusions: ['Tax, discounts and credits', 'Retries beyond assumptions', 'Existing baseline infrastructure/storage charges',
      'Enhanced Container Insights observations and additional performance logs', 'Data transfer where applicable', 'Runtime after the observation window'],
    note: 'All-four-task whole-window scenario is conservative for compute, not an upper bound on the complete AWS bill. No Bedrock calls planned.' },
  evidenceStatus: { policyConfigured: 'PASS', F14QueueBacklogObserved: 'PASS_DIRECT_SQS_OBSERVATION',
    highAlarmTriggered: 'NO', desiredCountIncreased: 'NO', F15RunningCountIncreased: 'NOT_DEMONSTRATED',
    F16ScaledBackDown: 'NOT_DEMONSTRATED', originalJobSuccess: '30/30', newJobsSubmitted: 0 },
};
await writeFile(`${dir}/experiment-proposal.json`, JSON.stringify(result, null, 2));
const data = (await read(`${dir}/original-metric-math.json`)).value.MetricDataResults;
const timestamps = [...new Set(data.flatMap(m => m.Timestamps))].sort();
const rows = timestamps.map(t => [new Date(t).toISOString(), ...data.map(m => {
  const i = m.Timestamps.indexOf(t); return i < 0 ? '' : m.Values[i];
})].join(','));
await writeFile(`${dir}/original-minute-metrics.csv`, ['timestampUTC,' + data.map(m=>m.Id).join(','), ...rows].join('\n') + '\n');
console.log(JSON.stringify({ status: result.status, observed: result.observed, target: result.targetReasoning,
  estimatedUsd: result.cost.modelledTotal, newJobsSubmitted: 0 }, null, 2));
