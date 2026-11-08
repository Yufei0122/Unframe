# CAB432 A3 Unframe — AWS Pricing Calculator inputs

Prepared **31 October 2026**, using read-only checks with profile `default`, account `901444280953`, region **Asia Pacific (Sydney), ap-southeast-2**. Currency: **USD**. No AWS resources, policies, deployments, jobs or queues were changed.

The recommended planning estimate is **US$97.07/month before account-wide free allowances, credits, tax and discounts**, for the explicitly assumed mixed workload below. Recognition only is **US$84.76/month**. These are reproducible engineering forecasts, not an AWS bill or a measured 50-user capacity claim. The totals include conditional GuardDuty allocation and an Inspector rescan allowance; other account-managed security allocations remain unverified.

The student should create the public Calculator estimate. **No public estimate or share link has been created.**

## 1. Evidence, currency and scope

Reviewed [the earlier cost worksheet](a3-cost-and-sustainability.md), [the final autoscaling report](a3-autoscaling-results.md), the latest recognition/cache evidence, the successful v5 Analyse evidence, and the implementation that generates chargeable requests. New sanitized read-only evidence and current price lists are in [verification/2026-10-31/pricing-calculator](../verification/2026-10-31/pricing-calculator/). All numeric forecasts, source URLs, SKUs and billing units are in [calculator-model.json](../verification/2026-10-31/pricing-calculator/calculator-model.json).

Evidence classes used throughout:

- **Observed:** deployment/configuration reads, closed-window metrics, successful job records and logs.
- **Code-derived:** request pattern implemented by the repository; not a measurement of visitor behaviour.
- **Forecast:** a declared input for a future month, including allowances for uncertainty.

The new worksheet supersedes the earlier worksheet's inputs where they differ: maximum capacity is now **3**, CloudFront is **PriceClass_100**, frontend storage and ECR layers have been measured, CORS preflights are included, and real scaling and Lambda measurements are available. Earlier totals should not be combined with these totals.

### Currently used services and allocation boundary

| Service/resource | Actual role/configuration | Included cost boundary |
| --- | --- | --- |
| ECS/Fargate, `a3-n12281212-unframe-worker` | Cluster `n12281212-strobe-a2`; task definition revision 6, image v5; Linux/x86_64, 512 CPU, 2048 MiB; fresh read desired/running/pending 1/1/0 | Only Unframe tasks, never all four services in the shared cluster |
| Application Auto Scaling | Minimum 1, maximum 3; policy `unframe-sqs-backlog`, target 3, cooldowns 30/120 s | No separate service fee; underlying Fargate, metrics and alarms counted |
| ECR, `a3-n12281212-unframe-worker` | Retains v1–v5 and related manifests; enhanced continuous scanning enabled | Deduplicated image storage; Inspector scanning separately |
| Jobs Lambda, `a3-n12281212-unframe-jobs` | Node.js 22, x86_64, 128 MiB, timeout 3 s, 512 MiB ephemeral storage, no VPC configuration | Creates, status reads and routed OPTIONS; no provisioned concurrency assumed |
| HTTP API `4xfbhsso7a`, stage `prob` | `POST /a3/jobs`, `GET /a3/jobs/{jobId}`, OPTIONS for both, integrated with Jobs Lambda | A3 traffic only; exclude Strobe routes and aggregate shared-API traffic |
| DynamoDB, `a3-n12281212-unframe-jobs` | Standard on-demand table; TTL enabled; no GSI, stream or PITR enabled | Job operations and storage; no provisioned capacity, replicas, DAX or backup allocation |
| S3, `a3-n12281212-unframe-job-images` | Private temporary inputs; SSE-S3; versioning not enabled; one-day expiration for `uploads/` | Upload, read, preflight allowance and residence-weighted storage; successful jobs delete images |
| S3, `a3-n12281212-unframe-web` | Static frontend; SSE-S3; versioning not enabled; 68 current objects | Static storage and cache-miss origin requests |
| S3 Vectors, bucket/index `a3-n12281212-unframe-vectors` | 15 float32, 512D reference vectors; cosine; `sourceHash` and `imageHash` non-filterable | Vector query, logical storage and small control-request allowance; no reference reindexing |
| SQS Standard, `a3-n12281212-unframe-recognition` and `-dlq` | 20 s long polling; visibility 300 s; maxReceiveCount 5; SSE-SQS; source queue empty, DLQ retains 3 historical messages | Successful job sends/receives/deletes plus empty receives; no redrive experiment |
| CloudFront `E2CK5412ICFTJX` | Static S3 origin only; PriceClass_100; compression enabled; default TTL 300 s; no edge functions, WAF association or access logging | Static HTTPS delivery; no API jobs, uploads or status polls through CloudFront |
| Bedrock, `google.gemma-3-12b-it` | Optional real image Analyse via Converse; successful v5 verification | Standard on-demand input/output tokens; OpenCLIP is not a Bedrock embedding charge |
| CloudWatch | Worker/Lambda log groups; shared standard Container Insights; dashboard `a3-n12281212-unframe`; two metric-math alarms | Project logs/metrics, plus explicitly stated shared-cluster allocation |
| VPC/public IPv4 | `assignPublicIp=ENABLED`; public internet-gateway routing; no worker ALB; S3 gateway endpoint `vpce-007b39b34446e234b` | One in-use public address per task. No Unframe NAT gateway, ALB, EC2 host or interface endpoint line |
| GuardDuty | Runtime agent observed in running tasks | Conditional Fargate runtime-monitoring allocation; detector configuration read denied |
| Amazon Inspector | ECR registry reports ENHANCED / CONTINUOUS_SCAN / wildcard repositories | Rescan allowance included; project coverage and Lambda scan status reads denied |
| IAM, security groups, subnets, internet gateway, S3 notifications | Existing supporting resources | No separate per-resource charge entered. S3 notifications deliver directly to SQS; no SNS or EventBridge application transport |

