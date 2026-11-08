# Gradescope autograder submission repair

Completed 1 November 2026. **Local packaging/YAML/source checks PASS, with the legacy-validator exception described below. Actual Gradescope acceptance is not yet verified.**

Upload this new file:

`D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\CAB432-A3-Submission-fixed.zip`

Size: **8,432,504 bytes (8.04 MiB)**. **337 files total: 336 under `app/`, plus YAML** (338 ZIP entries including the explicit directory entry).

SHA-256: `70a26a5f193e2244704a12453ea7d80dd894b32ecbee04ca492ca914cebb4cba`.

## Confirmed YAML repair

Removed exactly one complete resource declaration from the separate submission's `cloudInfrastructure`:

`arn:aws:bedrock:ap-southeast-2::foundation-model/google.gemma-3-12b-it`

Reason: AWS manages/owns the foundation model; it is not a student-owned and tagged cloud resource, and the official autograder rejects its ownership. No replacement ARN was invented. **All other 32 resource declarations, their order/descriptions, and metadata are unchanged**, verified by parsed equality against the previous YAML. No Planning Lambda or undeployed Planning API route was added.

Bedrock Gemma integration, prompts, parser, strict schema validation and Analyse code are unchanged. The declaration change does not remove the model from the application or stop Bedrock usage. [YAML receipt](gradescope-autograder-repair/yaml-validation.json).

Files changed in the separate submission:

- `submission-a3-infra.yml`: remove only the foundation-model declaration (33 → 32).
- `app/README-CAB432-A3.md`: update packaging guidance to 32 declarations and explain the model's exclusion; no application code change.

Original project source, original evidence, prior ZIPs, AWS resources, IAM/tags and Git history were not modified. The new report/audit artifacts live under `docs/final-submission/gradescope-autograder-repair/`; original application files remain hash-identical.

## Missing app diagnosis and previous archives

Both available previous ZIPs were inspected. Their hashes and full paths/entries are preserved in [before.json](gradescope-autograder-repair/before.json).

| Previous archive | Bytes | Files | Files under root `app/` | Actual roots |
| --- | ---: | ---: | ---: | --- |
| `CAB432-A3-Submission - test.zip` | 3,065 | 1 | 0 | `CAB432-A3-Submission - test` |
| `CAB432-A3-Submission.zip` | 8,432,546 | 337 | 336 | `app`, `submission-a3-infra.yml` |


`CAB432-A3-Submission - test.zip` has only the YAML file inside an unnecessary parent directory, with **no application files**. Its CRC passes, but its contents cannot satisfy the autograder. This matches the missing-`app/` failure; without the platform's upload receipt, we cannot independently prove which local ZIP was selected.

The previous full `CAB432-A3-Submission.zip` already has the correct root layout and 336 app files, but still declares the rejected model. The new `-fixed.zip` resolves both submission requirements without deleting application features. Neither old archive was overwritten; do not upload the YAML-only `- test.zip`.

Neither inspected ZIP includes installed dependencies, generated build/cache directories or nested ZIPs. Both CRC checks pass. The largest files in the complete previous ZIP are required museum/artwork assets:

| File | Bytes |
| --- | ---: |
| `app/mobile/assets/goma-exterior.jpg` | 765,672 |
| `app/mobile/assets/botanical-notes.png` | 533,906 |
| `app/mobile/assets/soft-form.png` | 519,491 |
| `app/mobile/assets/met-exterior.jpg` | 510,257 |
| `app/mobile/assets/riverlight.png` | 486,064 |


No evidence establishes excessive size as the cause of this `app/` failure. The complete ZIP is about 8.04 MiB; the failing-shaped test package is only 3,065 bytes. Required source/assets were retained rather than shrinking the package to YAML alone.

## Complete application snapshot

The existing restored snapshot was verified against the original project and reused unchanged: **335 original source/support files are byte-identical**, plus one packaging README. Recognition frontend, Analyse, Planning/Chat UI and services, Jobs Lambda, ECS worker, OpenCLIP, S3 Vectors, catalogues, deterministic routing/Dijkstra, native React Native source, tests, Dockerfiles, both npm manifests/locks, Python requirements and public runtime assets are present.

Both safe `.env.example` templates are retained; real environment files, credentials, dependency directories, local vector/model caches, weights, logs, build outputs and evidence copies are excluded. Reference vectors/database state remain external cloud data. Model weights are downloaded/reused during the production Docker build. Optional historical training commands require their separately downloaded datasets/checkpoints. Historical evidence scripts require the original evidence archive, not a source-package runtime dependency.

