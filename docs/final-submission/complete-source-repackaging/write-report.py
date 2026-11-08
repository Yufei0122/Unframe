from pathlib import Path
import json
OUT=Path(__file__).resolve().parent
i=json.loads((OUT/'source-inventory.json').read_text())
v=json.loads((OUT/'validation.json').read_text())
z=json.loads((OUT/'zip-validation.json').read_text())
old=json.loads((OUT.parent/'gradescope-simplification/final-source-validation.json').read_text())
prior=json.loads((OUT.parent/'gradescope-simplification/before.json').read_text())
new=[p for p in i['files'] if 'app/'+p not in prior['files']]
comparison='# Restoration comparison\n\nThe prior separate directory and ZIP were absent when this task began. Comparison uses saved earlier hashes; every restored source byte comes from the current original repository.\n\n## Earlier removed files restored from original\n\n'+''.join(f'- `{p}`\n' for p in i['restoredPreviouslyDeleted'])
comparison+='\n## Earlier modified files now recopied from original\n\n'+''.join(f'- `{p["path"]}`\n' for p in i['previousModifiedCompared'])
comparison+='\n## Additional original source/support files beyond the earlier 319-file snapshot\n\n'+''.join(f'- `app/{p}`\n' for p in new)
comparison+='\n## Full restored original-source inventory\n\n'+''.join(f'- `app/{p}`\n' for p in i['files'])
comparison+='\n`app/README-CAB432-A3.md` is new packaging-only guidance. The simplification-only tests `submissionScope.test.ts` and `submission-scope.spec.js` are not original source and are not copied. The old copy-only `docs/submission-current-state.md` is superseded by this README. No existing source file was deleted.\n'
(OUT/'restoration-comparison.md').write_text(comparison,encoding='utf-8')
report=f'''# Complete Unframe source repackaging for CAB432 A3

Completed 1 November 2026. **PASS: complete original application snapshot, local validation and ZIP packaging.** Fresh AWS configuration and Gradescope upload acceptance are **not verified**.

Final ZIP: `{z['path']}`.
Size: **{z['bytes']:,} bytes ({z['bytes']/1048576:.2f} MiB)**.
SHA-256: `{z['sha256']}`.

## Source restoration and provenance

Original project: `D:/FlyFly/Study/Project/Unframe`.
Restored submission: `{i['destination']}`.

The prior simplified directory, original ZIP and recognition-only ZIP were absent from the previously recorded A3 location when this task began. No existing source directory or archive was overwritten or deleted. The saved simplification inventory was used to identify previous changes; **all application source was recopied from the original repository**, not recovered from the incomplete copy or a draft patch.

| Count | Result |
| --- | --- |
| Relevant original source/support files selected | **335** |
| Restored original files with byte-identical hashes | **335** |
| New packaging-only guidance | **1**, `app/README-CAB432-A3.md` |
| Restored `app/` file count | **336** |
| Files including root YAML | **337** |
| ZIP entries including explicit `app/` directory | **338** |
| Previously deleted Planning-related files restored | **25/25** |
| Previously modified files with an original counterpart recopied | **{len(i['previousModifiedCompared'])}** |
| Protected original source/evidence hashes checked | **878 unchanged** |

“Original source count” means the selected complete relevant source/support set, excluding generated dependencies, caches, model runs and evidence copies; it is not the total number of files on disk. No application business logic, dependency versions, tests, recognition thresholds, model identity or original source file was edited. Original source/evidence remained unchanged. Only the requested report and new audit helpers/receipts were added under original `docs/final-submission/`.

The [complete restoration comparison](complete-source-repackaging/restoration-comparison.md) lists all 25 restored files, earlier shared modifications, additional support files and the full source inventory. [source-inventory.json](complete-source-repackaging/source-inventory.json) records every original hash, byte count and exclusion.

## Restored Planning/Chat and shared functionality

Planning UI and navigation: `mobile/App.tsx`, `AIPlanner.tsx`, `AIItinerary.tsx`, `Explore.tsx`, `SavedRoutes.tsx`, legacy `Discover.tsx`, `PlanningAnswer.tsx`, `planningStream.ts`, full state/model/profile helpers and AI clients. Relevant original browser and unit tests are restored, not rewritten to omit Planning.

Planning backend/source-only cloud transport: `server/ai/chat.js`, `routes.js`, `graph.js` (including Dijkstra), `planning-constraints.js`, `planning-status.js`, `server/cloud/planning.js`, original HTTP routing/shared types/provider services, planning CLIs and deployment templates. `tests/aws-planning.test.js`, `tests/planning-runtime.test.js`, `mobile/tests/planningStream.test.ts` and `mobile/e2e/planning.spec.js` are present.

Recognition, strict Bedrock Analyse, museum selection/catalogues, camera/Scan, confirmation handling, frontend navigation, profile state, native React Native/Expo source, museum maps/assets and shared services match the original exactly. Original `server/`, `worker/`, `shared/`, `mobile/`, `local-ai/`, `scripts/`, `tests/`, `deployment/`, runtime/reproduction documentation, root manifests, safe environment examples and model-code licenses are included. No existing native platform source directory was excluded; this repository uses Expo/React Native source.

The student confirms deployed CloudFront still exposes Planning UI. Restoring its source addresses the mismatch created by simplification. This is **not** a byte-level comparison with the deployed CloudFront bundle/commit, nor proof of an operational cloud Planning backend. Planning Lambda source/templates are retained, but that Lambda remains undeployed and absent from the resource declaration.

## Exclusions

Excluded only local/generated/sensitive or redundant material: root/mobile `node_modules`, `.venv`, `.local-ai`, `.test-data`, `.expo`, `dist`, build/artifact folders, bytecode/cache folders, temporary test results/logs, generated ZIPs, downloaded model weights/checkpoints/training runs, generated local `data/artwork-embeddings.json`, `.git`, editor-local settings, real `.env` files, credentials and original/redundant evidence archives. Exact scanned exclusions are in the inventory; absent examples such as `.pytest_cache` are exclusion rules, not claims of files deleted.

Required public artwork/map assets, fixtures, both package locks, Python requirements, both production Dockerfiles and safe `.env.example` files remain. The two model-code license files are included. Optional historical training/evaluation commands require separately regenerated/downloaded model datasets and checkpoints; generated experiment outputs are not submitted as source. Current training implementations are in `local-ai/`; archived copies inside training runs are redundant.

Original `verification/` and `docs/final-submission/` evidence packs remain external, avoiding recursive/redundant copies. Their historical audit scripts are retained, but those scripts may require the original evidence archive when deliberately run. Normal application build/runtime imports do not depend on that archive. The source-only templates are preparation material, not authorization to deploy missing services.

Fresh validation generated dependency directories and a web export in the separate copy. These were removed after testing, with resolved-path checks confining cleanup to that copy. Every copied source hash still matches its original. Reinstall dependencies to rerun tests.

## Tests and build results from restored `app/`

| Check | Result | Receipt |
| --- | --- | --- |
| Root locked dependency install | PASS, 81 packages | [root-install.txt](complete-source-repackaging/root-install.txt) |
| Mobile locked dependency install | PASS, 822 packages; existing transitive deprecation warnings | [mobile-install.txt](complete-source-repackaging/mobile-install.txt) |
| Manifest/lock consistency | PASS, both unchanged from original | [validation.json](complete-source-repackaging/validation.json) |
| Node syntax check and full tests | PASS: **176 passed, 1 skipped, 0 failed** of 177 | [node-check.txt](complete-source-repackaging/node-check.txt), [node-tests.txt](complete-source-repackaging/node-tests.txt) |
| Python tests against restored source | PASS: **32/32** | [python-tests.txt](complete-source-repackaging/python-tests.txt) |
| Mobile unit tests | PASS: **40/40** | [mobile-tests.txt](complete-source-repackaging/mobile-tests.txt) |
| TypeScript | PASS | [typescript.txt](complete-source-repackaging/typescript.txt) |
| Full Expo web export, including Planning UI | PASS, cache cleared, one Metro worker | [web-export.txt](complete-source-repackaging/web-export.txt) |
| Jobs Lambda Linux Node22/native dependencies/import smoke | PASS; original smoke also imports source-only Planning handler and exercises non-invoking request validation | [lambda-build.txt](complete-source-repackaging/lambda-build.txt) |
| Worker production Linux/amd64 Docker build | PASS, cached dependency/model layers allowed | [worker-build.txt](complete-source-repackaging/worker-build.txt) |
| Static relative imports/npm script entrypoints | PASS; no unresolved paths, 126 JS/MJS syntax checks | [dependency-graph.json](complete-source-repackaging/dependency-graph.json), [validation.json](complete-source-repackaging/validation.json) |
| YAML parsed, declarations/region/account/duplicates checked | PASS locally against preserved evidence | [yaml-validation.json](complete-source-repackaging/yaml-validation.json) |
| Secrets, source hashes and final archive | PASS bounded pattern/hash/CRC checks | [validation.json](complete-source-repackaging/validation.json), [zip-validation.json](complete-source-repackaging/zip-validation.json) |

No independently confirmed code defect or failing test required changes. The one skipped Node test needs its managed `.venv` in the restored app for stdin-EOF lifecycle verification; it is not counted as a pass. Host Node tests used **Node25.9.0**; production Lambda build/import smoke used Linux **Node22**. This is not a claim that the complete Node suite ran on Node22.

Python tests ran from the restored copy using the existing interpreter's installed dependencies (Python3.12.5, CPU torch2.8.0, torchvision0.23.0, open_clip_torch3.3.0, Pillow12.3.0, numpy2.5.2), with bytecode writes disabled. No original Python source was substituted. Fresh Python installation is additionally specified/built by the production Dockerfile; cached Docker layers were reused. No new real OpenCLIP benchmark, cloud recognition/Analyse job, browser E2E session or load test was run in this task. Lambda smoke and Node AWS-adapter tests do not prove deployment or a real Bedrock invocation.

### Exact commands

From restored `app/` (mobile install/test/check invoked in its `mobile/` subdirectory equivalently):

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd --prefix mobile ci --no-audit --no-fund
npm.cmd run check
node --test tests/*.test.js
npm.cmd --prefix mobile test
npm.cmd --prefix mobile run check
$env:PYTHONDONTWRITEBYTECODE='1'
$env:OPENCLIP_THREADS='1'
& 'D:\\FlyFly\\Study\\Project\\Unframe\\.venv\\Scripts\\python.exe' -B -m unittest discover -s local-ai -p 'test_*.py' -v
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_API_URL='https://jobs.example'
$env:EXPO_PUBLIC_RECOGNITION_MODE='jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS='300000'
npm.cmd --prefix mobile run export:web -- --clear --max-workers 1
```

The web build deliberately used a reserved `.example` hostname, and its bundled configuration was checked. It was not uploaded or used to create AWS jobs. No local secrets were loaded into the export. One build worker avoids the previously observed host Metro memory pressure without altering application code.

Docker commands used `$cfg = 'D:/FlyFly/Study/Project/Unframe/docs/final-submission/complete-source-repackaging/docker-config'`, containing only an empty `{{}}` config, with the Desktop Linux Engine explicitly:

```powershell
docker --config $cfg --host npipe:////./pipe/dockerDesktopLinuxEngine build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:complete-source-audit .
docker --config $cfg --host npipe:////./pipe/dockerDesktopLinuxEngine build --platform linux/amd64 -f deployment/lambda/Dockerfile --target build -t unframe-jobs:complete-source-audit .
```

The initial sandbox-only Docker connection was denied; the authorized local build then succeeded through the same Engine using escalated filesystem/pipe access. No AWS/IAM restriction was bypassed. No image push or deployment occurred. The generated Lambda ZIP stays inside the local build image and is not nested in the source ZIP.

## Infrastructure YAML and scaling

`submission-a3-infra.yml` was also absent at the start. It was reconstructed from the previously saved, fully parsed declaration array and original formatting. Its **SHA-256 exactly matches the previous file**, so no declaration or description changed:

`{i['infrastructureSha256']}`

There are **33 unique existing resource declarations**, including Jobs Lambda, ECS service/task/cluster, ECR, API Gateway, S3, S3 Vectors, SQS/DLQ, DynamoDB, CloudFront, CloudWatch and Auto Scaling plus required shared dependencies. Regional resources use `ap-southeast-2`; account fields, when present, use `901444280953`. Global/provider ARNs retain their proper empty region/account fields. No Planning Lambda, undeployed Planning API route or new resource was added.

Both actual-policy JSON and placeholder policy template retain **minimum1 / maximum3 / backlog target3 / scale-out30s / scale-in120s**, with scale-in enabled. Task template remains Linux/x86_64, **512 CPU / 2048 MiB**. These are verified local configuration and prior saved evidence, not fresh AWS readings.

Read-only command attempted:

```powershell
aws sts get-caller-identity --profile default --region ap-southeast-2 --query '{{Account:Account}}' --output json
```

Exact blocker: `aws: [ERROR]: The config profile (default) could not be found`. No credential contents were accessed or printed. Consequently no fresh scalable-target/policy/resource-state verification was possible. Shared API `purpose=assessment 2` and shared dependency tag review remain known course-compliance questions; no tags or IAM/SCP policies were changed. Historical deployed-resource evidence is preserved, not upgraded to a current live PASS.

## ZIP inspection

The requested `CAB432-A3-Submission.zip` was created exclusively after validation. Its root is exactly:

```text
submission-a3-infra.yml
app/
```

CRC integrity **PASS**; every archive file hash matches the validated submission, with **337 files / 338 entries**, no extra parent wrapper, duplicate/unsafe path, symlink or nested archive. No dependencies, build outputs, model weights or credentials are bundled. Safe example environment files are intentional inclusions, not local credentials. Largest file is the required `app/mobile/assets/goma-exterior.jpg`, **765,672 bytes**. [Full ZIP receipt](complete-source-repackaging/zip-validation.json).

The bounded sensitive-pattern scan detected no access keys, session credentials, private-key blocks, real presigned signatures or long capability-token values. Public ARN/endpoint strings and explicitly synthetic test tokens remain legitimate source fixtures. A pattern scan cannot prove absence of every imaginable secret format; the source allowlist and generated/local-file exclusions provide additional protection.

## Remaining upload risks and final outcome

**Ready for a student upload attempt as a complete source package.** Planning/Chat source is restored without inventing a deployed Planning backend. Application logic and original source/evidence are unchanged; no AWS resources, tags, IAM, jobs, DLQ or scaling settings were modified, and no Git commit/push occurred.

The new ZIP does **not** prove resolution of earlier Gradescope HTTP500/502. A server-side ingestion problem, assignment configuration, transient upload/proxy failure or another validation issue remains possible. The previous ZIPs were unavailable for direct inspection this turn; their earlier layout findings are historical receipts. No documented size/file-count limit or server-side error trace establishes the original cause. Do not remove required modules merely to reduce file count. Retry with this verified archive; if the error recurs, preserve sanitized timestamp/request ID and ask the teaching team/Gradescope support to inspect ingestion.

The student's report/video/calculator, shared-tag interpretation, fresh AWS state and actual Gradescope acceptance remain separate obligations. This source package alone is not proof that every assessment criterion passed.
'''
(OUT.parent/'complete-source-repackaging.md').write_text(report,encoding='utf-8')
print('Wrote complete-source-repackaging.md and restoration comparison.')
