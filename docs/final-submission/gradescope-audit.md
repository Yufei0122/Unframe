# Gradescope submission audit

> Historical pre-repair audit. The authorized local repairs and final PASS/FAIL checklist are now in [gradescope-repair/final-checklist.md](gradescope-repair/final-checklist.md). Original findings below are retained for traceability. In particular, the proposed S3 gateway endpoint addition was disproved by the worker route-table evidence; it was not added. The shared performance log group was added, making 33 declarations; the repaired app contains 319 files.

**Status: source core present; corrections/review required before final submission.** Static audit on 2026-11-01 against real 2026-10-31 AWS collections; no application edits, resource changes, installs, deployments or new test runs. [Machine audit](source-audit.json), [every-file CSV](source-file-audit.csv), [resource IDs](resource-id-audit.json).

## Source snapshot

| Check | Finding |
| --- | --- |
| Count | **315 original manifest files + README-CAB 432-A3. md =316 files**, not 315 total. All 315 original hashes still match. |
| Runtime consistency | Server, worker, local-ai, mobile and shared runtime source matches current repository files in the snapshot. Five non-runtime/tooling files differ; listed below. |
| Included | Root/mobile package+lockfiles, Node 22 entrypoints, handlers, worker Dockerfile/dockerignore, Python requirements, shared catalogues/assets, tests, local/planning source and configuration examples. |
| Static references | No unresolved literal relative JS/TS imports found. This does not cover all dynamic paths, downloaded assets or optional training inputs. |
| Node dependencies | Both package manifests match corresponding lockfile root dependencies/devDependencies; all declared packages present in locks. `yaml` is intentionally resolved from mobile via createRequire in the validator, and exists in mobile lock. `@aws-sdk/util-dynamodb` exists transitively in root lock. |
| Python/model dependencies | Docker installs pinned CPU torch 2.8.0/torchvision 0.23.0 and local-ai requirements; downloads public OpenCLIP weights at build time. Weights/node_modules/virtualenv intentionally absent from submission. A networked clean build remains necessary to reproduce. |
| Secrets | No confirmed AWS credentials/private keys/live signed URLs/read capabilities found. One scanner hit is the deliberately invalid `private.example` URL in `tests/aws-diagnostics.test.js`; preserve the useful redaction test. No . env/credential file is included. Pattern scanning is not an absolute guarantee. |
| Suitability of 315 | Application code/assets/test fixtures/config/docs are relevant. Local planning and optional-provider source can remain if scoped as future work; do not claim these are deployed. Historical docs/tooling need review, not deletion. |
| Evidence-tool dependencies | Some scripts require root YAML, `verification/`, ignored vector fixture/model datasets outside app. A standalone app install does not reproduce every historical evidence script. Runtime build does not need those receipts. |

## Exact stale or missing items

1. **`submission-a3-infra.yml` scalable-target description says maximum four. Actual maximum is three.** Correct the description in the eventual submission; no AWS action required. This task leaves the original unchanged.
2. **`app/deployment/ecs/scalable-target.json` still has MaxCapacity 4.** Root deployment template is now 3. Do not apply the stale app template. Reconcile the submission copy before packaging.
3. Other snapshot differences: `app/docs/a3-recognition-evidence-checklist.md`, `app/docs/aws-scaling-test-plan.md`, `app/scripts/collect-a3-price-inputs.mjs`, `app/scripts/load-recognition-jobs.mjs`. They predate the final scaling/pricing changes. The README is intentionally submission-only. Keep the historical 315 manifest as history; create a new manifest if the student refreshes any files.
4. Latest scaling/cost reports and tools are not all in the old app snapshot. Add appropriate final supporting source/docs to the eventual submission if required; do not imply the old load generator produced the later pacing evidence unchanged.
5. `app/README-CAB432-A3.md` points to copied historical results and says Calculator share link pending. A real exported share URL has now been found, but its estimate needs completion. Historical documents can be retained if clearly dated and superseded.
6. **Inventory omits the read-confirmed S3 gateway endpoint** `vpce-007b39b34446e234b` and shared Container Insights performance log group `/aws/ecs/containerinsights/n12281212-strobe-a2/performance`. SS.docx requires resources the solution depends on; review adding their actual identifiers and describing shared ownership. Endpoint evidence: [vpc-endpoints.json](evidence/cost/vpc-endpoints.json). Do not invent a new endpoint or alter shared tags.
7. Regional/global/provider-managed exceptions require course interpretation. CloudFront, IAM and dashboard ARNs are global; a Bedrock foundation model is AWS-owned and cannot receive student tags like a user bucket. Shared networking/course IAM/service-linked roles may not be individually taggable by this account.

## Resource identifiers and tags

- YAML parses; 32 unique declarations have type, ARN and purpose description; metadata username is`n12281212@qut.edu.au`.
- All 32 declared identifiers match the saved actual inventory, including task revision 6; regional ARNs are Sydney, with explicit global/S3 exceptions. This is **comparison with collected evidence**, not 32 newDescribe calls.
- [Tag evidence folder](evidence/tags/): dedicated buckets, queues, ECR, JobsLambda, DynamoDB, vector bucket/index, worker service/task, CloudFront, dashboard and log groups have exact`purpose=assessment 3` and expected`qut-username` in the saved reads.
- **Shared API`4xfbhsso7a` remains`purpose=assessment 2`.** Not a clean tag PASS. Confirm teaching-team treatment/authorised correction; this preparation must not retag it. FAQ explicitly permits cluster reuse without relabelling, but does not establish a blanket API tag exemption.
- Shared cluster collection itself shows`assessment 3`; do not change it to match older narrative. Worker log group also has an extra leading-space key` purpose`; the correctly spelled`purpose` key is present. No cleanup requested.
- All 32 dependencies do not have individually verified compliant tags. Shared/provider-managed roles, alarms/networking and recently identified endpoint require review. Gradescope validates declared existence/tags/region, not correctness of the whole application.
- No Planning Lambda declared. Existing planning source/templates are future work; no unsupported live deployment claim should appear in the report or README.

## Intended package layout and manual check

```text
submission-a3-infra.yml
app/
  README-CAB432-A3.md
  package.json
  package-lock.json
  server/
  worker/
  local-ai/
  shared/
  mobile/
  tests/
  scripts/
  deployment/
  docs/
```

- Follow the current Gradescope upload interface/template; avoid an unintended extra parent directory. Do not rename the infrastructure file or omit app source.
- Do not include credentials, `.aws`, `.env`, model caches, node_modules, visitor images, raw logs, presigned links or read tokens. The final evidence pack is report support, not a replacement for app source.
- Review stale docs/templates and omitted dependencies above; request course guidance for shared tags. Run a clean install/build only if the student chooses to refresh source; no prior full-test receipt proves future modifications pass.
- Submit report PDF and actual screen recording to **Canvas**, YAML/source to **Gradescope**. No upload was performed by this task.
