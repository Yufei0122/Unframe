# Requirements and reference worksheet

This is a reading/citation map, not invented bibliography entries. Use the citation style required by the course, record your access date and cite only sources you actually consult. No claim that this preparation replaces independent learning.

## Authoritative course materials

| Source | Location / scope | Requirements to verify |
| --- | --- | --- |
| Supplied CAB 432 A3 specification | `D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\SS.docx` | Formal brief begins at paragraph 0. Paragraph 33: Sydney and exact`purpose=assessment 3`; 44–87: patterns including non-Lambda scaling/load distribution; 107:30 page limit; 119–178: required report structure; 180–192: video; 194–198: Gradescope. Paragraph indices are zero-based extraction from Word document XML, not printed page numbers. |
| Marking criteria | User-supplied rubric in this conversation | Four 10-point categories: requirements/vendor-neutral reasoning; vendor-specific design; implementation/evaluation with cost/sustainability; technical communication/evidence/independent learning. No locally authenticated rubric PDF was supplied. |
| University ECS Auto Scaling tutorial | Text supplied in conversation | Existing service only; min 1/max 3 guardrails; automatic policy actions vs manually changed desired count. Tutorial CPU 70% example is **not** Unframe's SQS backlog policy. |

The supplied Word document also contains deployment notes/screenshots after the formal brief. Do not treat those appended personal notes as additional official assessment rules. If course guidance conflicts, ask teaching staff rather than infer an exception.

## Official technical sources

The first five content rows below were opened on **2026-11-01**; remaining resources are investigation links or saved price sources, with their status stated.

| Source | Relevance / claim boundary | Status |
| --- | --- | --- |
| [ECS Service Auto Scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html) | ECS uses Application Auto Scaling; minute-scale metrics, desired capacity, cooldowns. Pair with actual Successful activities and running counts. | Read 2026-11-01 |
| [S3 Event Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html) | S3 can publish toSQS; at-least-once events. Supports conditional consumer/idempotency discussion, not an exactly-once claim. | Read 2026-11-01 |
| [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) | Expiration is asynchronous; items can remain after their timestamp. Distinguish immediate successful-image delete from delayed state expiry. | Read 2026-11-01 |
| [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | Official service icons for final vendor-specific figure. Mermaid files here are specifications. | Read 2026-11-01 |
| [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) | Landing page now includes flat-rate offerings; do not substitute plan pricing for an unverified subscription. Saved PAYG regionalSKUs support this estimate. | Read 2026-11-01; old PriceClass documentation link redirected here |
| [ECS target tracking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-autoscaling-targettracking.html) | Managed alarm behaviour, scaling metric suitability and scale-in/out trade-offs. | Opened 2026-11-01; student to investigate alongside actual alarm configuration |
| [Queue-based load leveling pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling) | Vendor-neutral comparison of queued demand and downstream capacity. Provider-specific examples are alternatives, not deployed Azure resources. | Opened 2026-11-01 |
| [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) | Structure trade-offs across security, reliability, performance, costs, operations and sustainability. | Opened 2026-11-01; student to apply selectively |
| [Bedrock Converse API reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html) | Request/response contract, model output and token fields; HTTP success does not guarantee app schema validity. | Investigation link; old user-guide page redirected to a new Inference guide |
| [S3 Vectors metadata filtering](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-metadata-filtering.html) | Filterable metadata and supported expressions; compare actual`$and`adapter tests. | Investigation link; verify before citing |
| [ECS task scale-in protection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-scale-in-protection.html) | Potential future protection for long-running work; not enabled in this experiment. | Investigation link |
| [Docker memory and CPU limits](https://docs.docker.com/engine/containers/resource_constraints/) | Interpret local quota/cgroup benchmark and its differences from cloud service metrics. | Investigation link; cited in existing resource report |
| [OpenCLIP source](https://github.com/mlfoundations/open_clip) | Model/pretrained implementation; use project configuration for exact version/weights actually deployed. | Investigation link |

## Prices and project evidence

- [Price-source table and calculations](cost-evidence.md): official AWS price-list URLs, SKU, unit, retrievalUTC 2026-10-31. [Saved selections](evidence/cost/prices/) allow audit without inventing a future price.
- [Calculator source PDF](evidence/cost/calculator-export-2026-10-31.pdf): export 2026-10-31, actual incomplete total 34.69 USD; embedded real shareURL retained. The Calculator's live JavaScript estimate was not readable through automated retrieval.
- [Evidence manifest](evidence-manifest.json): SHA-256 and original paths for byte-identical exports/screenshots. Use this as provenance, not a substitute for explaining the evidence.
- [Technical results](technical-results.md), [scaling report](../a3-autoscaling-results.md), [latest pricing inputs](../a3-pricing-calculator-inputs.md): engineering records; distinguish these from independent vendor documentation.

Before finalizing references: open each investigation link, record page title/access date, check it supports your particular claim, and avoid citing generic AWS pages as proof of Unframe-specific outcomes.
