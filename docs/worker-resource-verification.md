# Worker resource verification — 31 October 2026

Scope: prepare the existing recognition worker for **512 CPU units / 2048 MiB, Linux X86_64**, Sydney. All measurements here are local Docker tests. No AWS SDK request reached AWS, no credentials were supplied, and no resource, ECR push or deployment was performed.

## Inspection and changes

| Inspected file | Finding / action |
| --- | --- |
| `worker/Dockerfile`, `worker/Dockerfile.dockerignore` | Node 22 + Python 3.12, CPU-only PyTorch 2.8.0 / torchvision 0.23.0, non-root UID 10001. Public weights are baked into the image; no startup download. Added runtime `OPENCLIP_THREADS=1`, `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`, `OPENBLAS_NUM_THREADS=1`, `MALLOC_ARENA_MAX=2`. Build-time weight verification still uses two threads; final image runtime defaults override this. |
| `worker/start.js` | One Node supervisor starts one Python service and waits for compatible health before queue processing. Up to 120 readiness polls; unchanged. SIGTERM/managed stdin stop the owned Python process. No Ollama or local Gemma process. |
| `local-ai/model.py`, `download.py`, `server.py`, `requirements.txt`, `image_input.py` | Fixed FP32 ViT-B-32 / laion2b_s34b_b79k; 512D normalized outputs. Model loads once, then only the vision tower is retained. Temporary full-model/checkpoint allocations during startup dominate process RSS; the text tower is already released. Python serializes inference with a semaphore. No model-loading rewrite or dependency changes were needed. |
| `worker/worker.js`, `process-job.js` | One shared embedding service/store, one message per SQS receive, awaited sequential processing. Per-museum recognition objects do not load extra models. Image validation, leases, persistence-before-cleanup, retries and acknowledgement order unchanged. |
| `worker/healthcheck.js` | Requires a fresh worker liveness file and successful loopback OpenCLIP health. Unchanged. ECS must explicitly configure this command. |
| `server/ai/embeddings.js`, `s3-vectors.js`, `recognition.js`, `images.js` | Existing remote adapter, five metadata filters, normalized embedding checks, cosine conversion, threshold 0.80 and three-candidate cap retained. Input limit remains 5 MiB / 25 million pixels, resized to at most 1536 pixels before Python inference. |
| `server/ai/config.js`, `local-http.js`, `artwork-analysis.js`, `server/cloud/config.js`, `job-repository.js`, `uploads.js` | Existing timeout hierarchy and SDK/storage contracts retained. Bedrock remains remote; its model is not resident in this container. |
| `.env.example`, deployment files, `docs/friday-deployment-checklist.md` | Recommended thread count changed from four to one in the example. No existing ECS task definition was found; added a placeholder-only 512/2048 template and corrected the older checklist's deployment recommendation. |

Files changed for this task: `worker/Dockerfile`, `.env.example`, `docs/friday-deployment-checklist.md`; added `deployment/ecs/worker-task-definition.example.json`, `scripts/verify-worker-limits.mjs`, `scripts/verify-worker-private-cache.sh`, and this report. Ignored test artifacts are under `artifacts/worker-limits/`. The model, embeddings, recognizer, worker business logic and timeout implementations were not modified.

## Test design

`scripts/verify-worker-limits.mjs` is a **test-only Node preload**, mounted read-only into the container. It executes the real `worker/start.js`, including the Python child, model loading, readiness checks, worker polling loop, image normalization, recognition and result/cleanup order. Only AWS SDK `.send()` boundaries are mocked: SQS, DynamoDB, S3 and S3 Vectors. Bedrock calls fail the test because ordinary recognition must not invoke a vision LLM. This harness is not included in the production image.

The mock S3 Vectors endpoint checks actual `QueryVectorsCommand` payloads, requiring `$and` with `museumId`, `model`, `pretrained`, `version`, `catalogueHash`. It calculates cosine distances against the existing 15 local OpenCLIP reference vectors supplied as a **mock server fixture**. Production `VECTOR_STORE=s3vectors` selection remains active; this is not a silent local-store fallback and is not a real AWS search.

Tests include MET Water Lilies, GOMA negative control, repeated sequential jobs, confirmation requirement, ranked candidates capped at three, health before jobs and after an idle interval, and graceful SIGTERM. The final stress input is a 5000 × 5000 JPEG derived from Water Lilies, 4,126,358 bytes (within the unchanged upload limits).

