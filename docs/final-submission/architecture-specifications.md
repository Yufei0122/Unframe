# Architecture diagram specifications

- [Vendor-neutral Mermaid](architecture-vendor-neutral.mmd): generic categories only; no provider products in its node labels.
- [AWS Mermaid](architecture-aws.mmd): deployed service topology, not an infrastructure proposal.
- Specifications are editable text, **not final rendered assessment figures**. Import Mermaid into a supporting editor or draw. io; check edge routing and text at final A4 size. Create the AWS figure with [official AWS icons](https://aws.amazon.com/architecture/icons/) as required by SS.docx paragraph 144. Split the data plane and operations plane if needed for 12 pt readability.

## Legend and boundaries

| Edge | Meaning |
| --- | --- |
| Solid `-->` | Synchronous HTTPS/SDK/local call; response implicit unless explicitly drawn |
| Thick `==>` | Asynchronous event/message handoff; SQS worker-pull delivery, not a push-triggered Lambda |
| Dotted `-.->` | Monitoring, scaling or deployment/authorization dependency; each edge explicitly labelled |

The worker both polls SQS synchronously and receives asynchronously queued work. These are two views of one queue workflow, not two separate delivery mechanisms. Local OpenCLIP is inside each paid task, not a separate managed endpoint or extra Fargate service. S3 Event Notification is a bucket feature, not an extra compute service. ECR/IAM arrows represent startup/configuration, not a per-job processing step.

Global CloudFront/IAM and the browser sit outside the Sydney regional boundary. The S3 frontend bucket is also physically Sydney although placed beside CloudFront for clarity; label it `ap-southeast-2` when drawing. Regional managed services are not inside the worker's VPC. Workers use existing public subnets/public IPv4; no Unframe ALB or NAT gateway is claimed. Final audit correction: the S3 gateway endpoint exists in the VPC but is absent from worker route table `rtb-0631ac6f229b4ec46`; it is not drawn as a worker dependency. Compare [saved route-table evidence](../../verification/2026-10-31/pricing-calculator/routes.json) with the [endpoint inventory](evidence/cost/vpc-endpoints.json). Existence alone did not establish traffic routing.

## Actual resource labels

Use the full IDs in [resource-id-audit.json](resource-id-audit.json) or a figure key to avoid unreadable boxes. Standard prefix is `a3-n12281212-unframe-`:

| Role | Exact identifier |
| --- | --- |
| Frontend | `web`; `d3x3iexpafsgf.cloudfront.net`; distribution `E2CK5412ICFTJX` |
| API / Lambda | API `4xfbhsso7a`, stage `prob`; Lambda `a3-n12281212-unframe-jobs` |
| State | DynamoDB `a3-n12281212-unframe-jobs` |
| Temporary images | S3 `a3-n12281212-unframe-job-images` |
| Work / failures | SQS `a3-n12281212-unframe-recognition` and `a3-n12281212-unframe-recognition-dlq` |
| Worker | Cluster `n12281212-strobe-a2`, service `a3-n12281212-unframe-worker`, task revision 6 |
| References | Vector bucket/index both `a3-n12281212-unframe-vectors` |
| Optional AI | `google.gemma-3-12b-it` |
| Operations | Dashboard `a3-n12281212-unframe`; policy `unframe-sqs-backlog` |

## Sequence facts to preserve

1. Client creates job through Jobs Lambda. Response contains upload grant and per-job read capability; image bytes bypass Lambda/API.
2. Direct S3 upload creates an event pointer in SQS. Worker long-polls, validates/claims a DynamoDB lease and reads the object.
3. Recognition uses normalized OpenCLIP vectors and filtered S3 Vectors retrieval. Similarity `1 - cosine distance`, threshold 0.80, at most three candidates; visitor confirmation remains required.
4. Optional Analyse can use reference catalogue notes; when vision is needed it invokes remote Gemma and strictly validates parsed JSON. **Ordinary recognition does not invoke Bedrock.** Do not draw Bedrock as a compulsory stage.
5. Worker persists result before successful-image cleanup and queue acknowledgement. Client polls Jobs API; DynamoDB never pushes directly to the browser.
6. CloudWatch queue/running metrics feed target tracking; alarms drive automatic desired capacity. Scaling did occur in the recorded experiment, not by manually setting desired count.

## Security and omissions

- Show private uploads separately from **public-read static origin**. Do not draw an OAC/private frontend bucket that is not deployed.
- Show service IAM roles and capability-protected result access. No deployed user login/Cognito claim; possession of a read token is not user identity authentication.
- API calls/status responses are `no-store` and bypass CloudFront. Caching evidence applies to static assets.
- No Planning Lambda, cloud planner route, API Gateway→SQS direct integration, Lambda→worker synchronous inference, ALB, Kubernetes, or local Bedrock model.
- Native/local planning source remains in the repository; it is outside the cloud deployment diagram. Do not imply the optional confirmation HTTP endpoint works.

Student review: compare against `server/cloud/{handlers,jobs,job-repository}.js`, `worker/{worker,process-job}.js`, `server/ai/{recognition,s3-vectors,artwork-analysis,bedrock}.js` and `mobile/src/recognitionJobs.ts` before finalising captions.
