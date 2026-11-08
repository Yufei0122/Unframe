# Bedrock parser Worker deployment attempt — 31 October 2026

This records the initial blocked attempt. See [the resumed deployment and F12 result](bedrock-v4-live-verification.md): v4 deployment subsequently passed, but the single live Analyse job failed with `BEDROCK_SCHEMA`.

**Overall: FAIL / BLOCKED before ECR push.** The user requested stopping on deployment or Analyse failure, so no retry through an alternate Docker credential configuration was attempted.

## Confirmed blocker

AWS STS authentication succeeded for the default profile in account `901444280953`. Before pushing, the ECR image list confirmed `v4` was unused. The following login failed locally:

```powershell
aws ecr get-login-password --profile default --region ap-southeast-2 | docker login --username AWS --password-stdin 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com
```

Docker reported:

```text
error saving credentials: error storing credentials - err: exit status 1, out: `The stub received bad data.`
```

The login command exited 1, and the explicit exit guard prevented `docker push` from running. This is a local Docker credential-helper error; it is not evidence of an ECR/IAM/SCP denial. The token was piped via stdin and was not printed or saved in project evidence.

## Completed verification

| Check | Actual result |
| --- | --- |
| Corrected source | Whole-response fenced JSON parsing present in `server/ai/bedrock.js`; strict completion/schema checks retained |
| Root regression | 164 passed, 0 failed |
| Mobile regression | 40 passed, 0 failed; TypeScript passed |
| Production build | PASS, existing `worker/Dockerfile`, Linux/amd64 |
| Parser tests inside image | 11 passed, Node 22, network disabled |
| Resource-limit test | PASS, production worker entry point, real OpenCLIP, 0.5 CPU / 2 GiB / no swap |
| AWS scope of container test | All AWS SDK boundaries mocked; network disabled; no real jobs |
| Local recognition checks | 12 jobs completed, MET Water Lilies match and GOMA exclusion, normalized 512D embeddings, metadata filters and top-three checks passed |
| Health | 15 harness checks passed, Docker health observed healthy |
| Peak cgroup memory | 1,797,013,504 bytes, approximately 1.67 GiB |
| OOM | Zero OOM/OOM-kill events; process exit 0 |
| Startup | 33.4 seconds measured by the harness, excluding its preceding private model-cache copy |
| Test duration | 81.688 seconds measured by the harness, including idle observation |
| CPU | 28.79% of one core averaged over the harness interval, including idle time |
| Existing ECS configuration | Revision 4, desired/running 1, CPU 512 / memory 2048; roles, environment, health, logging and network snapshot saved |

Build command:

```powershell
docker build --platform linux/amd64 -f worker/Dockerfile -t 901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v4 .
```

The resource test used `scripts/verify-worker-private-cache.sh` and `scripts/verify-worker-limits.mjs`, with `--network none --cpus 0.5 --memory 2g --memory-swap 2g`, read-only local fixtures, and a writable evidence directory. The additional image-local Bedrock tests replayed the sanitized prior AWS response; they did not make a new Bedrock call.

## Image and deployment identity

- Local image tag: `901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/a3-n12281212-unframe-worker:v4` — **not pushed**.
- Local build manifest-list digest: `sha256:3899104485df64461bbba840c7639a51de541a20b88a8c578dbd5be9ccfed152` — **not confirmed in ECR**.
- Local Linux/amd64 manifest: `sha256:4c300a3f72bdabed54f2bd88899edc4c997a45cf91c15a3c8da3c98fe84b5d20`.
- Built and local Bedrock source SHA-256 both: `c9315a3261aae3673bcaf54f02431dafb31332188f12dd41fd4ff751b5858661`.
- New task definition revision: **none**. No registration or service update was attempted; the preflight service uses revision 4 / v3.
- Real Analyse Job ID: **none**. No job was created, uploaded or polled.
- Live Bedrock invocation / DynamoDB result / S3 cleanup / F12 job evidence: **not tested in this attempt**.

No IAM/SCP change, DLQ modification, load test, service recreation or AWS deployment occurred.

## Prepared evidence tooling and remaining verification limitation

`scripts/verify-one-cloud-analyse.ts` now accepts the local `UNFRAME_ANALYSE_EVIDENCE_DIR` environment variable to avoid overwriting earlier one-job evidence. Its exclusive-file guard and single-submission behavior are unchanged. `scripts/collect-analyse-evidence.mjs` is prepared for read-only projected DynamoDB verification, S3 object absence and allowlisted CloudWatch events for that one job; it was syntax-checked but not executed because there is no new job.

The required exact `water-lilies.jpg` / `operation=analyse` / museum `met` request can legitimately return `method=collection` before invoking Bedrock. This follows the existing strong-reference shortcut in `server/ai/artwork-analysis.js`, which was not changed. A successful catalogue result must not be reported as a Bedrock invocation. This remains a constraint on the eventual F12 verification even after deployment succeeds.

Evidence: `artifacts/bedrock-v4-deployment/` contains build, container parser tests, resource-test logs/summary and preflight ECS snapshots. `verification/2026-10-31/bedrock-v4/root-tests.txt` contains the full root regression result. No capability tokens or presigned URLs were written.

Next action: repair the local Docker credential-helper problem, then resume from ECR login/push after rechecking that `v4` is still unused. Preserve the tested image and pin any subsequently registered task revision to the digest actually confirmed by ECR. Do not claim a deployed fix until the running task digest is verified.
