# ECS recognition failure diagnosis — 31 October 2026

Job: `d1964a3b-3090-4a41-87a6-83a2a69decac`. Inspection used the default AWS profile in account `901444280953`, region `ap-southeast-2`. All AWS operations were read-only. No private image was downloaded, job retried manually, resource changed, image pushed, or deployment performed.

## Finding and confidence

**Confirmed deployment defect:** the running worker uses the old `v1` image, whose S3 Vectors adapter sends five metadata conditions as sibling fields. A read-only query to the real index reproduced `ValidationException: Invalid filter`. The same reference embedding and metadata conditions succeeded with the current source's `$and` / `$eq` serialization.

**Likely failing stage: S3 Vectors `QueryVectors`.** The exact historical exception for this job cannot be recovered from its existing generic log. An additional task-role permission or earlier processing failure cannot be excluded. The AWS reproduction used the authenticated local profile, not the ECS task role, and used a public catalogue reference embedding, not the uploaded private image.

The healthy container status proves liveness, not successful recognition. Normal Jobs Lambda START/END/REPORT events concern the separate HTTP/upload workflow and do not establish success of asynchronous ECS processing.

## Live evidence

| Check | Observation |
| --- | --- |
| ECS cluster / service | `n12281212-strobe-a2` / `a3-n12281212-unframe-worker` |
| Task | `b81f902404d244fcacf4a0d277d11f02`, running and healthy |
| Task definition | `a3-n12281212-unframe-worker:3` |
| Running image | `901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v1` |
| Running image digest | `sha256:5ae12c97f44429064ed21a3da67f5f64f65eb961efea78ceec81eb3bb85f82c6` |
| Newer ECR image | `v2`, pushed 31 October at 04:17:14 AEST; image/index digest `sha256:991f56e039b92a5d444d5ba6117900e38b55720e536fdbd401d33c7933811db0` |
| Source comparison | Local `unframe-recognition-worker:local` has the exact running `v1` digest and the invalid filter. Local `unframe-worker:a3-512-2048-local` matches the newer image/index digest and contains `serializeMetadataFilter`. Image/index and platform manifest digests can differ. |
| Job record | `RETRYING`, attempts `2`, operation `recognise`, museum `met`, at inspection |
| S3 object | HEAD succeeded; JPEG, 372985 bytes, matching job size/type, AES256 encryption. This does not establish task-role GetObject permission. |
| Logs | `/ecs/a3-n12281212-unframe-worker`, stream `ecs/unframe-worker/b81f902404d244fcacf4a0d277d11f02` |
| Processing duration | Attempt 1 failed about 583 ms after `job_processing`; attempt 2 about 404 ms. Redelivery occurred about 300 seconds later. Neither is evidence of exhausting the configured inference/job timeout. |
| OpenCLIP startup | Logged ViT-B-32, laion2b_s34b_b79k, 512 dimensions, one thread, followed by `worker_ready` |
| Task resources | CPU `1024`, memory `2048` MiB. CPU differs from the previously stated university limit of `512`; unchanged by this investigation. |

The read-only AWS comparison used `data/artwork-embeddings.json`'s Water Lilies reference and all five identity filters: `museumId=met`, `model=ViT-B-32`, `pretrained=laion2b_s34b_b79k`, `version=openclip-v1`, and the current reference `catalogueHash`.

| Query | Result |
| --- | --- |
| Deployed v1 sibling-field filter | AWS `ValidationException: Invalid filter` |
| Corrected `$and` filter | Success, cosine metric, all returned metadata matched MET and the requested identity |

| Ranked reference | Cosine distance | Similarity (`1 - distance`) |
| --- | ---: | ---: |
| `water-lilies` | 0.000004649162292480469 | 0.9999953508377075 |
| `wheat-field-with-cypresses` | 0.3323271870613098 | 0.6676728129386902 |
| `self-portrait-with-a-straw-hat` | 0.40715301036834717 | 0.5928469896316528 |

These are raw AWS retrieval results, not a newly completed ECS job. The application retains only candidates at or above `0.80`, sorts descending, and returns at most three; only Water Lilies qualifies in this comparison. No fallback to local vector search was used in the AWS comparison.

## Processing path and hidden exceptions

1. `worker/worker.js:runWorker` receives one SQS message at a time and calls `createMessageProcessor`.
2. `worker/process-job.js:parseJobMessage` validates the S3 event. The processor loads and claims the DynamoDB job through `server/cloud/job-repository.js:get/claim`.
3. `server/cloud/uploads.js:read` performs S3 GetObject, checks length/type/ETag, and reads bounded image bytes. `normalizeImage` decodes and normalizes the image.
4. `server/ai/recognition.js:recognise` calls `createEmbeddingService.generate` through the existing OpenCLIP endpoint, then `server/ai/s3-vectors.js:search` issues QueryVectors with museum and embedding/catalogue identity filters. The source already contains the correct `$and` serialization; it needed no further change.
5. **Plain `recognise` does not call Bedrock.** The separate `analyse` operation uses `artwork-analysis.js` and can invoke Bedrock Converse. Bedrock is configured but is not on this job's normal path.
6. Successful inference calls `job-repository.js:complete` (DynamoDB UpdateItem), deletes the S3 input, then acknowledges SQS. Failed processing calls `fail` (DynamoDB UpdateItem), retains the input/message, and preserves the existing retry/redrive behavior.

