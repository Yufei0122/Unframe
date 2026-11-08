# Student report writing checklist

**Write the report yourself. These are headings, evidence prompts and facts to check—not report paragraphs.** Source: supplied `SS.docx` (formal requirements paragraphs 0–203 and FAQ), plus the four 10-point marking criteria supplied in the conversation. [Requirements/reference map](references.md).

Maximum **30 pages including diagrams, excluding references and appendices**. Executive summary is one page. Captions and screenshot/diagram text must remain approximately 12 pt at final A4 size. Use landscape or focused diagrams where needed. Do not bury important design reasoning or outcomes in appendices.

## Required headings and a suggested page budget

| Heading from official structure | Suggested pages, maximum 30 total | Evidence / student tasks |
| --- | ---: | --- |
| Title page |1| `CAB432 Assignment 3 2026`; Unframe subtitle; student's name/ID; declaration of AI use and acknowledgements. |
| Executive summary |1| Student's own concise purpose, actual scope, architectural decisions and demonstrated outcomes. Do not claim all optional UI features work. |
| Table of contents |1| Generate after headings/page numbers are final. |
| Introduction |3| Problem statement, users, functional/non-functional requirements and scope; F18 candidate screenshot. Explain genuine cloud need, not just a service list. |
| Vendor-agnostic architecture |5| F1 generic diagram; patterns and alternatives; scaling, async workflows, observability and limitations. |
| Vendor-specific implementation |6| AWS-icon version of diagram; actual IDs/configuration; F3–F10, F13, F17, F20. Include security/network boundaries and course restrictions. |
| Application implementation |7| End-to-end flow, data/message schemas, errors, performance/evaluation; F11, F12, F14–F16, F18, F19. Explain interactions; do not paste source code. |
| Cost and sustainability |3| Completed Calculator per-service totals and working public link; 50-user assumptions; A/B geography; burst costs and sensitivity. |
| Reflection |2| Student's own investigation, decisions, setbacks, documentation and lessons. |
| References and appendices |Excluded| Sources actually read/cited; detailed exports/manifests without secrets. |

Suggested main-body total 29 pages leaves 1 page for layout. This is guidance, not an additional course rule.

## Requirements and vendor-neutral reasoning — rubric 10 points

- Define core functional needs: select museum, submit photo, async status, ranked known-artwork candidate, visitor confirmation, optional vision interpretation, durable bounded result.
- State cloud scope and exclusions: recognition deployed; optional Analyse demonstrated; confirmation interpretation endpoint incomplete; cloud planning undeployed.
- Make non-functional targets explicit and distinguish **design targets** from measured achievements: privacy, reliability, burst handling, response/queue latency, cost, maintainability and university CPU/memory constraints.
- Discuss at least 8 relevant official pattern/category choices, covering required storage, caching, communication, compute, non-Lambda scaling and non-Lambda load distribution. Candidates: structured storage, object storage, edge cache, API gateway, queue, polling, serverless job control, containers, metric scaling, worker-pull, event-driven processing, monitoring, garbage collection, idempotency/retries.
- Explain alternatives rather than just naming patterns: synchronous inference vs async request/reply; worker-pull vs dispatcher/ALB; structured key-value state vs relational database; shared external data vs per-container filesystem; warm minimum 1 vs scale-to-zero.
- Show how a queued workload maps to a capacity metric. Target 3 ×0.548 s≈1.65 s nominal queued service time, but actual cold starts/alarm delays yielded much larger burst waits.
- F1 remains student-authored analysis. Prepared Mermaid specifications are factual starting points, not a substitute for reasoning.

## AWS design and integration — rubric 10 points

- Map each generic component to the deployed service and explain why it fits the need.
- Compare ECS Fargate vs EC 2/container hosting vs Lambda inference: model-loading transient memory, warm model, packaging/startup, billed idle capacity, operations and quotas. Do not claim an untested alternative cannot work.
- Compare S3 Vectors with a relational vector extension/OpenSearch-style search service: small 15-reference catalogue, filter schema, per-query/storage cost, managed operations, query limitations and migration portability.
- Compare SQS Standard to FIFO/direct invocation: independent jobs, duplicates, conditional lease and dead-letter isolation. S3 events are at least once; do not claim exactly-once processing.
- Explain min 1/max 3, target tracking vs step scaling, high/low alarm evaluation and cooldowns; actual task count evidence matters more than configured policy.
- Security: temporary signed uploads, private image bucket, capability-protected reads, service roles, input limits, no raw image/token logging. Recognise that public job creation is not user authentication or proven abuse protection.
- Disclose static frontend public-read origin exception and shared API tag issue. Do not draw private OAC, userpool login, WAF, NAT or ALB that is not deployed.
- IAM roles are course-provided, not demonstrated least-privilege policies. Do not claim permissions were narrowed when that was prohibited.
- Use appropriate AWS icons and figure-readable identifiers. Include model selection/configuration without saying Bedrock runs on every scan.

