# Recognition cost inputs and sustainability evidence

This is an engineering worksheet for the student's own report, not a claim of measured 50-user capacity or an AWS bill. Prices were retrieved on 31 October 2026 from the public AWS price lists for Sydney; CloudFront uses Australian edge pricing. Currency is USD before tax, discounts, credits and free tiers. Exact rates, units, source URLs, assumptions and formulas are reproducible with `node scripts/model-a3-costs.mjs` and saved in `verification/2026-10-31/recognition-final/cost-model.json` and `pricing/`.

## Demand and calculator inputs

Base scenario: 50 simultaneous browsing visitors, each scanning every five minutes, continuously for 730 hours/month. This implies 0.1667 jobs/s and **438,000 recognition jobs/month**. A visitor is not continuously submitting work. Sensitivity: one scan per minute implies 0.8333 jobs/s and **2,190,000 jobs/month**. Fifty simultaneous uploads are a different burst and were not tested; the bounded experiment used 30 jobs and five concurrent upload clients.

| Service | Exact base calculator assumptions | Monthly modeled USD |
| --- | --- | ---: |
| API Gateway HTTP API | 2,628,000 requests: one create plus five polls/job; $1.29/million | 3.3901 |
| Jobs Lambda | 2,628,000 calls; deployed x86 Node 22, 128 MiB; assumed 100 ms/call; $0.20/million plus $0.0000166667/GB-second | 1.0731 |
| DynamoDB on-demand | 2,628,000 strong read units and 2,628,000 write units; assume <=4 KiB reads and six write units/job including result updates; 4 KiB retained result, one-day TTL | 2.2572 |
| S3 | 438,000 PUT and GET each; deletes free; 372,985-byte photo; assumed 60-second average image retention; 0.1 GB frontend; 36,500 origin GETs | 2.6204 |
| SQS Standard | Three requests/job plus a conservative 131,400 empty 20-second long polls/task-month; requests <=64 KiB | 0.5782 |
| ECS Fargate | Linux/x86_64, 0.5 vCPU, 2 GiB, 20 GiB included ephemeral storage, one task × 730 hours; $0.04856/vCPU-hour + $0.00532/GB-hour | 25.4916 |
| ECR | Assumed 5 GB of retained layers across image versions; $0.10/GB-month; not a measured billed storage quantity | 0.5000 |
| S3 Vectors | 15 reference vectors; assumed 3,072 bytes/vector including metadata; 438,000 queries, top <=3; $2.70/million plus processed bytes and storage | 1.1827 |
| CloudFront | 36,500 one-hour visitor sessions; assumed 5 MB/session, 20 HTTPS requests/session; 182.5 GB and 730,000 requests; $0.114/GB + $0.0125/10,000 | 21.7175 |
| CloudWatch | 8 KiB logs/job + 1 GB performance logs; conservatively store one full month's input; 50 custom metrics budget, one dashboard, two alarms, 100,000 metric reads | 22.4254 |
| Public IPv4 | One task address × 730 hours × $0.005/hour; live service has public IP assignment enabled | 3.6500 |
| **Recognition subtotal** | Before exclusions below | **84.8862** |
| Optional Gemma analysis | Separate sensitivity: 10% of jobs, assumed 1,500 input tokens including image and 300 output tokens; Sydney standard $0.0927/million input and $0.2987/million output | **+10.0153** |

The higher-frequency scenario assumes two continuously running tasks, doubles task/IP hours and scales per-job consumption fivefold. Its recognition subtotal is **$168.2920/month**, plus **$50.0765** for the optional 10% Analyse token scenario. Two tasks are a cost assumption, not evidence that the present policy scaled or that the account permits every desired capacity. Extra analysis also occupies worker time; the token-only optional increment does not include any additional compute required by that changed workload.

Use [AWS Pricing Calculator](https://calculator.aws/) with these quantities and Sydney. Add a custom estimate line if S3 Vectors or the specific Gemma model is absent from its catalog. Create and retain the public share link manually; no share link was generated here. The dashboard's $3/month list-price reference is [AWS's published solution cost table](https://docs.aws.amazon.com/solutions/latest/distributed-load-testing-on-aws/cost.html). Detailed per-service prices are linked directly in the saved price-list JSON.

## Measurement boundaries and sensitivity

- Worker v5 passed 12 local jobs with real OpenCLIP and mocked AWS at 0.5 vCPU/2 GiB/no swap. Cgroup peak was **1.4315 GiB**, startup **53.987 s**, and processing **0.511–1.801 s**, mean **0.786 s**. CPU averaged **33.43% of one core** over the whole harness including idle time; this is not an ECS CPUUtilization sample.
- The real 30-job batch completed 30/30 correctly, with **473–724 ms** processing, mean **539.47 ms**, p95 **709 ms**, and no Bedrock calls. Source: `F14-load-results.json`; use `after-F20-metrics.json` for actual CPU/memory. Do not use mock latency as cloud latency or infer 50-user capacity from one photograph.
- Utilization estimate: arrival rate × mean job processing seconds ÷ running tasks. At the measured 0.53947 s mean, the base scenario implies about **9.0%** serial-worker occupancy and the higher-frequency scenario about **45.0%** on one task (22.5% on the cost model's conservative two tasks). Occupancy is not CPU percentage. Keep headroom for unfamiliar images, cold starts, retries and analysis. A 30-job reference-only test does not cover varied image sizes or all artworks.
- Five polls/job, Lambda duration, result size, image retention, viewer bytes, 95% origin hit ratio, logging volume, custom-metric cardinality and ECR storage are assumptions. Actual client polling is approximately 1.5 seconds, so queue delays increase both Lambda/API and DynamoDB reads. Larger result items increase rounded capacity units.
- Token usage is not captured in the current safe worker logs. The Gemma numbers are planning inputs, not measured token consumption. Recognition itself does not call Bedrock.
- This subtotal excludes API response data transfer, Logs Insights scans, exceptional retries and long-term log accumulation. Enhanced Container Insights observation charges must be added if enabled later; the inspected cluster uses ordinary `containerInsights=enabled`. No NAT gateway is assumed. Shared account usage may consume free tiers, so none are deducted.
- All four allowed tasks running for 30 minutes cost about **$0.07984 for Fargate plus public IPv4**, before API, storage, vectors and monitoring. This is an illustrative envelope, not a spending cap; the experiment does not manually raise desired count.

## Sustainability and trade-offs

The 0.5-vCPU/2-GiB configuration satisfies the course limit and passed actual model loading without changing OpenCLIP weights or precision. One Python model process and one processing job per worker avoid redundant resident models and CPU oversubscription. Startup has less memory headroom than steady-state inference; production OOM and health signals remain necessary.

SQS separates upload acceptance from inference and buffers bursts without creating one model process per HTTP request. It does not eliminate work or guarantee low latency. The minimum-one-task setting retains a warm model but consumes compute and a public address while idle; raising capacity increases costs roughly linearly during the additional task-hours. Cold starts and alarm evaluation delay constrain short-burst scaling.

CloudFront cache hits reduce repeated origin reads and network work. The observed cache hits prove caching works, not a measured monthly 95% hit ratio. Successful-job deletion reduces retained image storage and privacy exposure; lifecycle expiry covers abandoned or failed uploads. DynamoDB TTL is asynchronous, so actual retention may exceed one day. Logs currently need a deliberate retention policy to avoid unbounded growth; no retention settings were changed here.

These are resource-efficiency arguments, not measured carbon savings. No emissions factor, regional renewable-energy attribution or fabricated energy measurement is claimed. Cloud-based tour planning is Future Work and has no deployment cost line.