No original source module was modified to satisfy these packaging checks. **878 protected original source/evidence hashes remain unchanged**. [Source validation and manifest](gradescope-autograder-repair/source-validation.json), [dependency graph](gradescope-autograder-repair/dependency-graph.json).

## Validation performed in this repair

| Check | Result |
| --- | --- |
| YAML syntax, required fields, unique ARNs, region/account structure | PASS; 32 declarations; metadata/all other declarations preserved |
| Original source equivalence | PASS; all 335 original source/support files unchanged |
| Static relative dependencies | PASS; no unresolved paths |
| JavaScript/MJS syntax | PASS; 126 files checked |
| Root/mobile manifests and locks | PASS; match each other and original files |
| Current local scaling templates | PASS; min1/max3/target3/cooldowns30/120, scale-in enabled |
| Sensitive-information scan | PASS bounded patterns; no detected credentials, private keys, live presigned signatures or long capability tokens; safe examples also scanned |
| Existing local Gradescope validator, unchanged | **FAIL**: its blanket filename rule rejects `.env.example` |
| Audit-only copy allowing exact `.env.example` | **PASS**: all other original assertions retained, including manifest coverage, evidence, scaling and source scanning |
| ZIP integrity and layout | PASS; CRC, unique safe paths, no symlinks/nested archives; exact two roots |
| Fresh extraction | PASS; 337 files extracted; nonempty `app/` with 336 files; every hash matches |
| Official Gradescope acceptance | NOT VERIFIED; requires actual upload/acceptance |

The original `scripts/validate-a3-submission.mjs` was executed in an isolated context containing the actual submission, exact saved historical evidence inputs and its required scaling templates. Its original source was not changed. The independently confirmed false positive is the expression `!entry.name.startsWith('.env')`, which rejects the supplied public examples by filename even though their contents are safe. An **audit-only copy**, outside the submitted application, adds just `entry.name === '.env.example'` to that condition. All other assertions remain intact, and both example files were separately scanned. This is not a change to the official autograder or a claim that its checks were run locally.

The isolated validator manifest uses `matchesCurrentRoot=false` because its current directory is a fixture context; independent validation compares all 335 files to the real original repository. The validator's historical evidence checks remain historical; its pre-existing summary strings about cloud readiness are not new AWS findings. [Commands/results](gradescope-autograder-repair/existing-validator-results.json), [unmodified failure](gradescope-autograder-repair/existing-validator-unmodified.txt), [adapted PASS](gradescope-autograder-repair/existing-validator-safe-examples.json).

Commands run from the original repository, with only the explicitly scoped repair/package operations writing the separate submission:

```powershell
python docs/final-submission/gradescope-autograder-repair/repair.py --repair
python docs/final-submission/gradescope-autograder-repair/validate.py
python docs/final-submission/gradescope-autograder-repair/run-existing-validator.py
python docs/final-submission/gradescope-autograder-repair/repair.py --package
```

Runtime test/build results from the immediately preceding complete-source verification remain applicable to the **same unchanged source hashes**: 176 Node tests passed/1 skipped, 32 Python tests passed, 40 mobile tests passed, TypeScript/web export passed, and both Linux/amd64 production Docker builds passed, including Linux Node22 Jobs handler smoke. Those runtime tests were **not rerun in this YAML/document-only repair**. Host full Node tests used Node25.9.0; the optional managed Python-runtime Node case was skipped; production Lambda smoke used Linux Node22. See the [preceding report](complete-source-repackaging.md). No new cloud job, load test, Bedrock invocation, deployment or AWS operation was needed here.

## Fresh extraction proof

Extraction directory:

`D:\FlyFly\Study\Project\Unframe\docs\final-submission\gradescope-autograder-repair\extracted-12th59p8`

It contains exactly:

```text
submission-a3-infra.yml
app/
```

`app/` is a real, nonempty extracted directory. Archive and extracted-file hashes match the validated source manifest; path traversal/absolute paths, duplicate entries, symlinks and nested archives were rejected. Full receipt: [zip-validation.json](gradescope-autograder-repair/zip-validation.json). Validation-context/evidence files are outside the ZIP and outside this clean extraction directory.

