// Public AWS price lists only: no credentials, cloud mutations or account billing reads.
import { mkdir, writeFile } from 'node:fs/promises';
const dir = process.argv[2] || 'verification/2026-10-31/recognition-final/pricing';
await mkdir(dir, { recursive: true });
const services = ['AmazonECS', 'AmazonApiGateway', 'AWSLambda', 'AmazonDynamoDB', 'AmazonS3', 'AWSQueueService', 'AmazonECR', 'AmazonCloudWatch', 'AmazonVPC', 'AmazonBedrock', 'AmazonCloudFront', 'AmazonGuardDuty', 'AWSDataTransfer', 'AmazonInspectorV2'];
await Promise.all(services.map(async service => {
  const source = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/${['AmazonCloudFront', 'AWSDataTransfer'].includes(service) ? '' : 'ap-southeast-2/'}index.json`;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const offer = await response.json(), rates = [];
    for (const product of Object.values(offer.products)) {
      const a = product.attributes, text = JSON.stringify(a);
      if (service === 'AmazonECS' && !/Fargate-(vCPU-Hours:perCPU|GB-Hours)/.test(text)) continue;
      if (service === 'AWSLambda' && !/Lambda-GB-Second|Request/.test(text)) continue;
      if (service === 'AmazonBedrock' && !/gemma.*12b/i.test(text)) continue;
      if (service === 'AmazonVPC' && !/PublicIPv4/.test(text)) continue;
      if (service === 'AmazonCloudFront' && !/Australia|United States|Europe|Global/.test(text)) continue;
      if (service === 'AmazonGuardDuty' && !/Fargate|Runtime/i.test(text)) continue;
      if (service === 'AWSDataTransfer' && !(a.fromLocation === 'Asia Pacific (Sydney)' && a.toLocation === 'External')) continue;
      for (const term of Object.values(offer.terms.OnDemand[product.sku] || {})) for (const dimension of Object.values(term.priceDimensions)) {
        rates.push({ sku: product.sku, attributes: a, description: dimension.description, unit: dimension.unit, begin: dimension.beginRange, end: dimension.endRange, usd: Number(dimension.pricePerUnit.USD), effectiveDate: term.effectiveDate });
      }
    }
    await writeFile(`${dir}/${service}.json`, JSON.stringify({ source, retrievedAt: new Date().toISOString(), publicationDate: offer.publicationDate, rates }, null, 2));
    console.log(JSON.stringify({ service, rates: rates.length }));
  } catch (error) { await writeFile(`${dir}/${service}.json`, JSON.stringify({ source, error: error.message })); console.log(JSON.stringify({ service, error: error.message })); }
}));
