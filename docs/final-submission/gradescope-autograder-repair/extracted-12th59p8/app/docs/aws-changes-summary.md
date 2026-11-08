# AWS preparation: morning review

No AWS resources were touched, no AWS credentials used, no Docker images pushed, no cloud load/indexing operations run, and no commit/push made.

The application keeps OpenCLIP ViT-B-32 with normalized 512-dimensional vectors. A new S3 Vectors adapter replaces only vector storage/search when enabled. It retains museum filtering, the 0.80 similarity threshold, three-candidate limit, scene detection and visitor confirmation. Local JSON vectors remain the default.

Bedrock is selected with `AI_PROVIDER=bedrock`, defaulting to `google.gemma-3-12b-it` in `ap-southeast-2`. It uses the Converse API and validates returned JSON before existing business validators. Catalogue explanations still select existing notes; the physical route algorithm remains unchanged. Ollama remains available locally. Route source labels now correctly distinguish Bedrock.

New Lambda modules implement `POST /a3/jobs` and `GET /a3/jobs/{jobId}`. A job returns a temporary presigned upload and private read capability. S3 ObjectCreated notifications deliver work directly to SQS. The CPU Fargate worker checks the event against DynamoDB, loads/validates the image, reuses existing recognition/analysis, saves the result, deletes the temporary input and only then acknowledges the queue message. Failures retain the message/image for retry; durable successes avoid repeated inference on redelivery. Configure DLQ and S3 expiration for permanent failures/abandoned uploads.

Static catalogue/graph JSON and mobile local data stay where they are. No UI redesign or profile/state migration occurred. A tested create/upload/poll client is ready, but it is intentionally **not wired to Scan yet**. The exact web/native connection points and timeout changes are in the readiness document.

The worker Dockerfile installs CPU dependencies and downloads public OpenCLIP weights during build; it does not rely on this machine's caches. **Docker's daemon was unavailable, so the container build/runtime is unverified.** Actual AWS permissions, Bedrock output quality, event delivery and autoscaling also remain unverified.

The existing Node AI endpoints can select Bedrock. **Only the new jobs API has Lambda handlers**; planning/confirmation Lambda transport remains tomorrow's work. Do not assume deploying the jobs handler deploys all application APIs.

Start with the [deployment readiness guide](aws-deployment-readiness.md), especially its IAM, schemas, frontend wiring, blockers and ordered deployment checklist. The load generator is opt-in and can submit 30 jobs later after one complete cloud job has passed. Rebuild the frontend with the deployed URL: the checkout's current mobile environment still points to localhost.

Local validation passed: **145 root tests** (including 23 mocked AWS tests), **36 mobile tests**, mobile TypeScript checking, clean installs and the web export to `mobile/dist/`. Docker and live AWS verification remain outstanding.
