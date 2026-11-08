# Cost and sustainability evidence

Prepared 2026-11-01. USD, monthly, before tax. **Forecasts are not an AWS bill or measured 50-user capacity.** Rate snapshots retrieved 2026-10-31; see source table below. The latest [pricing-input worksheet](../a3-pricing-calculator-inputs.md) supersedes [the older worksheet](../a3-cost-and-sustainability.md) where they differ. Do not mix the older four-task/Australian-edge/omitted-preflight assumptions into the new total.

## Actual Calculator export found

- Original: `D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\a86ca30d-a6c7-48f0-a909-28baa0981bb1.pdf`.
- [Unchanged PDF copy](evidence/cost/calculator-export-2026-10-31.pdf), [extracted text](evidence/cost/calculator-extracted-text.txt), [extraction provenance](evidence/cost/calculator-extraction-provenance.json).
- Export date **2026-10-31**; displayed upfront $0.00, **monthly $34.69**, 12 months $416.28. This is a real but **incomplete** estimate, not the full deployment cost.
- [Actual public share URL embedded in PDF](https://calculator.aws/#/estimate?utm_source=chatgpt.com&id=6eed2c7b3d08e7143dc00887ac10327a127ca7e8). This was extracted, not invented. Automated web retrieval returned only the JavaScript shell; public accessibility and current contents still need a student browser check. Share again after correcting the estimate and record the final URL/export date.
- PDF literal text and link annotations were extracted; page layout was not rendered here. Review the original PDF visually before inserting screenshots. No Calculator fields or saved estimates were changed.

| Actual exported line | Monthly USD | Reconciliation needed |
| --- | ---: | --- |
| AWS Lambda | 1.15 | 6,745,200 requests shown; memory/duration/free-tier details not fully visible in export. Compare gross 2.754293. Difference is consistent with allowances but not independently proven from PDF. |
| DynamoDB | 2.58 | Storage 0.181274414 GB and average item 2 KB shown. Verify read/write unit totals; measured successful item was 2921 bytes, forecast storage/write budget 4 KiB. |
| S3 including S3 Vectors | 4.39 | **Already includes vectors**:15 vectors, 512 dimensions, 481800 queries, filterable/nonfilterable metadata. Do not add a second 1.304589 vector charge. |
| SQS | 0.62 | 1.559509 million standard requests matches worksheet. |
| ECR | 0.40 | 4 GB storage budget. |
| CloudFront | 16.03 |178.22265625 GB and 730000 HTTPS; approximately current-class conservative European edge rate. PDF's Sydney heading is not proof of Australian edge delivery. |
| CloudWatch | 6.22 | Logs/dashboard/4 alarm metrics/100000 metric reads listed; 27.25 paid metric-months and retained logs not explicit. Check omitted metric/storage inputs and free-tier treatment. |
| Data transfer | 1.60 |14 GB rounds up worksheet 13.865448 GB. |
| GuardDuty | 1.70 | Approximately 1 vCPU-month; worksheet expected weighted 0.515191806 vCPU-month costs 0.875825. Coverage is conditional; do not claim detector settings verified. |
| **Total shown** | **34.69** | Missing Fargate, public IPv4, API Gateway, Gemma, Inspector; other lines need review. |

Adding only the absent expected lines would give approximately **$84.933607**, but this still mixes assumptions/free-tier treatments and is **not a reconciled final total**. The consistent gross model below is $97.070907; explain the reconciliation instead of claiming the PDF already supports that total.

## Monthly scenario: explicit forecast, not measured behaviour

- Average 50 concurrent visitors, 730 hours/month, each scanning once/300 seconds: `50 * 730 * 3600 / 300 = 438000` recognition jobs. Not 50 simultaneous uploads per second.
- Optional **extra** Analyse job after 10% of scans:43800 additional jobs; 481800 total. All these Analyse jobs assumed to require Bedrock; actual catalogue shortcuts would reduce calls.
- Six status GETs/job, one POST, one OPTIONS per application request budget: `481800 * (1+6) * 2 = 6745200` HTTP API/Lambda invocations. Actual code polls every 1500 ms until terminal status; six is not a cap. Original load generator made creates but monitored DynamoDB, so it did not measure browser polling charges.
- Lambda 128 MiB, 100 ms billed forecast:84315 GB-seconds. Measured mean billed 59.414 ms in 883 create-only requests is not a representative GET/OPTIONS average.
- DynamoDB 3372600 strong read units; 2890800 write units; 0.181274414 GB storage budget including TTL lag. Counts are units, not raw operation counts; 1445400 successful writes expected.
- SQS 1559509 requests:3/job plus 114109 idle receives. Event message measured 864 bytes; no image payload in SQS. Retries/ChangeMessageVisibility would add requests.
- S3:481800 PUTs; 1000100 GET/other requests, including upload preflight allowance and 36500 origin misses. Average 372985-byte image and 120 s residence assumed from the reference fixture, not visitor distribution. Average total storage 0.021627234 GB. Deletes free; successful-job cleanup does not mean zero in-flight storage.
- 36500 one-hour frontend sessions; 5 MiB/session and 20 HTTPS requests/session =>178.22265625 GB and 730000 requests. 95% cache-hit forecast =>36500 origin GETs. Stored frontend size 13,345,406 bytes does not equal each session's transfer.
- ECR 4 GiB budget vs 3.61745 GiB measured deduplicated content. CloudWatch 7.142204285 GB ingestion, 6.900423463 GB first-month storage budget, 27.25 metric-months, 1 dashboard, 4 standard alarm metrics, 100000 metric reads. Long-term storage grows because application logs have no expiry.
- Bedrock tokens:1500 input/300 output per call assumed, including image-token budget; not available in safe per-job logs. Shared-account model token metrics cannot establish Unframe usage.
- All other regional services remain Sydney in both geographic scenarios. This does not create a New York replica or move the API.

## Scenario A: current deployed CloudFront

Observed **PriceClass_100**, static origin only. Gross working estimate uses 100% Europe allocation within the permitted price class as a conservative rate assumption:178.22265625 GB*$0.085 +730000*$0.0000012 =$16.02492578125. This is **not measured viewer/edge geography**. US-only at the same data volume is $15.87892578125. Account plan subscription status was not readable; PAYG is the documented working assumption, not an assertion that a flat-rate subscription was conclusively excluded.

| Service / allocation | Expected monthly USD, gross |
| --- | ---: |
| ECS Fargate | 26.266095 |
| Public IPv4 | 3.760896 |
| API Gateway HTTP | 8.701308 |
| Jobs Lambda | 2.754293 |
| DynamoDB | 2.584727 |
| S3 Standard | 3.090485 |
| SQS Standard | 0.623804 |
| ECR | 0.400000 |
| CloudFront PAYG | 16.024926 |
| CloudWatch | 17.587991 |
| API + external worker transfer | 1.580661 |
| S3 Vectors supplemental | 1.304589 |
| Gemma supplemental | 10.015308 |
| GuardDuty conditional allocation | 0.875825 |
| Inspector ECR rescan allowance | 1.500000 |
| **Total** | **97.070907** |

The recognition-only alternative, without 43800 extra Analyse jobs and their downstream requests, is **$84.758820/month**. It is not simply the mixed total minus Gemma tokens. Shared-account free tiers, credits, tax and discounts are not allocated in these gross figures; the public Calculator may apply allowances. Explain any difference rather than inflate usage to force agreement.

## Scenario B: 50% New York / 50% Brisbane

Keep visitor counts, jobs, API location and total frontend traffic constant. Each viewer population accounts for 89.111328125 GB and 365000 HTTPS requests/month. Viewer location does not by itself select a CloudFront billable edge region.

| Interpretation | CF allocation / monthly USD | Whole mixed model USD | Status |
| --- | --- | ---: | --- |
| B1: actual PriceClass_100 unchanged | Same US/Europe range $15.878926 to $16.024926; illustrative 50% US/50% Europe =$15.951926 |96.924907 to 97.070907; illustrative 96.997907 | Closest to actual deployment; serving region distribution unmeasured. Do not assign Australian edge charges just because a visitor is in Brisbane. |
| B2: geographic-service alternative | Assume local US/Australian delivery:89.111328125*$0.085 +89.111328125*$0.114 +365000*$0.000001 +365000*$0.00000125 = **$18.554404** | **99.600385** | Hypothetical suitable expanded price class/local-edge scenario, **not deployed or changed here**. Local routing remains an assumption. |

For the student's Scenario B Calculator, label which interpretation is used. If comparing proximity/service quality, B2 is the explicit alternative; do not present it as current PriceClass_100 billing. UI quantities: US 89.111328125 GB/365000 HTTPS, Australia 89.111328125 GB/365000 HTTPS, all other inputs unchanged. Report $2.529479 more than Scenario A gross, without claiming a measured latency benefit.

## Fargate baseline, expected bursts and ceiling

Linux/x86_64, each task 0.5 vCPU/2 GiB, 20 GiB included ephemeral storage; one public IPv4 per task. Compute rate `0.5*$0.04856 + 2*$0.00532 = $0.03492/task-hour`; IPv4$0.005/hour. Billing includes image pull/startup/termination, not just inference.

| Scenario | Task-hours/month | Compute USD | Public IPv4 USD | Conditional GuardDuty USD |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 730.000000 | 25.491600 | 3.650000 | 0.850000 |
| Expected budget | 752.179133 | 26.266095 | 3.760896 | 0.875825 |
| Peak ceiling | 2190.000000 | 76.474800 | 10.950000 | 2.550000 |

Expected burst budget:30 replications/month of observed extra 0.639304444 task-hours, plus 2 extra starts*3 minutes each per burst for pull/stop allowance =>22.179133 extra task-hours. This is a cost budget, not a forecast established by one experiment. Peak 2190 task-hours means 3 tasks for all 730 hours, not an expected outcome or permission to run load.

Observed experiment sampled running-task hours 1.086125, extra over one-worker baseline 0.639304444. Estimated compute+IPv4$0.043358 total/$0.025521 incremental; provisioning/requests/logs additional. These are rate-based estimates, not Cost Explorer charges.

## Supplements and double counting

- **Gemma:**43800 calls*1500 input=65.7 million; 43800*300 output=13.14 million. Sydney standard input $0.0927/million + output $0.2987/million => **$10.015308**. Published units are per 1000 tokens:0.0000927/0.0002987. Do not accidentally multiply million-token rates by raw tokens. Model unchanged`google.gemma-3-12b-it`. Low 500/150 tokens gives $3.992589; high 5000/768 gives $30.349090. Image-token budget remains uncertain.
- **Inspector:**registry ENHANCED/CONTINUOUS_SCAN confirmed, per-project actual scan counts/coverage denied. Forecast 150 rescans*$0.01=$1.50/month; 0 new initial scans*$0.09=$0. No weekly rescan frequency is asserted as observed. If Lambda scanning is enabled, extra 730*$0.000417=$0.30441 standard and/or 730*$0.00084=$0.6132 code, excluded until confirmed.
- **S3 Vectors:**the real Calculator export now supports this line inside S3. Cross-check only:481800 queries*$2.70/million=$1.30086; processed 15.651944652 GB*$0.000004278; storage 0.000034539960 GB*$0.066; 61 GetIndex*$0.00006 => **$1.304589**. Do not add this supplement to the exported combined S3$4.39. No monthly reference re-upload forecast. OpenCLIP adds no Bedrock embedding charge.
- **GuardDuty:**runtime sidecar observed, detector config unreadable. Expected monitor allocation 0.5*752.179133/730*$1.70=$0.875825. Shared-account unrelated security charges excluded; this is a conditional project allocation.
- API Gateway+Lambda are different billed operations, not duplicates. S3 PUT uploads bypass both API Gateway and CloudFront; no upload ingress charge. Polls go direct to API, not CloudFront.
- S3 origin GET count is cache misses, not all 730000 viewer requests. Do not charge internet origin egress again on S3 to CloudFront delivery. API response egress and frontend CDN egress are distinct.
- Include IPv4 once in VPC/public address line; no Unframe ALB/NAT/interface-endpoint charge. Existing S3 gateway endpoint has no hourly processing charge.
- ECR layers deduplicated across tags; no fivefold tag multiplication. Shared Container Insights totals include Strobe; use allocated/project-only series, not all cluster cost. No Planning Lambda, Strobe-only resources, local Ollama, SageMaker GPU, Route 53, WAF or undeployed service fees.

## Sensitivity and sustainability facts

| Changed assumption, other model inputs held as defined | Monthly USD |
| --- | ---: |
| polls 2 | 86.83 |
| polls 60 | 235.35 |
| Scan every minute | 238.32 |
| Visitors active 240 hours/month; workers still run all month | 62.60 |
| 3 tasks always running | 156.25 |

- 60 polls/job is plausible during the observed approximately 88 s queue wait; original six-poll forecast underestimates such bursts. Review backoff/UX as future work; no polling code changed.
- One scan/minute scenario holds the same compute budget and implies substantially more occupancy; it is a cost sensitivity, not proven capacity or proof autoscaling would retain that budget.
- Min 1 retains a warm model and availability but costs compute/IP while idle. Three always-on tasks roughly triple allocated compute. Scale-in actually removed excess replicas; no measured carbon reduction is available.
- One model/process per worker, single-job concurrency and one thread avoid redundant model residency; CPU-only reference recognition avoids a remote vision call for each scan.
- Cache hits reduce repeated origin work; cleanup/TTL reduce storage/privacy exposure. Logging retention is an unresolved growth trade-off. Do not invent energy/kWh/CO2 or regional renewables figures.

## Manual Calculator completion checklist

1. Open the actual extracted share URL; confirm it loads without login. Save/export a working copy before changing estimate inputs. No AWS infrastructure action is involved.
2. Name Scenario A clearly. Add **Fargate** expected 752.179133 task-hours (or 730 baseline plus 60 extra task instances averaging 22.179133 minutes),0.5 vCPU/2 GB, Linux/x86,20 GB ephemeral. Do not add baseline twice.
3. Add **public IPv4** 752.179133 address-hours and **HTTP API** 6.7452 million monthly requests, Sydney. Verify API type is HTTP, not REST.
4. Review Lambda 128 MB, 100 ms, 6.7452 million calls and allowances. Review DynamoDB read/write **units**, strong consistency and stored-item budget.
5. Keep S3 Standard and **one** S3 Vectors entry. Confirm 481800 queries and 15 existing vectors. No duplicate supplemental vectors.
6. Review CloudWatch custom/paid metrics 27.25 month-equivalents, logs storage and ingestion, 1 dashboard, 4 alarm metrics and 100000 reads; don't price a whole shared Strobe cluster as Unframe.
7. Add Inspector 150 rescans (or document supplement); correct conditional GuardDuty weighted vCPU-months. Add Gemma tokens if the exact model is supported; otherwise include the explicit official-rate supplement beside the Calculator subtotal, never substituted silently.
8. Create Scenario B with the above geographic distinction; do not change the deployed distribution. Record net/free-tier vs gross treatment for each scenario.
9. Export final PDF/per-service table, take a readable summary screenshot, use Share, verify URL in a private browser, record retrieval date. The present $34.69 export is historical and incomplete; do not overwrite its evidence copy.

## Price provenance

The copied [model JSON](evidence/cost/calculator-model.json) includes formulas, unrounded figures and source metadata. [Raw price selections](evidence/cost/prices/) retain effective dates, SKUs, billing units and retrieval timestamps. Values below are **retrieved 2026-10-31**, not a claim that they were re-fetched on 1 November.

| Model rate key | Official price-list source / SKU | RetrievedUTC | Billing unit |
| --- | --- | --- | --- |
| cpu | [MMQG9GMCKV4JUBKW](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.171 Z | hours |
| memory | [RWBFR84TYF5JT44P](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.171 Z | hours |
| ipv 4 | [JZP2PURP9VVQ96GH](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.551 Z | Hrs |
| api | [GHZQQPU8NMGFKBQZ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonApiGateway/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.414 Z | Requests |
| lambdaRequest | [ZW6UHD4Q6EPUCZWU](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.920 Z | Request |
| lambdaGBs | [4NX7CSSF3DVPXWBT](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.920 Z | Lambda-GB-Second |
| read | [BQCZ4TYN2JVHEH4Z](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.549 Z | ReadRequestUnits |
| write | [X43FXEDHFRVHHYQR](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.549 Z | WriteRequestUnits |
| ddbStorage | [NF4X2QKU7Y7QVY5C](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonDynamoDB/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.549 Z | GB-Mo |
| s3 Put | [U4DFWUZRRJK76GFK](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | Requests |
| s3 Get | [ZE67FX933AEQ43H2](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | Requests |
| s3 Storage | [5QVJMK36NJC9G6DC](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | GB-Mo |
| sqs | [GZ4K2VVYZYCA2NTU](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSQueueService/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.434 Z | Requests |
| ecr | [YBDKSSGX2GMZ62JV](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECR/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.436 Z | GB-Mo |
| vectorQuery | [E28HMP8J53MB27GF](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | Requests |
| vectorStore | [WKY8F7BZWVBHGYXR](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | GB-Mo |
| vectorProcess | [7V674GPH6YS74FF9](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | GB |
| vectorControl | [J4KQBZJTRCYS58T8](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.908 Z | Requests |
| gemmaInputPerK | [PW8JCBBCXKP7TKW2](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.998 Z | 1 K tokens |
| gemmaOutputPerK | [FC2Q7XPBMWCE648U](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.998 Z | 1 K tokens |
| cfGB | [VU3485RNDU6HBQF6](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json) | 2026-10-31 T08:59:37.666 Z | GB |
| cfRequest | [YA5QZD7XG45UGHCH](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json) | 2026-10-31 T08:59:37.666 Z | Requests |
| logIngest | [VSJ57WXDQXM2VKQK](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.663 Z | GB |
| logStorage | [SXS5MH23MB3SHA9C](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.663 Z | GB-Mo |
| metric | [F52S8X9YS2XFUA7F](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.663 Z | Metrics |
| alarm | [9FZA8ZKS9CGQBUTK](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.663 Z | Alarms |
| metricRead | [BKZ9PF5VCHWQXQ2G](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.663 Z | Metrics |
| dashboard | [5P8PBB6MXV325TDC](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/index.json) | 2026-10-31 T08:54:57.766 Z | Dashboards |
| internetGB | [KRXM4TG87VW2NPHA](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/index.json) | 2026-10-31 T08:59:49.268 Z | GB |
| guardduty | [8W55KUBZST937JGV](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonGuardDuty/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:36.907 Z | vCPU-Months |
| inspectorInitial | [GBFN6EWQ7NJ249UF](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonInspectorV2/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.686 Z | Resource-assessment |
| inspectorRescan | [WRN2HAY37544E56E](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonInspectorV2/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.686 Z | Resource-assessment |
| inspectorLambdaStandard | [G7Y2QK7F83H9VNDQ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonInspectorV2/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.686 Z | Hourly |
| inspectorLambdaCode | [K249PV564CP5W2ZD](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonInspectorV2/current/ap-southeast-2/index.json) | 2026-10-31 T08:59:37.686 Z | Hourly |

External general references: [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/), [CloudFront PAYG](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/), [Inspector pricing](https://aws.amazon.com/inspector/pricing/). Use saved regional SKUs for the numeric calculations, not a different region's landing-page example.
