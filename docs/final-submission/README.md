# Unframe final preparation pack

Prepared 1 November 2026. **Factual working materials, not assessment report prose.** The student must write the report, make the final diagrams and record the demonstration.

| Start here | Use |
| --- | --- |
| [Evidence index](evidence-index.md) | F1–F20, results, timestamps, sufficiency and gaps |
| [Technical results](technical-results.md) | Measurements and their limitations |
| [Architecture specifications](architecture-specifications.md) | Two editable Mermaid specifications and AWS icon guidance |
| [Cost evidence](cost-evidence.md) | Actual Calculator export, discovered share URL, reconciliation and geographic scenarios |
| [Video checklist](demo-checklist.md) | Eight segments totalling 4 minutes 40 seconds |
| [Gradescope audit](gradescope-audit.md) | Source hashes, resource declarations, tags and remaining corrections |
| [Report checklist](report-checklist.md) | Official headings, evidence placement and student reflection prompts |
| [References](references.md) | Official requirements and technical sources to read/cite |

## Readiness

- **Evidence:** historical real recognition, Bedrock, scaling and caching evidence ready; copies in `evidence/`. F1 still needs the student's requirements analysis and final diagrams. Core recognition passes; optional browser confirmation remains partial.
- **Diagrams:** two `.mmd` specifications ready for review/import. Final AWS diagram still needs service icons and A4 readability review.
- **Costs:** real Calculator PDF found: $34.69/month, incomplete. Its embedded share URL is preserved, not invented. Complete missing services and reconcile assumptions before citing a final total.
- **Video:** timed checklist ready; recording remains the student's task. Use dated evidence; do not replay old results as a new job.
- **Gradescope:** [Final local repair](gradescope-repair/final-checklist.md) validates 319 submission files and 33 declarations. Scaling templates and current guidance are corrected; application runtime source is unchanged. Fresh AWS verification is blocked by ExpiredToken, and shared-resource tag compliance remains unresolved. Overall readiness is not a PASS.
- **Missing screenshots:** live configuration views and a sanitized Bedrock result/log view are not in the reviewed PNG collection. JSON evidence is available; see F2–F13/F17/F19 in the index. The existing scaling graphs are genuine AWS-rendered charts, not console screenshots.
- **Manual tasks:** refresh the local AWS session for read-only checks, resolve shared-resource tag interpretation without unauthorized retagging, complete Calculator, review diagrams, author PDF (maximum 30 pages excluding references/appendices), record 4–5 minutes, upload to Gradescope/Canvas and click Submit.

## Provenance and scope

AWS evidence was collected **31 October 2026**, mainly 07:00–09:00 UTC. This preparation did not re-query AWS, create jobs, invoke Bedrock, run tests/load, change infrastructure, edit application source, deploy or commit. A saved healthy state is not a fresh uptime check on 1 November.

[evidence-manifest.json](evidence-manifest.json) records original absolute paths, byte counts and SHA-256 hashes for 93 byte-identical copies. Originals remain untouched. [source-file-audit.csv](source-file-audit.csv) lists all 316 submitted files. Derived audit JSON and the Calculator text extraction are labelled separately. `visual-review-contact-sheet.png` is a review aid, **not assessment evidence**; use original-size copies instead.

Capability tokens, presigned URLs, credential files, raw model responses and private images are excluded from the evidence copy list. The text-pattern scan found one synthetic test URL; manual inspection confirmed it is a redaction fixture, not a live secret. Automated scans cannot prove absence of every possible secret.

Use UTC timestamps in tables. The scaling PNG axes use **Brisbane AEST = UTC+10**, not Sydney daylight-saving time. Cite the observation date in captions. Do not treat a filesystem modification time as an AWS event timestamp.

[Local pack validation](pack-validation.json) verifies links, F1–F20 coverage, evidence hashes, unchanged submission files, the cost sum and the 280-second video plan. This is documentation validation, not a fresh application test.

The preceding manifests/receipt describe the original preparation snapshot. After the authorized submission repair, use the [new source manifest](gradescope-repair/source-manifest.json), [new validation](gradescope-repair/submission-validation.json), and [per-file change log](gradescope-repair/changes.md). Original evidence and manifests were preserved. The earlier proposed S3 gateway endpoint addition was rejected after route-table inspection: it is not on the worker's public route table; only the shared Container Insights performance log group was added.