`worker/process-job.js` previously logged only the generic `PROCESSING_FAILED` code. `job-repository.js:fail` intentionally stores that generic public error. The worker loop then catches the original exception without another log. `server/ai/bedrock.js` also converts raw SDK exceptions into safe public AI errors. Together these prevented identification of the historical failing service.

## Local diagnostic changes

| File | Change |
| --- | --- |
| `server/ai/diagnostics.js` (new) | Bounded stage/service/operation, exception type, application/AWS error code, AWS request ID and HTTP status. WeakMap retains safe diagnostics without attaching raw SDK responses or causes to public errors. |
| `worker/process-job.js` | Captures processing stage, attempt and elapsed time; logs retry-state update failures separately. Public error, acknowledgement order, deadlines and retry logic remain unchanged. |
| `worker/worker.js` | Wraps OpenCLIP and S3 Vectors service boundaries and Bedrock analysis; adds safe queue/startup diagnostics. |
| `worker/start.js` | Adds safe startup/runtime error diagnostics. |
| `server/ai/bedrock.js` | Preserves approved SDK diagnostic fields when creating sanitized public errors; no prompts, images or raw causes are retained. |
| `tests/aws-diagnostics.test.js` (new) | Checks redaction, original exception identity, deepest-stage attribution, method binding and sanitized Bedrock errors. |
| `tests/aws-jobs.test.js` | Checks stage attribution, cleanup failures and separate reporting of inference and retry-state failures. |

Diagnostics do not log exception messages/stacks, credentials, URLs, read tokens, receipt handles, request/response bodies, images or prompts. Unknown exception/code values and unsupported request-ID formats are omitted or represented by bounded generic values. Existing public job IDs remain available for correlation. Recognition algorithms, S3 Vectors filtering, similarity calculations, model/dimensions, threshold, confirmation behavior and concurrency are unchanged.

## Configuration and IAM review

Required resource environment variables are present: `JOBS_TABLE_NAME=a3-n12281212-unframe-jobs`, `JOB_IMAGES_BUCKET=a3-n12281212-unframe-job-images`, `JOB_IMAGE_PREFIX=uploads/`, `RECOGNITION_QUEUE_URL` points to the existing `a3-n12281212-unframe-recognition` queue, and `S3_VECTOR_INDEX_ARN` points to:

```text
arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors/index/a3-n12281212-unframe-vectors
```

Observed AI settings: `AI_PROVIDER=bedrock`, `VECTOR_STORE=s3vectors`, `S3_VECTOR_VERSION=openclip-v1`, `OPENCLIP_URL=http://127.0.0.1:8001`, `OPENCLIP_THREADS=1`, `ARTWORK_MATCH_THRESHOLD=0.80`, `BEDROCK_MODEL_ID=google.gemma-3-12b-it`, and the same vision model. Region defaults to `ap-southeast-2` in cloud configuration. Existing budgets remain `WORKER_JOB_TIMEOUT_MS=180000`, `OPENCLIP_TIMEOUT_MS=30000`, `AI_ANALYSIS_BUDGET_MS=125000`, `WORKER_VISIBILITY_SECONDS=300`, `WORKER_MAX_ATTEMPTS=5`.

Task role: `Task-Role-CAB432-ECS`; execution role: `Execution-Role-CAB432-ECS`. Role-policy listing and IAM simulation were denied to the local identity, so **effective task-role permissions are not fully verified**. Successful startup/job logs demonstrate some access: S3 Vectors GetIndex, SQS receive, and DynamoDB job read/claim/failure updates. They do not prove all remaining actions.

An authorized administrator should verify the existing task role allows the required resource-scoped operations: S3 GetObject/DeleteObject (and corresponding version operations when applicable), SQS ReceiveMessage/DeleteMessage, DynamoDB GetItem/UpdateItem, S3 Vectors GetIndex/QueryVectors/**GetVectors**, and Bedrock InvokeModel for analysis. AWS requires both QueryVectors and GetVectors when querying with metadata filtering or returned metadata: [AWS S3 Vectors access management](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-access-management.html). No IAM change was attempted.

## Validation and next action

- `npm.cmd run test:aws`: **37 passed, 0 failed**.
- `node --test --test-concurrency=1 tests/*.test.js`: **159 passed, 0 failed** (includes the AWS tests).
- `node --check` on the five changed production JavaScript files: passed.
- `git diff --check`: passed; only an existing line-ending warning was emitted.
- Live AWS filter comparison: old filter failed as expected; corrected filter succeeded. No private-image end-to-end replay or ECS deployment was performed.

**A new worker image is required to include the new diagnostics.** Existing ECR `v2` already contains the filter fix, but the observed task still runs `v1`. The next authorized deployment should use a verified image containing the correct filter (and preferably these diagnostics), pin its digest, then verify the replacement task's actual image digest. Re-submit a fresh known-image job after deployment and confirm `job_completed` / `SUCCEEDED`. If it fails, use the new stage, AWS error code and request ID to distinguish permission, upload-validation, OpenCLIP, vector-query, Bedrock-analysis or DynamoDB failures. Do not assume that the original job remains retryable indefinitely.
