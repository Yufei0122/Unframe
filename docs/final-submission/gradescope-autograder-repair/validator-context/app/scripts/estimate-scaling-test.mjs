import { writeFile } from 'node:fs/promises';
const source = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-2/index.json';
const response = await fetch(source);
if (!response.ok) throw new Error('Public pricing unavailable');
const offer = await response.json();
const rates = [];
for (const product of Object.values(offer.products)) {
  const usage = product.attributes?.usagetype || '';
  if (!/^APS2-Fargate-(vCPU-Hours:perCPU|GB-Hours)$/.test(usage)) continue;
  for (const term of Object.values(offer.terms.OnDemand[product.sku] || {})) for (const dimension of Object.values(term.priceDimensions)) {
    rates.push({ sku: product.sku, usage, description: dimension.description, unit: dimension.unit, usd: Number(dimension.pricePerUnit.USD), effectiveDate: term.effectiveDate });
  }
}
if (rates.length !== 2) throw new Error('Unexpected rate set; do not guess prices');
const cpu = rates.find(r => r.usage.includes('vCPU')).usd, memory = rates.find(r => r.usage.includes('GB')).usd;
const taskHourly = .5 * cpu + 2 * memory;
const evidence = { retrievedAt: new Date().toISOString(), source, publicationDate: offer.publicationDate, rates,
  assumptions: { cpu: .5, memoryGiB: 2, maximumTasks: 4, observationMinutes: 30, publicIPv4PerTask: 1, publicIPv4HourlyUsd: .005,
    ipv4Source: 'https://aws.amazon.com/vpc/pricing/', noDiscountsOrTax: true, loadJobs: 30, concurrency: 5, imageBytes: 372985 },
  taskHourlyComputeUsd: taskHourly, fourTasksThirtyMinutesComputeUsd: taskHourly * 4 * .5,
  fourTasksThirtyMinutesComputeAndIPv4Usd: (taskHourly + .005) * 4 * .5,
  incrementalThreeTasksThirtyMinutesComputeAndIPv4Usd: (taskHourly + .005) * 3 * .5,
  excluded: ['S3 requests/storage', 'SQS requests', 'DynamoDB', 'S3 Vectors queries', 'API Gateway/Lambda', 'CloudWatch/Container Insights', 'data transfer where applicable', 'ECR storage', 'runtime beyond assumed 30 minutes'],
  note: 'Illustrative compute/network-address estimate, not a total bill or spending cap. No load test executed.' };
await writeFile('verification/2026-10-31/bedrock-followup/cost-estimate.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
