# Complete Unframe application source

This submission restores the complete original application: Artwork Recognition, Bedrock Artwork Analyse, theme-based Tour Planning, AI Chat, deterministic routes/Dijkstra, museum maps, Scan/camera, native React Native source, profile state and relevant tests. Original source files are copied byte-for-byte; this README is packaging guidance only.

The deployed frontend includes Planning UI according to the student. **Presence of UI/source does not establish a deployed Planning backend.** `server/cloud/planning.js` and its environment template are retained source-only preparation. The infrastructure declaration deliberately contains no Planning Lambda or undeployed Planning API route. Local planning endpoints require the documented local AI services; do not infer that they work through the existing Jobs API.

## Local reproduction

Use Node 22 and npm from this `app/` directory:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd --prefix mobile ci --no-audit --no-fund
npm.cmd run check
node --test tests/*.test.js
npm.cmd --prefix mobile test
npm.cmd --prefix mobile run check
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_API_URL='https://jobs.example'
$env:EXPO_PUBLIC_RECOGNITION_MODE='jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS='300000'
npm.cmd --prefix mobile run export:web -- --clear --max-workers 1
```

The reserved `.example` hostname above is for a non-operational build check, not a deployed service. Set your authorized public API base URL when deliberately building an operational frontend. Clear Metro when changing environment variables. Output is `mobile/dist/`; it is excluded from this source ZIP. Public API configuration is not an AWS credential. Never embed keys, read tokens or presigned URLs in Expo variables.

Python source/tests are under `local-ai/`. Use an environment installed from `local-ai/requirements.txt` plus the CPU PyTorch/torchvision versions in the production Dockerfile, then run `python -B -m unittest discover -s local-ai -p 'test_*.py' -v`. Original setup/training documentation explains model/dataset downloads. Cached vectors, checkpoints, generated training runs and downloaded model weights are not source and are not bundled. Python tests use temporary fixtures; the optional managed-runtime Node test skips if its local `.venv` is absent.

Build from this directory:

```powershell
docker build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:source-check .
docker build --platform linux/amd64 -f deployment/lambda/Dockerfile --target build -t unframe-jobs:source-check .
```

Worker weights are downloaded publicly at build time or reused from Docker's build cache. The Lambda Dockerfile uses Linux Node 22/native dependencies and smoke-imports Jobs and the source-only Planning handler without AWS calls. Production Jobs handler remains `server/cloud/handlers.jobsHandler`. Local build success does not authorize deploying either handler.

## Cloud configuration and evidence scope

The infrastructure YAML retains 32 declarations after removing only the AWS-managed Bedrock foundation model ARN, which is not a student-owned/tagged resource. Bedrock application integration is unchanged; no replacement ARN is declared. Saved evidence/local configuration records worker revision 6 / image v5, Linux x86_64, CPU 512, memory 2048 MiB, `OPENCLIP_THREADS=1`, normalized 512D OpenCLIP ViT-B-32 / `laion2b_s34b_b79k`, threshold 0.80. Auto Scaling is min 1 / max 3, backlog target 3, cooldowns 30 seconds out / 120 seconds in. No current AWS state is asserted: the local `default` profile was unavailable during repackaging.

Existing shared API purpose-tag review and the optional cloud candidate-confirmation interpretation endpoint limitation remain unresolved. Recognition, confirmation handling, strict Analyse validation and Planning business logic were not modified here. Historical deployment documents and source-only templates remain for reproducibility; they are not instructions to create undeployed resources.

Original verification evidence is intentionally external to this source ZIP. Historical evidence/submission generators and validators may require the original repository's immutable `verification/` and `docs/final-submission/` archives. Do not run them as deployment or overwrite commands. Required runtime code, assets, manifests and configuration examples are included.

This archive contains source, not the student's report/video or proof of Gradescope acceptance. Correct root layout and integrity do not establish the cause or resolution of earlier HTTP 500/502 upload errors.
