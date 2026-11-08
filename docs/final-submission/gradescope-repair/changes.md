# Submission repair: every changed file

Local changes only, 1 November 2026. [Machine-readable hash diff](changes.json) records before/after hashes. This list is relative to the start of this audit, not all pre-existing Git changes. No file was deleted.

| Path | Change | Reason |
| --- | --- | --- |
| `submission-a3-infra.yml` | modified | Correct final scaling and Bedrock descriptions; add the verified shared Container Insights performance log group; remove draft label. No unused S3 endpoint or Planning Lambda declared. |
| `app/README-CAB432-A3.md` | modified | Point to final state/scaling reports, replace stale current status and clarify Calculator completion. |
| `app/docs/a3-cost-and-sustainability.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/a3-recognition-evidence-checklist.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/a3-submission-audit.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/aws-deployment-readiness.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/aws-final-integration-report.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/aws-final-verification-followup.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/aws-live-deployment-report.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/aws-scaling-test-plan.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/deployment-preparation-status.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/docs/friday-deployment-checklist.md` | modified | Mark historical context and correct actionable max capacity, target and cooldown commands to 3, 3 and 30/120. |
| `app/docs/recognition-final-verification.md` | modified | Add explicit superseding final-settings notice and current-state/results links. Preserve historical observations rather than falsifying their original outcomes. |
| `app/scripts/load-recognition-jobs.mjs` | modified | Include the existing current bounded/paced load helper paired with the omitted safety tests. No load executed and no production business logic changed. |
| `app/scripts/prepare-a3-submission.mjs` | modified | Refuse overwrite of existing historical manifest; correct generated scaling descriptions. Generator not executed. |
| `app/scripts/validate-a3-submission.mjs` | modified | Require explicit new manifest/output; check exact submitted files, safe content and final scaling; preserve historical verification receipts and report unresolved cloud/tag checks. |
| `app/deployment/ecs/backlog-target-tracking.json` | modified | Correct target from 2 to 3 and cooldowns from 60/300 to 30/120; preserve metric structure and placeholders. |
| `app/deployment/ecs/scalable-target.json` | modified | Synchronize submitted template with verified minimum 1 / maximum 3. |
| `scripts/validate-a3-submission.mjs` | modified | Require explicit new manifest/output; check exact submitted files, safe content and final scaling; preserve historical verification receipts and report unresolved cloud/tag checks. |
| `scripts/prepare-a3-submission.mjs` | modified | Refuse overwrite of existing historical manifest; correct generated scaling descriptions. Generator not executed. |
| `deployment/ecs/backlog-target-tracking.json` | modified | Correct target from 2 to 3 and cooldowns from 60/300 to 30/120; preserve metric structure and placeholders. |
| `docs/final-submission/architecture-aws.mmd` | modified | Remove unsupported worker-to-S3 gateway endpoint dependency; saved worker route table uses the internet gateway. No infrastructure changed. |
| `docs/final-submission/architecture-specifications.md` | modified | Remove unsupported worker-to-S3 gateway endpoint dependency; saved worker route table uses the internet gateway. No infrastructure changed. |
| `docs/final-submission/gradescope-audit.md` | modified | Label earlier audit historical, link final audit and correct the previously suggested endpoint dependency. |
| `docs/final-submission/README.md` | modified | Link current 319-file/33-resource validation, final checklist and change log; distinguish preserved original snapshots and unresolved readiness. |
| `docs/final-submission/report-checklist.md` | modified | Record completed local repairs and remaining authentication/shared-tag blockers; correct the earlier endpoint suggestion. |
| `docs/final-submission/validate-pack.py` | modified | Validate the explicit repaired source manifest and write a new receipt; preserve original preparation receipts and evidence checks. |
| `app/docs/a3-autoscaling-results.md` | added | Include existing final scaling result report referenced by current submission guidance; original evidence remains external and unchanged. |
| `app/docs/submission-current-state.md` | added | Add authoritative current configuration and reproduction commands, external state requirements and deployment limitations. |
| `app/tests/scaling-load.test.js` | added | Include existing missing mocked safety/pacing tests required by the submitted test commands. |

## New audit artifacts

All paths below are under `docs/final-submission/gradescope-repair/`. These are new audit outputs, not replacements for original evidence.

- `audit.py`: Reproducible read-only static/source/evidence checks and saved-evidence resource review; writes only new audit reports.
- `before.json`: Starting hashes for submission files and 577 original evidence files.
- `authentication.json`: Sanitized failed identity check (ExpiredToken); contains no credentials.
- `validator-before.txt`: Initial validator failure against the historical manifest.
- `source-manifest.json`: Final 319-file source manifest and infrastructure hash.
- `static-validation.json`: Dependency, source, secret-pattern and evidence-integrity results.
- `resource-audit.json`: Every declared ARN, region treatment, saved tags, evidence paths and qualifications.
- `resource-audit.md`: Readable resource-by-resource review.
- `changes.json`: Changed submission/tool/document paths with before/after hashes.
- `changes.md`: This complete change log.
- `submission-validation.json`: New existing-submission-validator receipt; readiness remains false.
- `pack-validation.json`: New pack validator receipt; original copies/manifests preserved.
- `regression-tests.txt`: 23 passing local mocked tests; no cloud workload.
- `final-checklist.md`: Final PASS/FAIL report, commands, impact review and unresolved requirements.

Runtime source directories (`server`, `shared`, `worker`, `local-ai`, `mobile`) and dependency versions are unchanged. Original verification/evidence hashes remain unchanged. The omitted safety test and current matching helper are test/reproduction tooling. No AWS writes, deployment, cloud jobs, load tests, Git commit or push occurred.
