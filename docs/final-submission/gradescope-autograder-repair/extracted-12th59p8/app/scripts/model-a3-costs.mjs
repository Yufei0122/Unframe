// Planning assumptions, not measured traffic or an AWS bill. Uses saved public prices.
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'verification/2026-10-31/recognition-final';
const sources = {};
async function rate(service, usage, begin = '0') {
  const data = JSON.parse(await readFile(`${dir}/pricing/${service}.json`, 'utf8'));
  sources[service] = data.source;
  const matches = data.rates.filter(r => r.attributes.usagetype === usage && r.begin === begin);
  if (matches.length !== 1) throw new Error(`Ambiguous/missing rate: ${usage}`);
  return matches[0].usd;
}
const r = {
  cpu: await rate('AmazonECS', 'APS2-Fargate-vCPU-Hours:perCPU'), memory: await rate('AmazonECS', 'APS2-Fargate-GB-Hours'),
  api: await rate('AmazonApiGateway', 'APS2-ApiGatewayHttpRequest'), lambdaRequest: await rate('AWSLambda', 'APS2-Request'), lambdaCompute: await rate('AWSLambda', 'APS2-Lambda-GB-Second'),
  ddbRead: await rate('AmazonDynamoDB', 'APS2-ReadRequestUnits'), ddbWrite: await rate('AmazonDynamoDB', 'APS2-WriteRequestUnits'), ddbStorage: await rate('AmazonDynamoDB', 'APS2-TimedStorage-ByteHrs', '25'),
  s3Put: await rate('AmazonS3', 'APS2-Requests-Tier1'), s3Get: await rate('AmazonS3', 'APS2-Requests-Tier2'), s3Storage: await rate('AmazonS3', 'APS2-TimedStorage-ByteHrs'),
  sqs: await rate('AWSQueueService', 'APS2-Requests-Tier1'), ecr: await rate('AmazonECR', 'APS2-TimedStorage-ByteHrs'),
  vectorQuery: await rate('AmazonS3', 'APS2-Vectors-Request-Tier3'), vectorStorage: await rate('AmazonS3', 'APS2-Vectors-TimedStorage-ByteHrs'), vectorProcessed: await rate('AmazonS3', 'APS2-Vectors-Query-ProcessedBytes-Tier1'),
  bedrockInPerK: await rate('AmazonBedrock', 'APS2-google.gemma-3-12b-it-mantle-input-tokens-standard'), bedrockOutPerK: await rate('AmazonBedrock', 'APS2-google.gemma-3-12b-it-mantle-output-tokens-standard'),
  cfRequest: await rate('AmazonCloudFront', 'AU-Requests-Tier2-HTTPS'), cfGB: await rate('AmazonCloudFront', 'AU-DataTransfer-Out-Bytes'),
  logIngest: await rate('AmazonCloudWatch', 'APS2-DataProcessing-Bytes'), logStore: await rate('AmazonCloudWatch', 'APS2-TimedStorage-ByteHrs'), metric: await rate('AmazonCloudWatch', 'APS2-CW:MetricMonitorUsage'), alarm: await rate('AmazonCloudWatch', 'APS2-CW:AlarmMonitorUsage'), metricRead: await rate('AmazonCloudWatch', 'APS2-CW:GMD-Metrics'),
  ipv4: await rate('AmazonVPC', 'APS2-PublicIPv4:InUseAddress'),
};
const assumptions = { concurrentVisitors: 50, hours: 730, scanIntervalSeconds: 300, pollsPerJob: 5, lambdaMemoryGiB: .125, lambdaSeconds: .1,
  ddbWriteUnitsPerJob: 6, ddbReadUnitsPerJob: 6, resultBytes: 4096, resultRetentionDays: 1, imageBytes: 372985, imageRetentionSeconds: 60,
  sqsRequestsPerJob: 3, longPollSeconds: 20, ecrStoredGB: 5, frontendGB: .1, frontendSessionSeconds: 3600, frontendMBPerSession: 5, frontendRequestsPerSession: 20, assumedOriginHitRatio: .95,
  logsBytesPerJob: 8192, extraPerformanceLogsGB: 1, customMetricsBudget: 50, dashboards: 1, dashboardUsd: 3, alarms: 2, metricReads: 100000,
  optionalAnalyseFraction: .1, optionalAnalyseInputTokens: 1500, optionalAnalyseOutputTokens: 300, vectorBytes: 3072, referenceVectors: 15, noFreeTierCreditsTaxOrDiscounts: true };
