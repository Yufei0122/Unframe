# Bedrock Analyse schema diagnosis — 31 October 2026

**Follow-up:** the diagnostics/prompt were subsequently deployed in worker v5/revision 6. One controlled real Bedrock Analyse job succeeded. The original invalid field remains unknown; see [current verification](recognition-final-verification.md). The four browser test failures recorded below were later confirmed as fixture/locator defects and fixed in tests only.

**Local diagnostics and prompt improvements are implemented. The exact invalid field in the live response remains unknown; a live Analyse fix is not claimed.** No images were built, pushed or deployed, no new AWS jobs or model invocations were made, and retries, DLQ messages and IAM policies were not changed.

## What is confirmed

Job `e606a64c-20fe-4b50-b781-a6f1ee78b63d` reached Bedrock on the deployed revision-5/v4 worker. Its saved event records model `google.gemma-3-12b-it`, HTTP 200, request ID `74412dfa-77b6-4444-92b9-63990709f319`, `end_turn`, one 486-character text block, and a Markdown fence. The worker rejected the parsed value with `BEDROCK_SCHEMA`.

In `server/ai/bedrock.js`, that code is emitted only after completion, envelope, size and JSON syntax checks pass, when Ajv rejects the value against the supplied schema. A missing/wrong field, wrong type, extra nesting, invalid enum, extra property, item count, text length or text pattern could produce it. **The saved response shape cannot distinguish those causes.**

The confirmed code defect in observability was that `parseBedrockJSON` discarded `ajv.errors` and raised a generic error without retaining a safe validation path or category. That diagnostic gap is fixed locally.

Only one sanitized real response fixture exists: `tests/fixtures/bedrock-gemma-vision-sanitized.json`, captured from the earlier public Water Lilies probe. It is schema-valid and is not the failed MET exterior response. Searches found no saved schema-invalid response fixture. A read-only `get-model-invocation-logging-configuration` check returned `loggingConfig: null`; there is no currently configured invocation-log destination available from that configuration. The historical invalid object cannot be recovered from the available artifacts. No raw model response was logged or fetched during this diagnosis.

## Expected wire contract versus known actual response

Bedrock Analyse uses **`compactVisionSchema` in `server/ai/vision.js`**, not the larger `visionSchema`. The top level must be one object, all five properties below are required, and no extra properties are allowed.

| Field | Required type and constraints | Actual failed response |
| --- | --- | --- |
| `subjectType` | String; exactly `painting`, `drawing`, `print`, `sculpture`, `craft`, `architecture`, `sign`, `person`, `other` or `unclear` | Unknown; no value retained |
| `description` | String, 1–200 characters; bounded single-line pattern | Unknown |
| `visualFeatures` | Array with 0–2 strings; each 1–60 characters and single-line | Unknown |
| `visibleText` | Array with 0–2 strings; each 1–100 characters and single-line | Unknown |
| `hypotheses` | Array with 0–1 objects; each object requires exactly `title`, `artist`, `basis`, with no extra properties | Unknown |
| `hypotheses[].title` | String, 1–120 characters, single-line | Unknown |
| `hypotheses[].artist` | String, 1–100 characters, single-line, **or JSON null** | Unknown |
| `hypotheses[].basis` | String, 1–100 characters, single-line | Unknown |

Each bounded string uses `minLength: 1`, its stated `maxLength`, and `^.{1,N}$`. Empty arrays are valid, whereas omitted arrays, null arrays and string/object substitutes are invalid. Unknown subject labels such as `building` are invalid; the accepted category is `architecture`. These are contract examples, not assertions about the live response.

After validation, `parseCompactVision` maps the subject category to the existing `artworkPresence` contract; `parseVision` additionally checks nonblank text/control characters and enforces the existing uncertainty/hypothesis behavior. None of those rules changed.

## Changes and privacy properties

| File | Change |
| --- | --- |
| `server/ai/schema-diagnostics.js` | New safe conversion of Ajv issues to four fields only: `path`, `expected`, `actualType`, `category`. Maximum five issues, bounded path depth, allowlisted categories/types, schema-owned field names and structural array indices. Model-authored unknown field names are redacted. |
| `server/ai/bedrock.js` | Capture safe schema issues before removing Ajv's cached schema, retain them in a WeakMap rather than API error properties, and include them in the existing safe rejection event. Expand only the vision prompt's natural-language instructions to restate the existing wire contract. |
| `tests/aws-bedrock-schema.test.js` | Seven regression tests covering failure diagnostics, strict rejection, privacy, valid boundaries, the real sanitized fixture and the vision prompt/transport contract. |
| `scripts/collect-analyse-evidence.mjs` | Preserve the four already-sanitized schema issue fields in future evidence collection, rather than dropping the new diagnostic array. Not executed against AWS in this turn. |
| `docs/bedrock-schema-diagnosis.md` | Findings, limits, schema contract, test evidence and next action. |