Exclude the **undeployed Planning Lambda/API**, Strobe-only containers/databases/buckets/load balancers, Route 53/custom-domain hosting, EKS, SageMaker, OpenSearch, external LLM subscriptions and unused AI providers. Do not add a managed GPU endpoint: OpenCLIP runs inside the paid worker task. Customer-managed KMS requests are not required by the observed SSE-S3/SSE-SQS configurations. The S3 gateway endpoint has no hourly/processing fee; do not price it as an interface endpoint. [AWS gateway endpoint documentation](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html).

Account-managed CloudTrail, Security Hub and other GuardDuty protection plans cannot be attributed from these project reads. They are **unallocated**, not proven absent or free. A university bill/CUR allocation is needed before claiming a complete account chargeback.

## 2. What was actually measured

### Recognition, scaling and task time

The successful experiment created/uploaded **883 legitimate recognition jobs in 300.115 seconds**, with **883/883 correct, first-attempt successes**. Mean processing interval was **548.454 ms**, p95 **663 ms**. All inputs were the same public reference `mobile/assets/water-lilies.jpg`: **372,985 bytes**. This is a benchmark input size, not a measured average of visitor camera photos.

| Event | UTC, 31 October 2026 |
| --- | --- |
| First / last job created | 08:06:03.779 / 08:11:01.327 |
| Automatic desired count set to 3 | 08:11:06.016 |
| First observed running count 3 | 08:12:15.317 |
| Sustained queue drain observed | 08:14:15.806 |
| First observed running count 2 | 08:29:56.083 |+

| First observed running count 1 | 08:32:56.047 |

Thus the sampled sequence **1 → 3 → 2 → 1** includes **17 min 40.766 s at three tasks**, then **2 min 59.964 s at two**. Integrated extra running capacity above one task is **0.639304444 task-hours**. Total observed running-task time over the sampled experiment was **1.086125 task-hours**. These are sampled running times, not billing-meter values. Image pulling and termination can add billed time. See [timestamped verdict](../verification/2026-10-31/scaling-max-three/run-01/F14-F16-verdict.json).

The original 30 jobs drained in about 18 seconds, too briefly to satisfy the high alarm's three one-minute periods. The later sustained experiment proves automatic scaling, but does not establish a monthly burst frequency or a diverse-image 50-user SLA.

