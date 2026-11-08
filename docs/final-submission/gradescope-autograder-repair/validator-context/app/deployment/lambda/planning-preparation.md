# Planning Lambda preparation

Status: locally prepared and tested; no Planning Lambda or API routes deployed. Do not invent a function name or role ARN. Select the actual approved function/role at deployment.

## Implementation

- Handler: **`server/cloud/planning.planningHandler`**; Node.js **22.x**, **x86_64**.
- Existing factory: `createPlanningHandler` in `server/cloud/planning.js`. It reuses `createPlanningChatService`, `createRouteService`, the Bedrock text provider and catalogue confirmation.
- The only production change in this preparation handles an exact HTTP API v2 named-stage prefix (`/prob/api/ai/...`). Unprefixed/default-stage paths still work. Wrong stage prefixes remain 404. Jobs routing is unchanged.
- Existing `/visit` response is **buffered NDJSON**, with an answer followed by a route or route_error. HTTP API Lambda proxy can return this ordinary bounded string body; streaming integration is not required. The existing web `readPlanningVisit` client accepts a single chunk. No JSON adapter/client rewrite was necessary.
- The handler uses a 25-second overall budget, reduced to leave one second of remaining Lambda time; provider budget is 24 seconds in the environment template. API integration timeout: 30000 ms. Lambda timeout: 30 seconds; initial memory: 1024 MiB. Real Gemma latency and task-role/model permission are unverified. Do not increase timeout beyond the HTTP API integration limit to hide this uncertainty.
- Routes, graph, Dijkstra, accessibility checks, museum validation, must-see recommendations and viewing/walking budgets remain untouched.

## Package

```powershell
docker build --platform linux/amd64 -f deployment/lambda/Dockerfile --target artifact --output type=local,dest=artifacts/lambda .
```

Verified output: `artifacts/lambda/unframe-lambda-node22-x64.zip`.

- Compressed: 25,889,437 bytes; uncompressed: 64,263,771 bytes; 6242 archive entries.
- SHA256: `008a3dd6a2011fadb1db2672fc8c7ec17188dd57fa6d89b0e76f825faa567f73`.
- Root includes package manifests, `server/`, `shared/`, Linux production `node_modules/`. Both Jobs and Planning handler exports are included.
- Docker build ran the existing `scripts/smoke-lambda.mjs`: Linux x64/Node 22 assertions, native Sharp operation, both handler imports and request parsing passed without AWS calls.
- No environment/credential files were found in archive filenames. Do not upload Windows node_modules or include local `.env` files.

## Required API routes

API discovered: **`4xfbhsso7a`**. Both `$default` and `prob` are active auto-deploy stages. The selected frontend base is **`https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`**. Route keys omit the stage.

| Method | Route | Contract |
| --- | --- | --- |
| POST | `/api/ai/routes/visit` | Bounded NDJSON answer + route/route_error |
| POST | `/api/ai/routes/plan` | JSON route retry |
| POST | `/api/ai/routes/chat` | JSON planning reply |
| POST | `/api/ai/artworks/confirm` | JSON catalogue-grounded confirmation |
| GET | `/api/ai/planning/status` | JSON configuration only; `liveVerified=false` |

Use Lambda proxy payload **2.0** with the actual Planning function ARN. If gateway CORS is configured, it handles OPTIONS; otherwise explicit OPTIONS `/api/ai/{proxy+}` integration must reach the handler. These routes are **not present in the inspected live API**. The existing Jobs routes must keep integration `fffmtna` and their current handler.

The API also serves A2 routes. Review CORS changes across those clients before changing API-wide configuration. Add Lambda invoke permission scoped to `arn:aws:execute-api:ap-southeast-2:901444280953:4xfbhsso7a/*/*/api/ai/*` for the actual function. This permission has not been created.

## Environment and permissions

Use `deployment/lambda/planning-env.example.json`; substitute the final approved frontend origin. Preserve any intentional existing variables when later updating a function:

```text
AI_PROVIDER=bedrock
BEDROCK_MODEL_ID=google.gemma-3-12b-it
BEDROCK_PLANNING_MODEL_ID=google.gemma-3-12b-it
BEDROCK_TIMEOUT_MS=24000
PLANNING_API_TIMEOUT_MS=25000
AI_ALLOWED_ORIGINS=https://<FINAL_CLOUDFRONT_DOMAIN>
OLLAMA_PLANNING_NUM_PREDICT=1024
OLLAMA_NUM_PREDICT=256
```

Lambda supplies `AWS_REGION=ap-southeast-2`; do not try to set that reserved variable. Legacy OLLAMA output-budget names map to Bedrock maxTokens; no Ollama process is required. Planning does not need OpenCLIP, S3 Vectors, job-table or upload-bucket permissions.

The execution role needs CloudWatch Logs permissions and `bedrock:InvokeModel` for `arn:aws:bedrock:ap-southeast-2::foundation-model/google.gemma-3-12b-it`. Confirm effective model permissions and any university restrictions with an authorized administrator; local IAM inspection was denied. No IAM policy was changed. No streaming invocation permission is required for this buffered implementation.

## Later deployment validation

1. Verify ZIP hash, actual function name/role, runtime/architecture, environment and handler; deploy only after authorization.
2. Create the listed proxy routes/invoke permission and exact-origin CORS after reviewing existing A2 clients. Do not expose model invocation without appropriate demonstration access controls/throttling.
3. GET `/prob/api/ai/planning/status`; require configuration response, not a claim of successful inference.
4. Submit one bounded visit only when authorized. Require one Bedrock response, preserved answer/route protocol, correct museum, Water Lilies must-see inclusion, step-free navigation and the requested time budget. Test invalid inputs and cancellation without silent local recommendations.
5. Confirm completion within 25 seconds and under the gateway limit. If real latency cannot meet this budget, report a transport blocker; do not rewrite Dijkstra or silently fall back.

Local validation: 38 AWS tests, including named-stage/default-stage routes and Bedrock error/timeout tests; 160 full root tests. The mobile parser already covers a complete buffered NDJSON response. This is not live Bedrock/Planning Lambda verification.