## Application implementation and evaluation — rubric 10 points

- Describe create response, signed upload, S3 pointer event, conditional claim/lease, normalized 512 D embedding, filtered QueryVectors, ranked result, DynamoDB persistence, cleanup and polling. Use redacted structural examples, not live tokens or raw logs.
- State exact model/pretrained/threshold and why configuration/catalogue hashes prevent incompatible reference comparisons.
- Explain `1 - cosine distance`; do not compare raw distance with 0.80. Top 3 is the returned candidate cap, not necessarily the SDK retrieval topK.
- Analyse failure ordering: durable result before cleanup/ack; visibility 300 s, job 180 s, embedding 30 s after readiness, optional analysis budget 125 s; existing retries and DLQ. Cite source/test boundaries.
- F12: one real Gemma invocation succeeded and result persisted; strict schema still enforced. Do not invent the precise historical v4 invalid field if it was never captured.
- Distinguish 171 local root tests, 40 mobile tests, 9 focused browser passes/1 skip, mocked local Docker limits, real 30-job batch and 883-job scaling run.
- Present 883/883 as repeated-reference success; mean 548 msprocessing vs≈88 smean created-to-complete under backlog. No diverse-photo accuracy or 50 interactive-users certification.
- Use F14 peak 321 published /337 direct; F15/F16 actual 1→3→2→1 and Successful activities. Explain why 30 jobs/18 s did not trigger 3 one-minute breaches.
- Acknowledge lack of active-job scale-in protection, unreadable quota, single-region/shared-account dependencies, mixed recognition/Analyse service times, optional confirmation failure and historical 3-message DLQ.
- Cost: complete Calculator before using its total; old $34.69 export omits services. Gross worksheet $97.07 is a forecast, not that export's total. Do not add S3 Vectors twice.
- Sustainability: compare measured resource sizing, cache, expiry and actual scale-in with idle baseline; no invented carbon estimates.

## Communication and independent learning — rubric 10 points

- Every major outcome should point to dated project-specific evidence and a meaningful limitation.
- Caption each figure with purpose, resource, date/window/timezone and what it does **not** prove. Reference the figure from the student's prose.
- Keep CloudWatch minute samples separate from direct service observations; avoid implying precise instantaneous counts.
- Reflection prompts: Which official S3 Vectors filter documentation changed the adapter? What did local resource tests reveal about model startup vs inference? Why did fenced JSON parsing not by itself guarantee schema validity? How did actual alarm periods change the load-test design? Which Calculator omissions changed the cost estimate?
- Describe what **you personally learned and decided**; do not adopt invented first-person experiences from generated material. Document tool/AI assistance accurately in the declaration.
- Consider future work based on evidence: safer polling/backoff, dedicated API/tag ownership, bounded log retention, active-work scale-in protection, varied-image benchmark, service-level queue-age alarms and authorized planning transport. Do not implement or present it as already deployed.

## Outstanding manual checks

- [x] Local submission corrections completed: scaling settings aligned, missing performance-log dependency included, source completeness checked. The endpoint was excluded after route-table inspection; it is not used by the worker.
- [ ] Resolve remaining [final audit blockers](gradescope-repair/final-checklist.md): fresh AWS checks after local session refresh, shared API tag conflict and shared/provider-managed dependency tag treatment. No AWS tags changed.
- [ ] Open Calculator public link; fill missing services; reconcile allowances/custom metrics/GuardDuty; export final A/B totals and record final link.
- [ ] Render/review diagrams; use official icons for AWS diagram; check 12 pt labels atA 4. Review actual screenshots rather than contact sheet.
- [ ] Decide whether machine exports alone are adequate for configuration evidence or capture additional **read-only** screenshots. Do not create new successful-test evidence by simulation.
- [ ] Confirm latest Canvas/Gradescope instructions and due date directly; no due date was inferred from the local file.
- [ ] Write report yourself, verify citations and page count; create actual 4–5 minute recording; submit to correct portals and confirm completion.