Fargate bills allocated CPU/memory while tasks run, including idle long polling, from image download until termination. Linux has a one-minute minimum and per-second rounding. **730 hours is a forecast month convention**, not measured uptime or 883 × inference duration. [Fargate pricing](https://aws.amazon.com/fargate/pricing/).

### Lambda, queue and logs: closed window 08:05–08:35 UTC

| Observation | Measured value | Interpretation |
| --- | ---: | --- |
| Jobs Lambda invocations / errors | 883 / 0 | Load generator used POST creates; it did not reproduce browser status polling/CORS |
| REPORT runtime mean / p95 / maximum | 54.591 / 118.04 / 1,209.79 ms | Aggregate of 883 individual reports, not an unweighted mean of minute averages |
| Billed duration mean / p95 / maximum | 59.414 / 119 / 1,971 ms | Includes billed initialization; use billed duration for cost |
| Cold starts / maximum memory used | 5 / 118 MiB | Function allocation remains 128 MiB |
| SQS sent / received / deleted | 883 / 883 / 883 | No retries in this run |
| SQS empty receives | 177 | Charged requests in addition to nonempty receives |
| SQS message size | 864 bytes | An S3 event pointer, not the 372,985-byte image |
| Worker log incoming bytes / events | 381,299 / 3,538 | About 431.8 bytes/job including this window's startup events |
| Lambda log incoming bytes / events | 304,103 / 2,654 | About 344.4 bytes/invocation in this create-only window |
| Shared Container Insights incoming bytes / events | 576,294 / 629 | Includes Strobe: do not assign all of this to Unframe |
| Unframe-filtered performance records | 232,101 UTF-8 bytes, 243 events | 31 service, 71 task and 141 container records; excludes shared cluster aggregates |

Sources: [Lambda report statistics](../verification/2026-10-31/pricing-calculator/lambda-reports.json), [usage metrics](../verification/2026-10-31/pricing-calculator/experiment-usage-metrics.json), [project-only performance log sizes](../verification/2026-10-31/pricing-calculator/ci-project-log-sizes.json). No raw application logs, credentials, image contents or capabilities were saved by this collection.

Worker and Lambda logs currently have **no expiry**; Container Insights performance logs retain **one day**. StoredBytes snapshots can lag and are not a reliable measure of newly ingested bytes. The shared API has no access-log destination or detailed route metrics enabled; no project-specific historical HTTP byte/preflight rate is available.

### Storage, polling and Bedrock

- Frontend S3: **13,345,406 bytes**, 68 objects, approximately **0.012428878 GiB**. This is stored content, not bytes delivered per visitor. Cache verification proved hits, not a monthly 95% hit ratio.
- Input bucket: three current objects totaling **1,670,990 bytes**; their **556,996.7-byte** mean describes surviving historical objects, not successful-job traffic. Successful recognition and Analyse evidence confirms image deletion.
- ECR: 15 manifest records include indexes/attestations and five image versions. Deduplication found **40 unique layers, 3,884,122,580 compressed layer bytes**, plus 56,786 config bytes and 26,720 manifest bytes. Approximately **3.61745 GiB** of referenced content; use a **4 GiB forecast**. Do not sum imageSizeInBytes across tags/manifests. This is not CUR billed storage.
- A successful DynamoDB job measured approximately **2,921 item bytes**, and a real strongly consistent GetItem consumed **1 read unit**. Its TTL was **86,400 seconds**. The table's DescribeTable count/size was stale relative to the 883 jobs; do not extrapolate monthly storage from that snapshot.
- `mobile/src/recognitionJobs.ts` starts polling after upload and waits **1,500 ms** after nonterminal responses. `server/cloud/jobs.js` returns that delay. The loop is not capped at six polls; six is a forecast allowance. Queue waits of approximately 88 s in the burst would require roughly 60 polls if a browser stayed attached. The harness instead observed DynamoDB directly.
- Both OPTIONS routes invoke Jobs Lambda. API-level CORS is absent; the handler supplies CORS without an explicit Access-Control-Max-Age. Browser caching can reduce preflights. They cannot be omitted from a web-cost estimate merely because the Node load generator did not send them.
- Real Analyse job `48eb6b33-57e8-4d22-92bd-67690289915c` succeeded, retained its result and deleted its input. The Bedrock completion event recorded **2,785 ms**; processing-to-completion was **4.234 s**. This is **one sample**, not an Analyse latency distribution. [F12 summary](../verification/2026-10-31/bedrock-v5-live/F12-summary.json), [safe events](../verification/2026-10-31/bedrock-v5-live/F12-worker-events.json).
- Safe completion logs do **not retain token usage**. CloudWatch supplies model-level token counts for the shared account, but even the recognition-only window contains substantial Gemma traffic. These metrics cannot isolate this project or its successful Analyse job. No new inference was performed to obtain tokens; forecast tokens below are explicitly assumptions.

## 3. Exact monthly workload to enter

Use this as the **expected mixed workload**, with recognition-only as a separately labelled alternative. All values here are forecasts unless identified above as measurements.

| Assumption | Value / derivation |
| --- | --- |
| Active visitors | 50 concurrently browsing throughout a 730-hour month; 24/7 assumption deliberately stated |
| Recognition frequency | One scan per visitor per 300 s |
| Recognition jobs | `50 × 730 × 3,600 / 300` = **438,000/month**, mean arrival **0.166667/s** |
| Optional additional Analyse jobs | 10% of recognitions lead to one additional Analyse upload = **43,800/month** |
| Total job creates/uploads | **481,800/month**; mean combined arrival **0.183333/s** |
| Real Gemma calls | Assume all 43,800 Analyse jobs require one model call; no catalogue-note bypass savings assumed |
| Status GETs | Budget **6 per job** = **2,890,800/month**; not measured browser usage |
| API OPTIONS | Conservative one per POST or GET = **3,372,600/month**; browser cache savings not assumed |
| API calls and Lambda invocations | `481,800 + 2,890,800 + 3,372,600` = **6,745,200/month** |
| Lambda billed duration | **100 ms** across all calls, a budget above measured create mean 59.414 ms; GET/OPTIONS duration unmeasured |
| Photo size / average residence | **372,985 bytes** benchmark proxy / **120 seconds** storage allowance including queue delay |
| Visitor sessions / frontend transfer | One-hour sessions: **36,500**; **5 MiB** and **20 HTTPS requests/session**, allowing browser-cache/compression uncertainty |
| Origin requests | Assumed 5% of 730,000 frontend requests = **36,500 S3 GETs** |
| Burst allowance | **30 repetitions/month** of measured extra task time, plus three minutes per extra task for pull/stop overhead; budget, not observed frequency |
| Tokens per real Analyse | **1,500 input**, including prompt/schema/image tokens; **300 output**. Neither is measured |
| Retries | No forecast retries, matching the successful recognition experiment; sensitivity must be added for production failures |

The burst allowance is a capacity-cost stress allowance within the monthly volume, not another 26,490 jobs to add to it. The sustained generator's burst shape is not evidence that 50 human visitors actually submit at 3/s. The six-poll average must be revised if frequent backlogs or slower Analyse responses are observed.

Do not use the 3-second Lambda timeout as average runtime, or the 4.234-second worker processing time as Lambda duration. Jobs Lambda returns asynchronously; the Fargate worker performs inference.

### Units and estimate basis

- Use **730 hours** for task/address monthly arithmetic. Thirty bursts is an independent budget assumption, not a claim that 730 hours equals 30 days.
- In this worksheet, binary quantities are explicit: **1 KiB = 1,024 bytes; 1 GiB = 1,073,741,824 bytes**. AWS S3/Fargate pricing calls these GB. Enter the listed GiB-derived values in their GB fields. Do not convert image bytes using 1e9 and silently mix units. [S3 pricing units](https://aws.amazon.com/s3/pricing/).
- Request fields labelled **million requests** need counts divided by 1,000,000. For example 6,745,200 becomes **6.7452 million**, not 6,745,200 million. In fields labelled thousands, divide by 1,000.
- The table totals below are **gross marginal/list-price forecasts** without allocating shared-account free tiers. The Calculator may automatically apply allowances; reconcile them separately rather than changing request counts to force the same total.

## 4. Baseline, expected and peak Fargate inputs

All scenarios retain **Linux / x86 / On-Demand / 0.5 vCPU / 2 GB RAM / 20 GB total ephemeral storage**. Additional billed ephemeral storage is **0 GB**. No Spot or Savings Plan discount is assumed.

| Scenario | Exact task-duration inputs | Task-hours | vCPU-hours | Memory GB-hours | Compute USD | Public IPv4 USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Baseline capacity | 1 task/month × 730 hours | 730 | 365 | 1,460 | 25.4916 | 3.6500 |
| Expected budget | Baseline plus 60 extra task starts/month × **22.179133 minutes** average | 752.179133 | 376.089567 | 1,504.358267 | 26.2661 | 3.7609 |
| Peak capacity ceiling | 3 tasks/month × 730 hours | 2,190 | 1,095 | 4,380 | 76.4748 | 10.9500 |

Expected extra time: `30 × (0.639304444 observed extra task-hours + 2 × 3/60 pull/stop allowance)` = **22.179133 task-hours/month**. The Calculator can represent expected capacity as two Fargate entries: baseline plus burst capacity. If it accepts seconds rather than minutes, enter **1,330.748 seconds** per extra task, or round upward to **1,331 seconds**. Do not enter 730 hours **per day**, or one Fargate task per recognition job.

One public IPv4 is allocated to each task ENI. Expected address usage is **752.179133 address-hours**, baseline 730, peak 2,190. If the VPC form wants average addresses over 730 hours, use **1.03038237** expected; if it requires whole addresses, represent baseline and burst address-hours separately or keep the exact supplemental calculation. A public task address is not a separately reserved idle Elastic IP.

Rates verified from current Sydney price lists: **$0.04856/vCPU-hour**, **$0.00532/GB-hour**, **$0.005/public-IPv4-hour**. Expected compute plus IPv4 is **$30.0270/month**. GuardDuty is separate. The max-three target is a scaling guardrail, not a billing cap; replacements/deployments can overlap tasks, and none are assumed here.

## 5. Per-service Calculator entries — expected mixed workload

Select **Asia Pacific (Sydney)** for regional services. CloudFront is global and its delivery region follows Price Class 100, not the S3 origin region. The following are semantic input fields and exact quantities; current widget wording may vary.

### API Gateway and Jobs Lambda

| Entry | Value |
| --- | --- |
| API type | **HTTP API**, not REST or WebSocket |
| HTTP API monthly calls | **6,745,200**, or **6.7452 million** |
| Average request size if requested | **1 KB budget**, well below the 512 KB metering increment; request body contains job metadata, not the image |
| API internet data out | **12.865448 GB/month**, using a conservative **2 KiB average response across all calls**, including an allowance for headers; actual bytes unavailable |
| Lambda architecture / memory | x86 / **128 MB** |
| Lambda requests | **6,745,200/month** |
| Average billed duration | **100 ms** |
| Equivalent compute | **84,315 GB-seconds/month** = 6,745,200 × 0.1 × 0.125 |
| Provisioned concurrency | **0** |
| Ephemeral storage | **512 MB total**, **0 additional billed** |
| Streaming, Lambda@Edge | **0** |

API requests cost **$1.29/million**, Lambda requests **$0.20/million**, Lambda x86 compute **$0.0000166667/GB-second** in the captured first tier. Gross estimates: API requests **$8.7013**, Lambda **$2.7543**. Enter API egress once, either in its transfer field or the separate transfer line below. HTTP API calls are metered in 512 KB increments; this application avoids sending the image through the API. [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/).

### DynamoDB Standard, on-demand

| Entry | Value |
| --- | --- |
| Read request units/month | **3,372,600** = six status reads + one worker read per job |
| Read consistency | **100% strongly consistent**, no transactional or eventual reads |
| Write request units/month | **2,890,800** = six budgeted WRUs/job |
| Actual write API operations/month | **1,445,400** = create + claim + completion per job |
| Item-size assumptions | Create/claim <=1 KiB each; completed item <=4 KiB; six WRUs = 1 + 1 + 4 |
| Average stored data | **0.181274414 GB**, including a 4 KiB stored-item budget and three-day effective retention |
| GSI / replicas / streams / PITR / backups / export / import | **0** in this project forecast |

If the form requests operation counts and average item sizes rather than units, use **1,445,400 writes/month × 2 KB billing-equivalent average** and **3,372,600 strong reads/month × <=4 KB**. The 2 KB value reproduces the rounded write total; it is not the completed-item size. If a single common item-size field is offered, 2 KB still gives one RRU/read; enter stored GB independently. Verify Show calculations yields **2.8908 million WRUs and 3.3726 million RRUs**. Do not enter WRU counts and then multiply them again by a multi-KB item size.

TTL is actually one day. The forecast allows two additional days for asynchronous expiry cleanup; expiry does not guarantee immediate physical deletion. Storage: `481,800 / (730/24) × 3 × 4,096 / 2^30`. No TTL write charge is added for this non-global table. Reads round per 4 KiB and writes per 1 KiB; larger Analyse results require new unit assumptions. [DynamoDB operation billing](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html).

Rates: **$0.1425/million RRUs**, **$0.71/million WRUs**, **$0.285/GB-month** marginal storage beyond the shared free allocation. Gross **$2.5847/month**, including $0.0517 storage. The Calculator may show zero storage charge because this quantity is below 25 GB; do not increase the physical storage input to remove that allowance.

### S3 Standard buckets

| Entry | Value |
| --- | --- |
| Average Standard storage | **0.021627234 GB** combined |
| PUT/COPY/POST/LIST | **481,800/month** (481.8 thousand) |
| GET and other charged requests | **1,000,100/month** (1,000.1 thousand) |
| Storage retrieval/transition/replication/acceleration | **0** |
| Internet data transfer into S3 | About **167.362553 GB** uploaded; incoming transfer free |
| Transfer to same-region worker / CloudFront | No separately charged S3 internet-egress volume |

Storage comprises **0.007642126 GB** of average live successful inputs, **13,345,406 / 2^30 GB** of frontend objects, and **1,670,990 / 2^30 GB** carried forward as a conservative historical-object allowance. Successful-input storage is `jobs × image bytes × 120 seconds / monthly seconds / 2^30`, not the total monthly uploaded bytes.

GET/other allowance comprises **481,800 worker GetObject**, **481,800 upload OPTIONS** and **36,500 frontend cache misses**. Upload preflight billing is budgeted at the GET/other rate; no measured request-billing breakdown was available. DELETE requests are free. Presigning is local computation, not an S3 PUT until the browser uploads. No extra HEAD per successful job is present in the processing code; verification HEADs are operational checks.

Rates: **$0.0055/1,000 PUT**, **$0.00044/1,000 GET/other**, **$0.025/GB-month**. Gross **$3.0905/month**. S3 Vectors is a separate line below, not Standard bucket storage. [S3 pricing](https://aws.amazon.com/s3/pricing/).

### SQS Standard

Enter **1,559,509 requests/month**, or **1.559509 million**, standard queue, no FIFO/fair-queue surcharge, payload **1 KB budget** (<64 KB), no batching discount. If the form accepts millions by request type, use:

| Action | Monthly count |
| --- | ---: |
| SendMessage/S3 notification delivery | 481,800 |
| ReceiveMessage, nonempty | 481,800 |
| ReceiveMessage, empty | 114,109 |
| DeleteMessage | 481,800 |
| ChangeMessageVisibility / redrive / retries | 0 forecast |

Empty receives are a conservative **idle-time upper model**: `ceil(max(0, 752.179133×3,600 − 438,000×0.548454 − 43,800×4.234)/20)`. This avoids adding a full month's idle polls on top of a full month's busy time. An arrival can terminate a long poll before 20 seconds, so actual empty receives may be lower. It is not an observed monthly count.

Gross **$0.6238** at **$0.40/million**. SQS bills actions including empty receives, and payload chunks of 64 KB. The image is in S3; do not price SQS with image bytes. [SQS pricing](https://aws.amazon.com/sqs/pricing/).

### ECR and Inspector

ECR private storage: **4 GB/month**, same-region transfer to Fargate, internet/cross-region transfer **0** planned. Gross **$0.40/month** at **$0.10/GB-month**. Layers are shared across versions. No image builds/pushes are scheduled in this steady-state estimate; a new release needs additional storage and scanning inputs.

Inspector ECR scanning: **0 initial scans/month**, **150 rescans/month budget**, gross **$1.50** at **$0.01/rescan**. The allowance is equivalent to five retained image versions × 30 rescans each, **not a claim that Inspector scans once daily**. Rescans depend on relevant CVE updates and scan eligibility. An initial image scan costs **$0.09**; one-time scans already performed are not a recurring monthly deployment expense. Do not count index/attestation manifests as five more deployed worker images. [Inspector usage accounting](https://docs.aws.amazon.com/inspector/latest/user/usage.html), [Inspector pricing](https://aws.amazon.com/inspector/pricing/).

`inspector2:ListCoverage` was denied for both the repository and Jobs Lambda. Actual rescan counts and Lambda coverage remain unknown. If the teaching team confirms Jobs Lambda scanning, add **one function × 730 hours** at **$0.000417/hour** standard scanning (**$0.30441/month**), plus **$0.00084/hour** code scanning (**$0.61320/month**) only if enabled. These two conditional Lambda amounts are **not included** in $97.07.

### CloudFront static delivery

Use pay-as-you-go as the working estimate, **Price Class 100**. For a reproducible conservative selection within that class, allocate **100% to Europe/Israel/Türkiye**:

- Data to internet: **178.22265625 GB/month** = 36,500 × 5 MiB / 1,024.
- HTTPS requests: **730,000/month**, or **0.73 million**.
- HTTP, origin uploads, Functions, Lambda@Edge, Origin Shield, real-time logging: **0**.
- Invalidation paths: **0 recurring**; deployments are outside this steady-state workload.

This is a forecast billing-region allocation, not measured edge geography. Class 100 includes North America and Europe, and excludes Australian edges from its normal selection. Rates: **$0.085/GB** and **$0.012/10,000 HTTPS requests**, gross **$16.0249**. If billed entirely in North America, use **$0.010/10,000 HTTPS**: the request component is $0.146/month lower. Do not use the old Australian $0.114/GB rate just because the origin and users are in Sydney. [CloudFront PAYG and price classes](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/).

The existing creation/configuration evidence supports the PAYG working assumption. The installed AWS CLI does not expose `pricing-plan-manager`, so current subscription status could not be independently read. Before final sharing, confirm the distribution's pricing plan in the console. Do not select a flat-rate plan or add its bundled WAF/DNS to this estimate unless that subscription actually exists. PAYG free-tier allowances and a flat-rate Free plan are different things.

### CloudWatch

Use standard logs and standard, non-enhanced Container Insights. Exact expected inputs:

| Input | Value |
| --- | ---: |
| Standard logs ingested | **7.142204285 GB/month** |
| Log storage, conservative month-one average budget | **6.900423463 GB** |
| Paid Unframe custom metric-months | **24** |
| Shared-cluster metric allocation | **3.25** = 13 cluster metrics × 25% |
| Total billed metric-month budget | **27.25** |
| Dashboards | **1** |
| Standard alarm metrics | **4**: two alarms × two underlying metrics |
| High-resolution/composite alarms | **0** |
| GetMetricData metrics requested | **100,000/month**, not 100,000 API calls |
| Logs Insights scanned GB, metric streams, traces | **0 planned** |

App logs use **1 KiB/job plus 1 KiB/Lambda invocation**, conservatively above measured payloads, yielding **6.892204285 GB/month**. Add **0.25 GB/month** for attributed performance logs. The latter is a budget above the project-filtered sample extrapolation, not the whole shared log group. The 1 KiB allowances also leave room for ingestion framing and modest diagnostics.

Fresh ListMetrics found 15 service series and 10 task-family series for Unframe, plus 13 cluster series. RunningTaskCount is available without an additional metric charge under current published pricing, giving **14 + 10 = 24** direct paid series. Allocate one quarter of the cluster's 13 series because four services currently share it; this is an allocation convention, not AWS's invoice split. If the form requires whole metrics, enter direct **24** and record **$0.975/month** shared allocation separately; alternatively round total to **28**, a $0.225 conservative increase. Do not charge all Strobe series.

Metric-math alarms are billed per underlying metric, not merely per alarm object. Rates: logs **$0.67/GB ingested**, **$0.033/GB-month stored**, custom metrics **$0.30/metric-month**, dashboard **$3/month**, standard alarm **$0.10/metric-month**, GetMetricData **$0.01/1,000 metrics requested**. Gross **$17.5880/month**. [Current CloudWatch billing rules](https://aws.amazon.com/cloudwatch/pricing/), [saved dashboard price list](../verification/2026-10-31/pricing-calculator/prices/CloudWatchDashboards.json).

App logs have no retention limit. Month-one storage above conservatively retains the whole month's uncompressed log budget for the whole month; actual compressed/time-weighted storage should be lower. This is **not a steady-state storage estimate**: after twelve unchanged months, an uncompressed upper-budget storage run rate would approach twelve monthly app-log volumes. CI contributes only one day of its monthly ingestion. No retention setting was changed.

### Internet transfer and public IPv4

Enter API internet egress **12.865448 GB/month** once, and a separate **1 GB/month forecast allowance** for worker external catalogue/network traffic. Combined **13.865448 GB** at **$0.114/GB** is **$1.5807 gross**, before the shared internet-transfer allowance. The 1 GB is an unmeasured allowance; exact non-AWS catalogue traffic is unavailable.

If API Gateway's Calculator already includes those **12.865448 GB**, the separate Data Transfer entry should contain **only 1 GB**. If no appropriate transfer field is available, retain the explicit supplemental line; do not add a fictitious EC2 instance to represent transfer. Public IPv4 is separately **752.179133 address-hours**, as above. Same-region S3/ECR-to-worker traffic and S3-to-CloudFront origin delivery are not duplicate internet delivery charges.

### GuardDuty runtime monitoring — conditional allocation

Observed agent presence warrants a line, but `guardduty:ListDetectors` was explicitly denied. Use **0.515191187 average monitored Fargate vCPUs** = 752.179133 task-hours × 0.5 / 730, at the verified Sydney first-tier **$1.70/vCPU-month**: **$0.875825/month**. If the form accepts task configurations, use 0.5 vCPU with equivalent task-hours. Baseline is $0.85; peak is $2.55.

Do not bill a separate 0.5-vCPU Fargate task for the injected agent. The price above is the monitoring service fee, in addition to the already allocated task. Trial/organization allocation is unknown. Other GuardDuty protections are unallocated pending instructor billing evidence. [GuardDuty pricing and monitored-vCPU formula](https://aws.amazon.com/guardduty/pricing/).

## 6. Supplemental model-specific pricing

The public Calculator's live service/model selectors could not be inspected: this session has **no enabled browser surface**, and the public JavaScript page exposes no readable form through web retrieval. Consequently this report does **not** assert that Gemma or S3 Vectors is absent from today's UI. Search for them when entering the estimate. If supported with matching units, enter them once; otherwise attach these supplemental calculations alongside the Calculator PDF/CSV. Do not substitute Titan, another model, OpenSearch or S3 Standard to force a line into the interface, and do not invent a custom-price control.

### Bedrock Gemma 3 12B IT

Expected real invocations: **43,800/month**, **1,500 input tokens/call**, **300 output tokens/call**. Totals **65,700,000 input tokens** and **13,140,000 output tokens**.

Current Sydney standard on-demand rates:

| Dimension | Price-list unit | Equivalent |
| --- | --- | --- |
| Input | $0.0000927 / 1,000 tokens | **$0.0927/million tokens** |
| Output | $0.0002987 / 1,000 tokens | **$0.2987/million tokens** |

`65.7 × 0.0927 + 13.14 × 0.2987 = $10.015308/month`.

Verified against the Sydney Google table on [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) and [the saved public regional price list](../verification/2026-10-31/pricing-calculator/prices/AmazonBedrock.json). No batch/Flex/priority, provisioned model units, training, caching discount, Agents, Knowledge Bases or Guardrails is assumed. The current code uses Converse; prompts/images count toward input usage. Pixel bytes cannot be converted to tokens by guessing a byte/token ratio.

Token counts are forecasts because safe project logs omit usage and the model metric is shared. Recognition-only sets calls and tokens to **0**. A catalogue match can skip Gemma for an Analyse request; no such skip is counted as a successful Bedrock invocation or assumed as a discount here. Additional Analyse jobs also incur the queue, API, Lambda, database, storage and worker costs above; **$10.02 is not the entire cost of adding Analyse**.

### S3 Vectors

Observed: **15 vectors**, dimension **512**, float32 (**2,048 vector-data bytes/vector**). Measured keys/metadata give an estimated **37,087 logical storage bytes** in total and **34,882 bytes processed per query** across the whole index, excluding non-filterable metadata. The UTF-8 key/value calculation is a logical-size estimate, not a service billing reading; no raw vectors were saved. [Size evidence](../verification/2026-10-31/pricing-calculator/vector-sizes.json).

| Input/dimension | Quantity | Verified Sydney rate | Monthly USD |
| --- | ---: | ---: | ---: |
| QueryVectors | 481,800 | $2.70/million | 1.300860 |
| Query bytes processed, first <=100K-vector tier | 15.651944652 GB/month | $0.000004278/GB | 0.00006696 |
| Logical vector storage | 0.0000345399603 GB | $0.066/GB-month | 0.00000228 |
| GetIndex control allowance | 61/month | $0.06/1,000 | 0.003660 |
| Vector PUT data | 0 recurring GB | $0.219/GB if reindexing | 0 |
| Billable query-return bytes | 0 | $0.01/GB beyond per-query allowance | 0 |
| **Total** | | | **1.304589** |

Processed volume: `481,800 × 34,882 / 2^30`. This is **$0.000004278 per GB**, not $0.004278 per GB; confusing GB/TB gives a thousand-fold error. There is no 100,000-vector minimum count to invent for this 15-vector index. Metadata filters narrow returned candidates but the documented processing calculation uses index vector count and average billable vector size. Do not multiply processing by only three results.

The application returns at most three recognition candidates, but it requests up to the selected catalogue size from S3 Vectors; general Analyse can request all 15. With this tiny metadata set, returns are well below the documented **500 KB/query free returned-data allowance**. Source/image hashes contribute to storage/returned metadata, but are excluded from processed bytes because they are configured non-filterable. One successful GetIndex check is cached per adapter lifetime; 61 is a startup/restart budget. No reuploads were performed or forecast. [S3 Vectors pricing rules](https://aws.amazon.com/s3/pricing/), [saved Sydney S3 rates](../verification/2026-10-31/pricing-calculator/prices/AmazonS3.json).

## 7. Reconciliation and sensitivity

### Expected gross monthly ledger

| Component | USD/month |
| --- | ---: |
| Fargate | 26.2661 |
| Public IPv4 | 3.7609 |
| API Gateway requests | 8.7013 |
| Jobs Lambda | 2.7543 |
| DynamoDB | 2.5847 |
| S3 Standard | 3.0905 |
| SQS | 0.6238 |
| ECR | 0.4000 |
| CloudFront PAYG | 16.0249 |
| CloudWatch, including allocated shared metrics | 17.5880 |
| API and external worker transfer | 1.5807 |
| S3 Vectors | 1.3046 |
| Gemma | 10.0153 |
| Conditional GuardDuty runtime allocation | 0.8758 |
| Inspector rescan allowance | 1.5000 |
| **Total, before free allowances/tax/credits** | **97.0709** |

If Gemma and S3 Vectors remain outside the Calculator, their combined supplement is **$11.319897/month**. Remove them from the manual supplement if you successfully add matching Calculator entries. Calculator-supported versus supplemental placement does not change the economic total.

CloudFront's PAYG shared allowance can cover 1 TB and 10 million HTTP(S) requests; SQS has a shared one-million-request allowance; DynamoDB storage has a shared 25 GB allowance. Lambda and CloudWatch allowances may also reduce the displayed estimate. Those allowances may be consumed by other students/Strobe/other regions. Do not assume they are exclusively available to this project or subtract them twice. The $97.07 ledger deliberately shows gross attribution; the exported Calculator total must state which allowances it applied. [CloudFront PAYG allowances](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), [SQS allowance](https://aws.amazon.com/sqs/pricing/).

### Sensitivities, not measured capacity guarantees

| Change from expected | Forecast monthly USD | Limitation |
| --- | ---: | --- |
| Recognition only; no additional Analyse jobs | **84.76** | Same infrastructure/burst allowance; all ancillary job counts reduced |
| Two status polls/job | **86.83** | Same conservative preflight rule; lower API/Lambda/log/read costs |
| Sixty status polls/job | **235.35** | Backlog-heavy scenario; demonstrates why polling dominates at long waits |
| Scan every minute, same 10% additional Analyse | **238.32** | 2,409,000 jobs/month; about 591 busy task-hours using the limited samples. Burst capacity may cost more than the unchanged allowance |
| 50 active users only 240 hours/month | **62.60** | 158,400 jobs; baseline worker still runs 730 hours |
| Three workers continuously, same expected traffic | **156.25** | Includes more idle SQS receives and runtime monitoring; CI/log inputs held constant for sensitivity, so not a fully remeasured peak system |

For any job volume `J` and mean polls `P`, with one preflight per application request: API/Lambda calls = **2J(1+P)**; strong DDB reads = **J(1+P)**; write units = **6J**; SQS nonempty actions = **3J**; image PUT/worker GET/vector queries = **J** each. Each additional poll increases API/Lambda calls by two, DDB reads by one, and log/transfer volume. Recalculate these together.

At 43,800 real Gemma calls/month, token-only sensitivity is approximately **$3.99** for 500 input/150 output tokens, **$10.02** at 1,500/300, and **$30.35** at 5,000/768. The upper output example uses the current default vision generation cap, not measured usage. Each extra **one million input/output tokens** adds **$0.0927/$0.2987** respectively.

A five-times larger image does not create five SQS messages: only image storage/transfer and possibly preprocessing time change. A five-times larger DynamoDB item can cross per-operation billing boundaries. Retries repeat the relevant failed stages, can repeat inference, extend retention and increase polling; do not apply a universal multiplier without checking the retry path.

### Double-counting checklist

- S3 PUT carries raw image bytes directly. Do not bill that payload again as an API Gateway/Lambda request body or a CloudFront request.
- API creates/polls/OPTIONS each have both API Gateway and Lambda charges; those are distinct services, not duplicates. OPTIONS does not access DynamoDB in the handler.
- API response egress appears once. Do not add Lambda internet egress for the same API response.
- CloudFront viewer bytes appear once. S3 origin GETs cost requests, but AWS-origin transfer to CloudFront is not a second viewer-egress bill.
- Do not add an ECS control-plane, EC2 instance, GPU host, EBS volume or ALB to the Fargate worker line. Included 20 GB ephemeral storage is not an additional 20 GB storage charge.
- Count SQS pointer size, not image bytes. Empty ReceiveMessage calls are additional requests, but subtract busy task time before estimating idle polling.
- DDB writes are three API operations with size-rounded units, not three writes plus six additional writes. Do not double-round already normalized WRUs.
- ECR shared layers count once; tags/index manifests do not replicate the complete image's storage. Same-region pulls are not internet-download charges.
- Container Insights custom metrics/log ingestion and standard application logs are distinct; enhanced-observability bundled pricing must not be added to the current standard mode.
- Account-wide Gemma metrics, the shared API's total traffic and all cluster logs are not Unframe usage.
- GuardDuty monitoring fees do not represent another worker task. Inspector scan fees do not replace ECR storage.
- Do not sum baseline, expected and peak estimates as though they were simultaneously deployed environments. Create separate alternatives.

## 8. Public AWS Pricing Calculator data-entry checklist

The navigation below follows current [AWS create/configure instructions](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/create-configure-estimate.html). Service-specific interactive fields could not be independently inspected in this session; use the quantities and billing-unit checks above rather than assuming a screenshot or exact dropdown exists. The public site needs no account credentials to prepare this estimate.

1. Open **https://calculator.aws/#/** and choose **Create estimate**. Use a non-sensitive name such as `Unframe A3 – expected monthly usage – Sydney`. Do not paste credentials, read tokens or presigned URLs.
2. From **Add service**, search each service and choose **Configure**. Enter a short description and **Asia Pacific (Sydney)**. Leave region-specific services in Sydney; CloudFront uses the edge allocation above.
3. Add **AWS Fargate** baseline: Linux/x86, On-Demand, 0.5 vCPU, 2 GB, total ephemeral 20 GB, 1 task per month, 730-hour duration. Check calculations show **365 vCPU-hours and 1,460 memory GB-hours**.
4. Add a second Fargate entry named `Burst capacity allowance`: 60 tasks per month, 22.179133 minutes/task, same resources. Confirm total Fargate cost is approximately **$26.2661**, not twice the baseline or 730 hours per burst.
5. Add **Amazon VPC / public IPv4** with **752.179133 in-use address-hours**. Do not add NAT or interface endpoint capacity. If the form cannot express fractional usage, retain the exact supplement and note any upward rounding.
6. Add **Amazon API Gateway / HTTP API** with **6.7452 million calls/month**. Add **12.865448 GB** internet egress if supported in that section. Leave REST/WebSocket/portal features zero.
7. Add **AWS Lambda** with **6,745,200 requests**, **128 MB**, **100 ms**, x86, no provisioned concurrency or additional ephemeral storage. Check compute is **84,315 GB-seconds** before free allowances.
8. Add **Amazon DynamoDB / Standard / On-Demand**. Enter the reads/writes and size mapping in section 5. Check the resulting units, not just the label: **3.3726 million RRUs**, **2.8908 million WRUs**, **0.181274414 GB** storage. Leave replicas/backups/PITR zero.
9. Add **Amazon S3 / S3 Standard** with **0.021627234 GB**, **481,800 PUT-class requests**, **1,000,100 GET/other requests**. Check whether request fields are raw counts or thousands. Do not add the monthly uploaded volume as continuously retained storage.
10. Add **Amazon SQS / Standard** with **1.559509 million requests/month**, <=64 KB payload and no batching. Include empty receives. Do not create a second paid storage line merely for the existing DLQ.
11. Add **Amazon ECR** private storage **4 GB**, no out-of-region/internet pulls. Add **Amazon Inspector** ECR **0 initial scans** and **150 rescans/month** if available; otherwise show **$1.50** in the supplemental worksheet. Do not assume Lambda scanning is enabled.
12. Add **Amazon CloudFront**, using PAYG after checking the existing distribution's plan. Allocate Europe **178.22265625 GB** and **730,000 HTTPS requests**; other delivery regions/features zero for this reproducible scenario. Record any automatically applied free allowance. Do not switch the actual distribution's plan.
13. Add **Amazon CloudWatch** with the exact log volumes, **24 direct + 3.25 allocated metric-months**, dashboard 1, **4 standard alarm-metric units**, and **100,000 GetMetricData metrics requested**. If the form asks for alarms and metrics/alarm separately, enter **2 and 2**, not four two-metric alarms. Check units and add fractional/shared amounts externally if required.
14. Add the remaining **1 GB external worker transfer** once. If API egress was not entered in step 6, the transfer total is **13.865448 GB**. Use the correct Sydney internet rate; no fictitious compute resource is required.
15. Search **Amazon Bedrock**, then provider **Google**, exact **Gemma 3 12B / google.gemma-3-12b-it**, Sydney, standard on-demand. If present, enter **43,800 calls**, **1,500/300 tokens per call**, or aggregate **65.7/13.14 million tokens** as the form requests. Confirm the unit rate before saving. If absent, retain the **$10.015308** supplement and document the unsupported selector.
16. Search the S3 configuration/service list for **S3 Vectors**. If present, use section 6's **15 vectors, 512 dimensions, metadata sizes, 481,800 queries, 61 GetIndex requests, zero PUT data**. If absent or unable to express processed-byte tiers, retain **$1.304589** separately. Never double-enter it under Standard storage.
17. Add **GuardDuty / Fargate Runtime Monitoring** if supported: **0.515191187 average monitored vCPUs/month**, labelled conditional allocation. If unsupported, keep **$0.875825** in the supplement. Add no unverified protection-plan usage.
18. For every service choose **Show calculations** when available, then **Save and add service**. On **View summary**, reconcile the gross worksheet against displayed free allowances and rounding. A mismatch is not grounds to invent larger usage.
19. Prepare baseline and peak as **separate estimates/alternatives**, replacing expected Fargate/IPv4/related usage with section 4 values. Do not put three alternative groups into one combined monthly total. For recognition-only, use `recognitionOnly.inputs` in the saved JSON so all dependent counts change, not just Gemma.
20. Export the actual estimate to PDF/CSV. Attach this Markdown or a supplemental table for unsupported services, conditional security charges and exclusions. Confirm the final recorded total states which services are outside the Calculator and which free allowances were applied.
21. Use the website's **Share** facility yourself and copy only the resulting real public estimate link into the report. Public estimate data is saved on AWS public servers; use generic descriptions, not sensitive resource details. No share link is supplied here because none was created. [Calculator export/sharing capabilities](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/what-is-pricing-calculator.html).

## 9. Remaining uncertainties and reproducibility

Before treating this as a production budget, measure real camera sizes, browser preflight/cache behaviour, polls per completed job, per-route billed Lambda duration, diverse-image processing time, project-attributable Gemma usage tokens and output-item sizes. A short browser network trace with sensitive values removed is sufficient for request counts; raw capabilities or images need not enter the report.

Billing gaps: current CloudFront subscription status (installed CLI lacks the API), Inspector project coverage/rescan count, GuardDuty plan/trial/organization allocations, any account-managed audit/security chargeback, and long-term log storage growth. These limitations do not justify charging all shared-account usage to Unframe. Numeric Fargate quota remains unreadable from earlier verification; actual three-task operation demonstrates available capacity for that experiment only.

No live load, inference or deployment was performed for this worksheet. Read-only AWS inventory/metrics and public price fetches may incur small diagnostic request charges; they are preparation activity, not recurring application traffic. Tests here are local arithmetic assertions and syntax checks; application business logic was unchanged. **Validation passed:** arithmetic, source-rate references, local evidence links and sensitive-pattern screening of 65 evidence files, with zero matches. See [validation.json](../verification/2026-10-31/pricing-calculator/validation.json). This screening is not a guarantee against every possible sensitive value.

Reproduce the captured-input arithmetic without AWS access:

```powershell
node scripts/model-pricing-calculator-inputs.mjs
node scripts/validate-pricing-calculator-inputs.mjs
```

The collection commands used were:

```powershell
aws sts get-caller-identity --profile default --region ap-southeast-2 --query '{Account:Account}' --output json
node scripts/collect-pricing-calculator-evidence.mjs
node scripts/collect-pricing-calculator-evidence.mjs --resume
node scripts/refine-pricing-calculator-evidence.mjs
node scripts/check-pricing-ancillaries.mjs
node scripts/collect-a3-price-inputs.mjs verification/2026-10-31/pricing-calculator/prices
node scripts/model-pricing-calculator-inputs.mjs
```

The first unfiltered metric inventory was interrupted and resumed with a cluster filter and a timeout; this did not generate jobs or change infrastructure. The dashboard rate was additionally read from the global `AmazonCloudWatch` public price list. All selected rates retain source URL, SKU, units and retrieval timestamp in the evidence/model. The separate `pricing-plan-manager list-subscriptions` attempt failed locally because that command is absent from the installed CLI; it did not modify a subscription.

For sustainability discussion, the measured low steady-state compute demand and always-on baseline make idle worker hours important; shorter safe retention and lower polling traffic reduce avoidable storage and requests. These are design observations, not changes performed here, and no carbon figure is inferred from dollar cost.