A synthetic regression produces this diagnostic:

```json
{"path":"/visualFeatures","expected":"array","actualType":"string","category":"type"}
```

This is **not** the historical job's identified failure. Additional-property errors use a path such as `/[additional-property]` without exposing the offending name. Enum values, model strings, raw Ajv messages, raw parameters, schema patterns, prompts and images are not copied to logs. Existing safe event/job/request correlation remains available. Diagnostics are not attached to client-visible errors.

The earlier prompt already included the JSON schema, but its prose did not explicitly state all array/null rules and character limits. The revised vision instruction restates the exact five-field layout, lowercase enum choices, array/item limits, nullable artist rule and single-line/nonblank requirements. It asks the model to shorten its own wording before returning it. This is contract-aligned prevention, **not proof that it fixes the unseen live object**.

No output coercion, truncation, enum remapping, default insertion, unknown-field removal or wrapper-object extraction was added. Strict Ajv validation, completion checks and the existing whole-response Markdown-fence handling remain in place. `allErrors: false` is preserved; diagnostics show the first failing constraint or a bounded set of composition-branch issues rather than claiming an exhaustive report.

Source hashes confirm no changes to `vision.js` or its schemas, AI configuration, OpenCLIP/recognition code, S3 Vectors filtering, route/graph code or worker processing/retry logic. Model identity, embeddings, 0.80 threshold, timeouts and token budget are unchanged.

## Regression evidence

Evidence directory: `verification/2026-10-31/bedrock-schema/`.

| Check | Result |
| --- | --- |
| `node --test tests/*.test.js` | 171 passed, 0 failed; includes existing AWS, recognition, Jobs/SQS and route/planning suites |
| `npm.cmd run mobile:test` | 40 passed, 0 failed |
| `npm.cmd run mobile:check` | TypeScript passed |
| `.venv/Scripts/python.exe -m unittest discover -s local-ai -p 'test_*.py' -v` | 32 passed |
| Focused Bedrock/schema/diagnostic tests | 18 passed on host Node |
| Linux Node 22 focused tests | 18 passed using the existing image with read-only source mounts and no network; no image rebuilt |
| Syntax checks | Changed modules and tests passed |
| Protected source hashes | Unchanged |
| Mocked cloud Scan browser tests: `npm.cmd run test:mobile:web-dev -- cloud-scan.spec.js` with jobs mode | 3 passed; all Jobs/upload calls mocked, no AWS traffic |

The full existing browser suite (`npm.cmd run test:mobile:web-dev`) completed with **53 passed, 7 failed, 5 skipped**. A targeted `--last-failed` rerun completed with **3 passed and 4 failed**. Two initial planning failures came from the test API's HTTPS scheme conflicting with a test's HTTP loopback redirect; using the same HTTP scheme resolved both. The map layout test also passed on rerun. Four failures remain: three capture-state assertions in `mobile/e2e/auto-capture.spec.js` and one ambiguous `Claude Monet` text locator in `mobile/e2e/general-artwork.spec.js`. These tests mock the backend and do not execute the Bedrock parser; no UI or route changes were made to resolve them. The complete regression run is therefore **not all green**.

The actual valid captured Gemma fixture passes unchanged. Synthetic invalid responses reproduce `BEDROCK_SCHEMA` for missing properties, null/string/object/number arrays, extra nesting/properties, invalid enums, excessive lengths/counts, multiline strings and invalid nested artists. Tests confirm invalid values are neither accepted nor altered, and schema diagnostics do not leak into later JSON errors. Since the failed live object was not retained, **no test is labeled a reproduction of its exact invalid field**.

Browser regression runs disable dotenv loading and point API traffic at `https://unframe-test.invalid` (HTTP for the targeted rerun), with the existing mock handlers. These runs cannot submit jobs to the deployed API. Linux testing uses the existing local image with read-only source mounts and networking disabled; it is not a newly built/deployed image.

## Deployment requirement and next step

A **new Worker image is required** to activate the local diagnostics and prompt changes. The current v4/revision-5 deployment was not modified. Do not mark live Analyse or F12 successful based on local fixtures or mocks.

After authorization, deploy the new diagnostics/prompt and perform one bounded controlled validation, or inspect a safely derived validation-issue record from the failing response if one becomes available. Use its exact path/category to justify any further change; do not weaken the schema speculatively. A live success claim requires an actual cloud job to reach `SUCCEEDED`, with correlated Bedrock completion, persisted result and successful cleanup. The saved last observed status of the existing job remains `RETRYING`; this turn did not alter or re-query its automatic retries.