const scenarios = [];
for (const [name, interval, tasks] of [['50 visitors, scan every five minutes', 300, 1], ['50 visitors, scan every minute (sensitivity)', 60, 2]]) {
  const a = assumptions, jobs = a.concurrentVisitors * a.hours * 3600 / interval, requests = jobs * (1 + a.pollsPerJob), sessions = a.concurrentVisitors * a.hours;
  const logGB = jobs * a.logsBytesPerJob / 1e9 + a.extraPerformanceLogsGB;
  const lines = {
    'API Gateway HTTP': requests * r.api,
    'Jobs Lambda': requests * (r.lambdaRequest + a.lambdaMemoryGiB * a.lambdaSeconds * r.lambdaCompute),
    DynamoDB: jobs * (a.ddbReadUnitsPerJob * r.ddbRead + a.ddbWriteUnitsPerJob * r.ddbWrite) + jobs / (a.hours / 24) * a.resultRetentionDays * a.resultBytes / 1e9 * r.ddbStorage,
    'S3 storage and requests': jobs * (r.s3Put + r.s3Get) + (a.frontendGB + jobs * a.imageBytes / 1e9 * a.imageRetentionSeconds / (a.hours * 3600)) * r.s3Storage + sessions * a.frontendRequestsPerSession * (1 - a.assumedOriginHitRatio) * r.s3Get,
    SQS: (jobs * a.sqsRequestsPerJob + tasks * a.hours * 3600 / a.longPollSeconds) * r.sqs,
    'ECS Fargate': tasks * a.hours * (.5 * r.cpu + 2 * r.memory),
    'ECR storage': a.ecrStoredGB * r.ecr,
    'S3 Vectors': jobs * (r.vectorQuery + a.vectorBytes * a.referenceVectors / 1e9 * r.vectorProcessed) + a.vectorBytes * a.referenceVectors / 1e9 * r.vectorStorage,
    CloudFront: sessions * (a.frontendMBPerSession / 1000 * r.cfGB + a.frontendRequestsPerSession * r.cfRequest),
    CloudWatch: logGB * (r.logIngest + r.logStore) + a.customMetricsBudget * r.metric + a.dashboards * a.dashboardUsd + a.alarms * r.alarm + a.metricReads * r.metricRead,
    'Public IPv4': tasks * a.hours * r.ipv4,
  };
  const optionalBedrock = jobs * a.optionalAnalyseFraction * (a.optionalAnalyseInputTokens / 1000 * r.bedrockInPerK + a.optionalAnalyseOutputTokens / 1000 * r.bedrockOutPerK);
  scenarios.push({ name, jobs, apiRequests: requests, tasksAssumed: tasks, arrivalJobsPerSecond: jobs / (a.hours * 3600), lines, totalRecognitionUsd: Object.values(lines).reduce((a, b) => a + b, 0), optionalBedrockUsd: optionalBedrock });
}
const output = { createdAt: new Date().toISOString(), currency: 'USD', assumptions, rates: r, sources,
  dashboardSource: 'https://docs.aws.amazon.com/solutions/latest/distributed-load-testing-on-aws/cost.html', scenarios,
  boundedTestComputePlusIPv4UpperScenarioUsd: 4 * .5 * (.5 * r.cpu + 2 * r.memory + r.ipv4),
  limitations: ['Not measured 50-user capacity; task counts are scenario assumptions, not autoscaling proof.', 'ECR storage and custom metric cardinality are budget assumptions, not billed usage.', 'Gemma token counts are assumptions including image input; no usage tokens retained by current logs.', 'API response data transfer, NAT if later introduced, enhanced Container Insights observation charging, Logs Insights queries, retrieval, retries and long-term log growth require separate additions where applicable.', 'Public AWS Calculator share link must be created by the student; use these exact inputs and Sydney.'] };
await writeFile(`${dir}/cost-model.json`, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ scenarios: scenarios.map(s => ({ name: s.name, recognitionUsd: s.totalRecognitionUsd, optionalBedrockUsd: s.optionalBedrockUsd })), boundedTestComputePlusIPv4UpperScenarioUsd: output.boundedTestComputePlusIPv4UpperScenarioUsd }));
