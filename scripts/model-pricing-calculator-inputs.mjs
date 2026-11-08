// Local arithmetic only. Reads captured prices/evidence; makes no AWS calls.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'verification/2026-10-31/pricing-calculator', GiB = 2 ** 30;
const read = async name => JSON.parse(await readFile(`${dir}/${name}.json`, 'utf8'));
const sources = {}, rates = {};
async function rate(key, service, usage, begin = '0') {
  const p = await read(`prices/${service}`), m = p.rates.filter(r => r.attributes.usagetype === usage && r.begin === begin);
  assert.equal(m.length, 1, `${service}/${usage}`);
  rates[key] = m[0].usd; sources[key] = { source: p.source, retrievedAt: p.retrievedAt, sku: m[0].sku, unit: m[0].unit, usage, begin };
}
for (const args of [
  ['cpu','AmazonECS','APS2-Fargate-vCPU-Hours:perCPU'], ['memory','AmazonECS','APS2-Fargate-GB-Hours'], ['ipv4','AmazonVPC','APS2-PublicIPv4:InUseAddress'],
  ['api','AmazonApiGateway','APS2-ApiGatewayHttpRequest'], ['lambdaRequest','AWSLambda','APS2-Request'], ['lambdaGBs','AWSLambda','APS2-Lambda-GB-Second'],
  ['read','AmazonDynamoDB','APS2-ReadRequestUnits'], ['write','AmazonDynamoDB','APS2-WriteRequestUnits'], ['ddbStorage','AmazonDynamoDB','APS2-TimedStorage-ByteHrs','25'],
  ['s3Put','AmazonS3','APS2-Requests-Tier1'], ['s3Get','AmazonS3','APS2-Requests-Tier2'], ['s3Storage','AmazonS3','APS2-TimedStorage-ByteHrs'],
  ['sqs','AWSQueueService','APS2-Requests-Tier1'], ['ecr','AmazonECR','APS2-TimedStorage-ByteHrs'],
  ['vectorQuery','AmazonS3','APS2-Vectors-Request-Tier3'], ['vectorStore','AmazonS3','APS2-Vectors-TimedStorage-ByteHrs'], ['vectorProcess','AmazonS3','APS2-Vectors-Query-ProcessedBytes-Tier1'],
  ['vectorControl','AmazonS3','APS2-Vectors-Request-Tier2'],
  ['gemmaInputPerK','AmazonBedrock','APS2-google.gemma-3-12b-it-mantle-input-tokens-standard'], ['gemmaOutputPerK','AmazonBedrock','APS2-google.gemma-3-12b-it-mantle-output-tokens-standard'],
  ['cfGB','AmazonCloudFront','EU-DataTransfer-Out-Bytes'], ['cfRequest','AmazonCloudFront','EU-Requests-Tier2-HTTPS'],
  ['logIngest','AmazonCloudWatch','APS2-DataProcessing-Bytes'], ['logStorage','AmazonCloudWatch','APS2-TimedStorage-ByteHrs'], ['metric','AmazonCloudWatch','APS2-CW:MetricMonitorUsage'], ['alarm','AmazonCloudWatch','APS2-CW:AlarmMonitorUsage'], ['metricRead','AmazonCloudWatch','APS2-CW:GMD-Metrics'], ['dashboard','CloudWatchDashboards','DashboardsUsageHour-Basic'],
  ['internetGB','AWSDataTransfer','APS2-DataTransfer-Out-Bytes'], ['guardduty','AmazonGuardDuty','APS2-PaidFargatevCPUMonitored'],
  ['inspectorInitial','AmazonInspectorV2','APS2-container-image-initial-scan'], ['inspectorRescan','AmazonInspectorV2','APS2-container-image-re-scan'],
  ['inspectorLambdaStandard','AmazonInspectorV2','APS2-Lambda-Standard-Scanning'], ['inspectorLambdaCode','AmazonInspectorV2','APS2-Lambda-Code-Scanning'],
]) await rate(...args);
const verdict = JSON.parse(await readFile('verification/2026-10-31/scaling-max-three/run-01/F14-F16-verdict.json','utf8'));
const observedExtraHours = verdict.estimatedCost.extraComputeAndIPv4AboveOneTask / (.5 * rates.cpu + 2 * rates.memory + rates.ipv4);
const assumptions = {
  hoursPerMonth: 730, concurrentVisitors: 50, scanIntervalSeconds: 300,
  optionalExtraAnalyseFraction: .1, pollsPerJob: 6, corsPreflightsPerApplicationRequest: 1,
  lambdaMemoryGiB: .125, lambdaBilledSeconds: .1,
  successfulWriteUnitsPerJob: 6, readItemMaxKiB: 4, storedItemBytesBudget: 4096,
  ttlDays: 1, ttlDeletionLagDaysBudget: 2, imageBytes: 372985, averageImageResidenceSeconds: 120,
  imageUploadPreflightsPerJob: 1, frontendSessionHours: 1, frontendMiBPerSession: 5, frontendRequestsPerSession: 20,
  frontendOriginMissFraction: .05, ecrGiBBudget: 4, workerLogBytesPerJobBudget: 1024,
  lambdaLogBytesPerInvocationBudget: 1024, ciMonthlyIngestGiBBudget: .25, ciRetentionDays: 1,
  paidUnframeMetrics: 24, sharedClusterMetrics: 13, sharedClusterAllocationFraction: .25,
  dashboardCount: 1, metricAlarmCount: 2, underlyingMetricsPerAlarm: 2, metricReadsPerMonth: 100000,
  gemmaInputTokensPerCall: 1500, gemmaOutputTokensPerCall: 300,
  recognitionSeconds: verdict.processing.meanMs / 1000, analyseSecondsSingleObservedSample: 4.234,
  expectedBurstsPerMonthBudget: 30, extraStartsPerBurst: 2, pullAndStopMinutesPerExtraStartBudget: 3,
  apiMeanResponseBytesBudget: 2048, additionalExternalWorkerEgressGiBBudget: 1,
  inspectorInitialScansForecast: 0, inspectorRescansBudget: 150,
  vectorGetIndexRequestsBudget: 61,
  notes: ['Forecast assumptions are not measured visitor behaviour.', 'No account-wide free-tier allocation, tax, credits, discounts or retry allowance deducted.', 'GuardDuty is a conditional allocation; detector access denied.', 'No evidence of a flat-rate CloudFront subscription; PAYG working assumption, CLI cannot read subscription API.'],
};
const A = assumptions, r = rates;
const baselineHours = A.hoursPerMonth, expectedExtraHours = A.expectedBurstsPerMonthBudget * (observedExtraHours + A.extraStartsPerBurst * A.pullAndStopMinutesPerExtraStartBudget / 60);
const fargate = [ ['Baseline', baselineHours], ['Expected budget', baselineHours + expectedExtraHours], ['Peak ceiling', baselineHours * 3] ].map(([name, taskHours]) => ({ name, taskHours, vCPUHours: .5 * taskHours, memoryGiBHours: 2 * taskHours, computeUsd: taskHours * (.5 * r.cpu + 2 * r.memory), ipv4Usd: taskHours * r.ipv4, conditionalGuardDutyUsd: .5 * taskHours / 730 * r.guardduty }));
const vectors = (await read('vector-sizes')).value;
const vectorStorageBytes = vectors.rows.reduce((s,x) => s+x.keyBytes+x.vectorBytes+x.metadataUtf8Bytes,0);
const vectorProcessedBytes = vectors.rows.reduce((s,x) => s+x.keyBytes+x.vectorBytes+x.filterableUtf8Bytes,0);
const webBytes = (await read('a3-n12281212-unframe-web-object-sizes')).value.bytes;
const imageExistingBytes = (await read('a3-n12281212-unframe-job-images-object-sizes')).value.bytes;
function scenario(analysisFraction = .1, interval = 300, hours = 730, polls = 6, taskHours = fargate[1].taskHours) {
  const recognitionJobs = A.concurrentVisitors * hours * 3600 / interval;
  const analyseJobs = recognitionJobs * analysisFraction, jobs = recognitionJobs + analyseJobs;
  const gets = jobs * polls, options = (jobs + gets) * A.corsPreflightsPerApplicationRequest;
  const invocations = jobs + gets + options, readUnits = gets + jobs, writeUnits = jobs * A.successfulWriteUnitsPerJob;
  const busySeconds = recognitionJobs * A.recognitionSeconds + analyseJobs * A.analyseSecondsSingleObservedSample;
  const emptyReceives = Math.ceil(Math.max(0, taskHours * 3600 - busySeconds) / 20);
  const sessions = A.concurrentVisitors * hours / A.frontendSessionHours;
  const cfRequests = sessions * A.frontendRequestsPerSession, cfGiB = sessions * A.frontendMiBPerSession / 1024;
  const s3Put = jobs, s3GetAndOther = jobs * (1 + A.imageUploadPreflightsPerJob) + cfRequests * A.frontendOriginMissFraction;
  const imageAverageGiB = jobs * A.imageBytes / GiB * A.averageImageResidenceSeconds / (730 * 3600);
  const s3GiB = imageAverageGiB + webBytes / GiB + imageExistingBytes / GiB;
  const ddbGiB = jobs / (730 / 24) * (A.ttlDays + A.ttlDeletionLagDaysBudget) * A.storedItemBytesBudget / GiB;
  const appLogGiB = (jobs * A.workerLogBytesPerJobBudget + invocations * A.lambdaLogBytesPerInvocationBudget) / GiB;
  const logsIngestGiB = appLogGiB + A.ciMonthlyIngestGiBBudget;
  const logsStoreGiBMonth1Budget = appLogGiB + A.ciMonthlyIngestGiBBudget * A.ciRetentionDays / (730/24);
  const metricMonths = A.paidUnframeMetrics + A.sharedClusterMetrics * A.sharedClusterAllocationFraction;
  const apiEgressGiB = invocations * A.apiMeanResponseBytesBudget / GiB;
  const inputTokens = analyseJobs * A.gemmaInputTokensPerCall, outputTokens = analyseJobs * A.gemmaOutputTokensPerCall;
  const inputs = { recognitionJobs, analyseJobs, jobs, gets, options, invocations, lambdaGBSeconds: invocations*.125*.1, readUnits, writeUnits, actualWriteOperations: jobs*3,
    busyTaskHours: busySeconds/3600, taskHours, emptyReceives, sqsRequests: jobs*3+emptyReceives,
    sessions, cfRequests, cfGiB, s3Put, s3GetAndOther, s3GiB, imageAverageGiB, ddbGiB,
    appLogGiB, logsIngestGiB, logsStoreGiBMonth1Budget, metricMonths, apiEgressGiB, inputTokens, outputTokens,
    vectorQueries: jobs, vectorStorageGiB: vectorStorageBytes/GiB, vectorProcessedGiB: vectorProcessedBytes/GiB*jobs };
  const costs = {
    'ECS Fargate': taskHours*(.5*r.cpu+2*r.memory), 'Public IPv4': taskHours*r.ipv4,
    'API Gateway HTTP': invocations*r.api, 'Jobs Lambda': invocations*r.lambdaRequest+inputs.lambdaGBSeconds*r.lambdaGBs,
    'DynamoDB': readUnits*r.read+writeUnits*r.write+ddbGiB*r.ddbStorage,
    'S3 Standard': s3Put*r.s3Put+s3GetAndOther*r.s3Get+s3GiB*r.s3Storage,
    'SQS Standard': inputs.sqsRequests*r.sqs, 'ECR': A.ecrGiBBudget*r.ecr,
    'CloudFront PAYG': cfGiB*r.cfGB+cfRequests*r.cfRequest,
    'CloudWatch': logsIngestGiB*r.logIngest+logsStoreGiBMonth1Budget*r.logStorage+metricMonths*r.metric+A.dashboardCount*r.dashboard+A.metricAlarmCount*A.underlyingMetricsPerAlarm*r.alarm+A.metricReadsPerMonth*r.metricRead,
    'API + external worker transfer': (apiEgressGiB+A.additionalExternalWorkerEgressGiBBudget)*r.internetGB,
    'S3 Vectors supplemental': jobs*r.vectorQuery+inputs.vectorProcessedGiB*r.vectorProcess+inputs.vectorStorageGiB*r.vectorStore+A.vectorGetIndexRequestsBudget*r.vectorControl,
    'Gemma supplemental': inputTokens/1000*r.gemmaInputPerK+outputTokens/1000*r.gemmaOutputPerK,
    'GuardDuty conditional allocation': .5*taskHours/730*r.guardduty,
    'Inspector ECR rescan allowance': A.inspectorInitialScansForecast*r.inspectorInitial + A.inspectorRescansBudget*r.inspectorRescan,
  };
  return { inputs, costs, grossMonthlyUsd: Object.values(costs).reduce((a,b)=>a+b,0) };
}
const expected = scenario(), recognitionOnly = scenario(0);
const sensitivities = { polls2: scenario(.1,300,730,2), polls60: scenario(.1,300,730,60), scansEveryMinute: scenario(.1,60), active240Hours: scenario(.1,300,240), constantThreeTasks: scenario(.1,300,730,6,2190) };
assert.equal(expected.inputs.jobs,481800); assert.equal(expected.inputs.invocations,6745200);
assert.equal(expected.inputs.readUnits,3372600); assert.equal(expected.inputs.writeUnits,2890800);
assert.equal(vectors.count,15); assert.equal(vectorStorageBytes,37087); assert.equal(vectorProcessedBytes,34882);
const result = { generatedAt:new Date().toISOString(), currency:'USD', assumptions:A, rates:r, sources, observedExtraHours, expectedExtraHours, fargate, expected, recognitionOnly, sensitivities };
await writeFile(`${dir}/calculator-model.json`,JSON.stringify(result,null,2));
// Preserve error category/action but strip account session emails from diagnostics.
for(const f of await readdir(dir)){ if(!f.endsWith('.json'))continue;const path=`${dir}/${f}`, raw=await readFile(path,'utf8'); const sanitized=raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[session-redacted]');if(sanitized!==raw)await writeFile(path,sanitized); }
console.log(JSON.stringify({fargate,expected,recognitionOnlyUsd:recognitionOnly.grossMonthlyUsd,sensitivities:Object.fromEntries(Object.entries(sensitivities).map(([k,v])=>[k,{usd:v.grossMonthlyUsd,jobs:v.inputs.jobs,busyTaskHours:v.inputs.busyTaskHours}]))},null,2));