Limits are asserted inside the container: `cpu.max=50000 100000`, `memory.max=2147483648`, `memory.swap.max=0`. Sampling records cgroup memory/CPU, Python RSS and Node RSS; kernel `memory.peak` and `memory.events` capture transient peaks and OOM events. `--memory-swap 2g` with `--memory 2g` disables swap. Docker CLI memory subtracts cache; the report uses cgroup values instead. Shared file-page charging and host cache state still affect cross-run comparisons; do not treat lower later cgroup readings as proven memory savings. [Docker memory limits](https://docs.docker.com/engine/containers/resource_constraints/), [Docker stats accounting](https://docs.docker.com/reference/cli/docker/container/stats/).

The private-cache test first copies the existing baked weights into its own writable layer, then sets `OPENCLIP_CACHE_DIR` to that location and executes the same entrypoint. This exercises fresh page charging without modifying weights or clearing the Docker host's global caches. It is test setup, not a production startup requirement.

## Results

Final image: `unframe-worker:a3-512-2048-local`, Linux/amd64, non-root. Local image ID `sha256:991f56e039b92a5d444d5ba6117900e38b55720e536fdbd401d33c7933811db0`. Build passed; nothing pushed.

**Conclusion: 0.5 vCPU + 2048 MiB is sufficient for the tested serial recognition workload.** Both rebuilt-image runs passed, including all large-image cases. The private-cache run left 559.68 MiB below the memory cap. This is measured local feasibility, not a guarantee for every photograph or sustained deployed traffic.

| Measurement | Rebuilt image, normal cache | Rebuilt image, private cache |
| --- | --- | --- |
| Completed jobs | 30 / 30 | 30 / 30 |
| OpenCLIP + worker readiness | 34.311 s | 32.688 s |
| Measured lifetime, including 35 s idle health observation | 100.618 s | 98.490 s |
| Peak cgroup memory, including charged cache | 893.29 MiB | **1488.32 MiB** |
| Peak sampled cgroup memory after readiness | 863.84 MiB | 1458.90 MiB |
| Peak sampled Python RSS during loading | 1486.34 MiB | 1489.22 MiB |
| Peak sampled Node RSS | 164.84 MiB | 166.63 MiB |
| Original Water Lilies / GOMA job durations | 0.417–3.595 s | **0.493–1.417 s** |
| Three 25-megapixel job durations | 1.014–1.381 s | **0.928–1.401 s** |
| Mean CPU over measured lifetime, including idle | 32.77% of one core | 32.71% of one core |
| Health command invocations | 33 passed | 33 passed; Docker observed healthy while running |
| OOM / OOM-kill / memory-limit events | 0 / 0 / 0 | 0 / 0 / 0 |
| Exit code / Docker OOMKilled | 0 / false | 0 / false |

Startup timing begins in the test preload before the production entrypoint runs; it includes Python imports, model loading and readiness polling, not the preceding private-cache copy. A separate direct `load_encoder()` diagnostic measured 32.497 s. The private-cache kernel memory peak includes the copy. Process RSS can count file pages charged outside the container, so it can exceed a warm-run cgroup value; process peaks also occur at different times and must not be summed as simultaneous usage.

During private-cache jobs, CPU averaged **49.12% of one core** (98.24% of the half-core allocation); live Docker sampling reported 49.93%. CPU throttling was expected and observed. Neither model load nor recognition timed out; no limit was raised to obtain a pass. The final 35-second idle observation and repeated health checks passed; Docker's stopped-container health label is not used to infer a running health failure.

Original-image query result, against the mock service's real stored reference vectors:

| Rank | Artwork | Similarity = 1 − cosine distance |
| --- | --- | --- |
| 1 | `water-lilies` | 0.9999999999996751 |
| 2 | `wheat-field-with-cypresses` | 0.6678415058150996 |
| 3 | `self-portrait-with-a-straw-hat` | 0.5927224260048973 |

Only Water Lilies crosses 0.80, so the application returned **one candidate**, with confirmation still required. The GOMA query excluded MET references and returned `matched:false`, zero candidates. The resized 25MP image still ranked Water Lilies first at **0.9347429568340427**. Original-image embedding norm was `1.0000000023282216`. Baseline-versus-final embedding cosine similarity was `0.9999999999996038`, with maximum component difference `1.7136335372924805e-7`. This confirms numerical and recognition parity for this fixture, not a new full-dataset accuracy evaluation.

Raw evidence: `artifacts/worker-limits/{baseline,tuned,final,private-cache}/summary.json`, final/private-cache `run.log` and `embedding.json`; `private-cache/container-state.json` records Docker `Running=true`, `Health.Status=healthy`. All SDK traffic was mocked in every run.

The earlier two-thread baseline also passed 12 jobs at the same hard limits: startup 26.900 s; peak cgroup memory 1708.31 MiB; Python peak RSS 1479.71 MiB; recognition jobs 0.509–1.086 s; no OOM. The one-thread environment trial passed 12 jobs, startup 32.477 s, with maximum vector-component difference from baseline `1.7136335372924805e-7`. That trial's lower cgroup peak (883.54 MiB) is cache-sensitive and is not a causal memory-reduction claim.

A separate Linux diagnostic measured Python steady RSS after loading at 673.46 MiB. Calling glibc `malloc_trim(0)` reduced it by only 2.64 MiB, so no platform-specific trim call or custom checkpoint loader was added. The main transient memory cost is startup, not multiple resident models. Thread/arena limits reduce oversubscription and bound allocator fragmentation while preserving computation.

## Timeouts and ECS recommendation

| Setting | Recommendation / reason |
| --- | --- |
| `OPENCLIP_TIMEOUT_MS=30000` | Keep. Applies to individual embedding requests after readiness, not initial model loading. Measured requests are comfortably below it. |
| `WORKER_JOB_TIMEOUT_MS=180000` | Keep. Bounds the entire job, including AWS/network work. Local mocks do not establish real network latency. |
| `AI_ANALYSIS_BUDGET_MS=125000` | Keep. Bounds optional Bedrock analysis; ordinary recognition skips Bedrock. Actual Bedrock latency remains unmeasured here. |
| `WORKER_VISIBILITY_SECONDS=300` | Keep. Leaves 120 seconds beyond the job budget, exceeding the existing 60-second safety margin. No heartbeat or concurrency increase introduced. |
| Startup / health | Keep 120 readiness polls; health interval 30 s, timeout 5 s, startPeriod 180 s, retries 3. StartPeriod does not extend the supervisor's own startup limit. |

Use `deployment/ecs/worker-task-definition.example.json`, filling only real resource values. Recommended task/container CPU **512**, memory **2048**, `FARGATE`, `awsvpc`, `LINUX`, `X86_64`, `stopTimeout=120`, one recognition job per task, no model-serving port exposure. Default desired/minimum count remains one. Keep image thread/allocator defaults, AWS IAM task/execution roles and CloudWatch Logs; do not add credentials or local LLM sidecars. `512/2048` is an AWS-supported combination; Docker quota timing is an approximation because Fargate's CPU allocation uses different scheduling controls. [AWS CPU/memory guidance](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html).

This template conservatively disables optional public artwork search for the demonstration; it does not change application defaults or recognition. No limits above the university allowance are recommended.

## Reproduction

Run from repository root in PowerShell. Existing `data/artwork-embeddings.json` is an ignored, validated 15-reference fixture required by this offline benchmark. No AWS credentials are needed.

```powershell
docker build --platform linux/amd64 -f worker/Dockerfile -t unframe-worker:a3-512-2048-local .
New-Item -ItemType Directory -Force artifacts/worker-limits/final | Out-Null
node --input-type=module -e "import sharp from 'sharp'; await sharp('mobile/assets/water-lilies.jpg').resize(5000,5000,{fit:'fill'}).jpeg({quality:88}).toFile('artifacts/worker-limits/water-lilies-25mp.jpg');"
docker run --platform linux/amd64 --name unframe-limits-final --network none --cpus 0.5 --memory 2g --memory-swap 2g -e WORKER_TEST_JOBS=30 -e WORKER_TEST_STRESS_IMAGE=/fixtures/water-lilies-25mp.jpg --mount "type=bind,source=$($PWD.Path)/scripts,target=/app/scripts,readonly" --mount "type=bind,source=$($PWD.Path)/data/artwork-embeddings.json,target=/fixtures/references.json,readonly" --mount "type=bind,source=$($PWD.Path)/mobile/assets/water-lilies.jpg,target=/fixtures/water-lilies.jpg,readonly" --mount "type=bind,source=$($PWD.Path)/artifacts/worker-limits/water-lilies-25mp.jpg,target=/fixtures/water-lilies-25mp.jpg,readonly" --mount "type=bind,source=$($PWD.Path)/artifacts/worker-limits/final,target=/results" unframe-worker:a3-512-2048-local node --import ./scripts/verify-worker-limits.mjs worker/start.js
```

For the private-cache run use a new container name and output directory, with the same mounts/limits; replace the final command with `sh scripts/verify-worker-private-cache.sh`. Stopped test containers are retained so `docker inspect` can verify exit code, `OOMKilled` and health history. Use a new name/output directory for repeats.

Regression commands executed:

```powershell
node --test --test-concurrency=1 tests/*.test.js
npm.cmd run test:aws
npm.cmd --prefix mobile test
npm.cmd --prefix mobile run check
docker run --rm --platform linux/amd64 --network none --cpus 0.5 --memory 2g --memory-swap 2g -e OPENCLIP_THREADS=1 -e OMP_NUM_THREADS=1 -e MKL_NUM_THREADS=1 -e OPENBLAS_NUM_THREADS=1 --mount "type=bind,source=$($PWD.Path)/local-ai,target=/app/local-ai,readonly" unframe-worker:a3-local python -m unittest discover -s local-ai -p "test_*.py"
```

Results: **155 root tests passed**, including the **33 AWS tests** (also run separately); **40 mobile tests passed**; TypeScript passed; **32 Python tests passed**. Regression coverage includes metadata filters, `1 - cosine distance`, threshold/candidate cap, museum exclusion, Bedrock contracts and SQS retry/lease/persistence/cleanup behavior. No full photographic accuracy benchmark or live Bedrock/S3/SQS test was performed. No recognition algorithm or weight changes were made.

A **new ECR image is required** for the runtime defaults. The image is built locally and ready for later authorized push; existing ECR/ECS resources were not inspected or changed. Fargate cold-start, real IAM/network access, Bedrock latency and sustained production load still need deployment-time checks.
