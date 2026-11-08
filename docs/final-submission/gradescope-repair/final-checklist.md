# Final CAB432 A3 Gradescope audit and local repair

Audit date: 1 November 2026. **Local submission checks: PASS. Overall Gradescope readiness: FAIL / blocked pending AWS verification and tag resolution.** No application business logic, AWS resources, IAM policies, original evidence, jobs, load, deployment or Git history changed.

## Final checklist

| Requirement | PASS / FAIL | Evidence / limitation |
| --- | --- | --- |
| Final scaling configuration | **PASS** | Submitted and root templates: min1/max3, target3, cooldowns30/120, scale-in enabled; stale actionable Friday commands corrected. Historical reports now explicitly superseded. |
| Complete application source | **PASS static audit** | 319 files; server/shared/worker/local-ai/mobile runtime files unchanged; all required source directories represented. Missing scaling safety test added with its current tested helper. |
| Dependencies and configuration | **PASS static audit** | Both npm manifests match their lockfile declarations; packages present in locks; no missing literal relative imports; Dockerfiles, Python requirements and handler/build configuration present. No clean install/build was claimed or required for documentation repairs. |
| Reproduction guidance | **PASS** | `app/docs/submission-current-state.md`: Node22 install/check/test, web export, Linux worker build, Node22 ZIP build, required non-secret environment variables and external vector-state boundary. |
| Declared resources / descriptions | **PASS saved-evidence review** | 33 unique declarations; revision6/v5 correct; performance log group added; no unused endpoint/NAT/Planning resource invented. See [all resources](resource-audit.md). |
| Fresh existence/account/region verification | **FAIL — blocked** | Default profile returned **ExpiredToken**. Saved account is901444280953; regional ARNs Sydney; global identifiers distinguished. Frontend bucket has explicit Sydney location receipt; private image bucket's separate location read remains pending. |
| Dedicated resource tags | **PASS historical evidence for19 resources** | Saved `purpose=assessment 3` and expected `qut-username`; not a claim of current fresh verification. |
| Shared API tag | **FAIL** | API`4xfbhsso7a` last verified `purpose=assessment 2`; official FAQ allows `/a3` route reuse but does not give an explicit tag exemption. No retagging performed. |
| Other dependency tags / Gradescope handling | **FAIL — unresolved** | Four shared network declarations lack literal student tags in saved reads; eight shared/managed dependencies have unverified or special tag treatment; AWS-owned Bedrock model is not student-taggable. Do not alter course resources. |
| Planning Lambda excluded | **PASS** | No Planning Lambda ARN or cloud planning endpoint declared. Local source/templates remain clearly future work; ZIP smoke import is not a deployment. |
| Secret and private-capability scan | **PASS bounded scan** | No actual access keys, session tokens, private keys, signed upload signatures or long literal read capabilities detected; no .env/credential/cache directories. Synthetic `private.example` redaction fixture retained. No claim that pattern scanning proves absence of every possible secret. |
| Existing submission validator | **PASS after repair** | [Receipt](submission-validation.json); 319 files/33 resources. Original run failed because it compared evolved source to the old315-file manifest. New explicit manifest/output avoids overwriting old evidence. |
| Pack/evidence validation | **PASS** | [Receipt](pack-validation.json); original93 evidence copies retain hashes; source checked against new manifest. All577 original verification/evidence files checked unchanged. |
| Relevant regression tests / syntax | **PASS** | 23/23 AWS Jobs and mocked load-safety tests; npm app syntax check and validator/generator syntax checks pass. No load or AWS jobs submitted. Host Node25.9.0; production Node22 Linux artifacts were not rebuilt. |
| Submission structure | **PASS local** | Root `submission-a3-infra.yml` plus `app/`; dependencies are installed from locks, not bundled node_modules. Report/video submitted separately to Canvas. No upload performed. |

## Shared API decision and impact

Official source: `D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\SS.docx`. Paragraph33 requires Sydney and`purpose=assessment 3`; paragraph34 discusses keeping assessment2 tags until an A2 presentation is finished. FAQ252–256 permits reusing the HTTP API with `/a3` prefixes. FAQ258 and263 explicitly exempt Cognito/cluster relabelling; **the supplied API answer does not state that exemption**. Paragraph197 says Gradescope checks existence/tags/region.