## Remaining ownership/tagging risks — retained, not silently removed

The following risks come from saved resource/tag evidence dated 31 October 2026, not a fresh AWS query. The model removal fixes the specifically reported ownership failure; it does not certify every remaining ARN against the official ownership checker. Shared dependencies were retained because the application uses them and their treatment needs course/autograder clarification. Empty account/region fields alone were not used as a reason to delete another declaration.

| Resource | Retained ARN | Last recorded qualification |
| --- | --- | --- |
| API Gateway HTTP API | `arn:aws:apigateway:ap-southeast-2::/apis/4xfbhsso7a` | FAIL_PURPOSE_ASSESSMENT_2 |
| IAM service-linked role | `arn:aws:iam::901444280953:role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService` | UNVERIFIED_SHARED_OR_MANAGED |
| Application Auto Scaling policy | `arn:aws:autoscaling:ap-southeast-2:901444280953:scalingPolicy:ae38e76b-ce61-4764-9316-c9b9741c455c:resource/ecs/service/n12281212-strobe-a2/a3-n12281212-unframe-worker:policyName/unframe-sqs-backlog` | UNVERIFIED_SHARED_OR_MANAGED |
| IAM role | `arn:aws:iam::901444280953:role/Task-Role-CAB432-ECS` | UNVERIFIED_SHARED_OR_MANAGED |
| IAM role | `arn:aws:iam::901444280953:role/Execution-Role-CAB432-ECS` | UNVERIFIED_SHARED_OR_MANAGED |
| IAM role | `arn:aws:iam::901444280953:role/CAB432-Lambda-Role` | UNVERIFIED_SHARED_OR_MANAGED |
| EC2 subnet | `arn:aws:ec2:ap-southeast-2:901444280953:subnet/subnet-075811427d5564cf9` | FAIL_LITERAL_TAG_REQUIREMENT_SHARED_RESOURCE |
| EC2 subnet | `arn:aws:ec2:ap-southeast-2:901444280953:subnet/subnet-05a3b8177138c8b14` | FAIL_LITERAL_TAG_REQUIREMENT_SHARED_RESOURCE |
| EC2 VPC | `arn:aws:ec2:ap-southeast-2:901444280953:vpc/vpc-007bab53289655834` | UNVERIFIED_SHARED_OR_MANAGED |
| EC2 security group | `arn:aws:ec2:ap-southeast-2:901444280953:security-group/sg-078997505ad1c6bbc` | FAIL_LITERAL_TAG_REQUIREMENT_SHARED_RESOURCE |
| EC2 route table | `arn:aws:ec2:ap-southeast-2:901444280953:route-table/rtb-0631ac6f229b4ec46` | FAIL_LITERAL_TAG_REQUIREMENT_SHARED_RESOURCE |
| EC2 internet gateway | `arn:aws:ec2:ap-southeast-2:901444280953:internet-gateway/igw-0cbd9c45e83b6b967` | UNVERIFIED_SHARED_OR_MANAGED |
| CloudWatch log group | `arn:aws:logs:ap-southeast-2:901444280953:log-group:/aws/ecs/containerinsights/n12281212-strobe-a2/performance` | UNVERIFIED_SHARED_OR_MANAGED |


- Shared HTTP API: saved `purpose=assessment 2`, despite A3 Jobs routes; no shared tags changed.
- Course IAM roles/service-linked role: referenced by actual deployment, but student tagging/ownership validation is not established. Account membership is not proof of student-specific tags.
- Shared networking and Container Insights log group: saved tag compliance incomplete or does not meet a literal student-tag rule. Removing required dependencies or retagging shared resources would be a separate decision.
- Scaling policy: target tags do not establish separately validated policy tags; autograder handling remains uncertain.

Exact prior evidence and qualifications: [retained-ownership-risks.json](gradescope-autograder-repair/retained-ownership-risks.json), [original resource audit](gradescope-repair/resource-audit.md). No additional declaration was removed and no AWS configuration changed. If the official checker reports another ARN after this repair, review that specific result with the teaching team before changing shared-resource declarations or tags.

## Next step

Upload **`CAB432-A3-Submission-fixed.zip`** and check that Gradescope displays both root YAML and populated `app/`. Keep the other ZIPs as diagnostic artifacts, not upload choices. A correct archive does not prove the platform accepted it or eliminate every possible HTTP500/502 problem. Only the actual platform result can establish submission success.