Actual saved API name is`n12281212-strobe-api`, ID`4xfbhsso7a`. Its tag is attached to the API resource as a whole, not only the A3 routes. The supplied route export is filtered to A3, so it cannot establish the full current A1/A2 route impact. Changing only a tag would not rewrite route definitions, but could affect course cleanup selection, assessment ownership/cost allocation or tag-based authorization/automation. Those dependencies and A2 presentation status have not been confirmed; effects beyond routing remain uncertain.

**Action:** obtain teaching-team guidance on the shared API and shared/provider-managed declarations. Any future retagging needs explicit approval identifying the whole shared resource and its impact. This task prohibits AWS modifications, so no tag-change approval was requested and none was applied. Do not conceal the mismatch by removing an actually used API from the inventory or by putting a false tag in YAML.

## Dependency correction discovered during repair

The earlier preparation audit suggested adding S3 endpoint`vpce-007b39b34446e234b`. Inspection of `verification/2026-10-31/pricing-calculator/routes.json` and `aws-final/network-routes.json` shows worker subnet route table`rtb-0631ac6f229b4ec46` contains only local and internet-gateway routes. Endpoint routes belong to other route tables. **It is not a verified Unframe worker dependency and is excluded.** The AWS diagram specification was corrected accordingly. No AWS endpoint was deleted or modified.

Confirmed omitted dependency added: `/aws/ecs/containerinsights/n12281212-strobe-a2/performance`, supported by `pricing-calculator/logs-ci.json`. It is shared, has one-day retention, and supports metrics used by scaling. Its student-tag status is not known. Existing shared VPC/network/course roles remain declared honestly, with exceptions requiring course interpretation.

## Files changed

See [every changed path and reason](changes.md) and [hash diff](changes.json). Three application-package additions: final current-state/reproduction guide, existing final autoscaling report, and the missing scaling safety test. Existing load helper refreshed to match that test. No production runtime file changed and no dependency versions changed.

Original historical reports and source/evidence manifests remain available. Only submission copies received superseding notices/current commands; original verification data was never regenerated. New audit outputs live in this directory.

## Exact checks executed

```powershell
# Initial validator: failed old-manifest comparison, saved in validator-before.txt
node scripts/validate-a3-submission.mjs

# Current static audit and validators (no AWS operations)
python docs/final-submission/gradescope-repair/audit.py
node scripts/validate-a3-submission.mjs --manifest docs/final-submission/gradescope-repair/source-manifest.json --output docs/final-submission/gradescope-repair/submission-validation.json
python docs/final-submission/validate-pack.py --submission-manifest docs/final-submission/gradescope-repair/source-manifest.json --output docs/final-submission/gradescope-repair/pack-validation.json
node --test app/tests/scaling-load.test.js app/tests/aws-jobs.test.js
npm.cmd --prefix app run check
node --check scripts/validate-a3-submission.mjs
node --check scripts/prepare-a3-submission.mjs
node --check app/scripts/validate-a3-submission.mjs
```

Read-only identity check attempted with profiledefault, regionSydney, expected account901444280953. The sandbox's implicit profile location was absent; explicitly using the standard local AWS config/credentials paths reached STS and returnedExpiredToken. Credential contents were never printed or copied. Further AWS requests were stopped rather than generating repeated failures. [Sanitized authentication result](authentication.json).

## Remaining steps

1. Refresh the default profile locally; do not paste credentials. Recheck all declared resources/tags/locations read-only and preserve new dated receipts.
2. Resolve shared API and shared/course/provider-managed tagging or inventory acceptance with teaching staff. No AWS edits under this task's authorization.
3. Review this local package and current-state guide; retain the exact final manifest when uploading. A stale historical validator receipt is not the current audit.
4. Submit YAML/source to Gradescope only when satisfied with the remaining restrictions; do not claim a clean cloud/tag PASS now. The report/video and Calculator reconciliation are separate student deliverables.
