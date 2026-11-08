# Frontend deployment review

**Current deployed state:** the subsequent authorized setup is live at https://d3x3iexpafsgf.cloudfront.net, distribution E2CK5412ICFTJX, using PriceClass_100 and the explicitly confirmed frontend-only public policy. Exact-origin A3 CORS is applied. See [the live report](../../docs/aws-live-deployment-report.md). The preparation/review-only statements below describe the earlier task, not the current deployed state.

Prepared against account 901444280953, Sydney, 31 October 2026. These files do not deploy themselves.

- Confirmed bucket `a3-n12281212-unframe-web` exists, is empty, has all four Block Public Access settings enabled, and has no website configuration or bucket policy. `bucket-tags.json` preserves its existing username tag and adds `purpose=assessment 3`.
- Export uses `EXPO_PUBLIC_API_URL=https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob`. Both `prob` and `$default` were discovered and returned the application's `JOB_NOT_FOUND` response to a token-free GET. The selected base deliberately includes `prob`; do not append another stage or `/a3`.
- The current export uses direct cross-origin API requests. The proposed distribution has only a static S3 REST origin; it does not proxy the shared API's unrelated A2 routes.
- 100 OACs were listed. None is project-owned; a name containing CAB432 belongs to an instructor demo and is not evidence of permission to reuse it. Applied quota inspection was denied. Do not create or repurpose an OAC without instructor confirmation. AWS documents a default 100 OACs/account: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html

## CloudFront proposal — review only

`cloudfront-public-origin.review.json` follows the instructor workaround described in the request. It uses the dedicated static bucket's REST endpoint, HTTPS viewer redirect, default root `index.html`, GET/HEAD only, compression and short default cache lifetime. No OAC or website endpoint is created. Add the required distribution tag `purpose=assessment 3` when a future creation is authorized.

`frontend-public-policy.review.json` allows only GetObject on the static frontend bucket. Applying it would require disabling **only** that bucket's `BlockPublicPolicy` and `RestrictPublicBuckets`, while retaining `BlockPublicAcls=true` and `IgnorePublicAcls=true`. Account-level restrictions can still block it; do not weaken account-wide protections or bypass SCPs. This proposal does not grant ListBucket, writes, visitor-image access or vector-index access. The job-images bucket must keep all public-access blocks enabled.

No public policy, public-access change or distribution change is authorized for automatic application in this task. An approved existing suitable OAC is preferable if the instructor identifies one; that alternative needs its exact ID plus a CloudFront service-principal bucket policy scoped to the final distribution ARN, instead of this public policy.

There are deliberately no blanket 403/404 → 200 error responses. The default root handles `/`; direct deep links need separate verification and, if necessary, a narrowly scoped frontend URI rewrite. Do not turn API errors or missing JS/assets into index.html. APIs are cross-origin and their errors remain intact.

## Final-domain CORS — review only

Replace `<FINAL_CLOUDFRONT_DOMAIN>` in both CORS files after a distribution has actually been created. No wildcard origins.

1. Review/merge `upload-cors.review.json` into **job-images** bucket CORS. PUT allows the presigned `Content-Type` and `If-None-Match` headers; CORS does not make this bucket public.
2. Merge `JOBS_ALLOWED_ORIGINS=https://<FINAL_CLOUDFRONT_DOMAIN>` into existing Jobs Lambda environment variables. Do not replace its whole environment map with this one key. Its observed timeout is only 3 seconds; review the existing 15-second deployment recommendation separately.
3. Set the Planning Lambda `AI_ALLOWED_ORIGINS` to the same exact origin at its later deployment.
4. Review `api-cors.review.json` before configuring HTTP API `4xfbhsso7a`. CORS is **API-wide**, including existing A2 routes. Inventory those clients' exact origins and authorization headers before merging. This file is the A3 minimum, not permission to break A2 clients. API Gateway handles preflight when its CORS is configured; align allowed origins with the Lambda checks.

## Rebuild and upload

```powershell
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_RECOGNITION_MODE='jobs'
$env:EXPO_PUBLIC_RECOGNITION_JOB_TIMEOUT_MS='300000'
$env:EXPO_PUBLIC_API_URL='https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob'
npm.cmd --prefix mobile run export:web -- --clear
Test-Path mobile/dist/index.html
aws s3 sync mobile/dist/ s3://a3-n12281212-unframe-web/ --profile default --region ap-southeast-2 --dryrun
# Only after the verified export/destination review and AWS-write authorization:
aws s3 sync mobile/dist/ s3://a3-n12281212-unframe-web/ --profile default --region ap-southeast-2
```

Do not use `--delete`. Uploading into the private bucket is not public release or end-to-end verification. Keep frontend publication blocked until the worker failure, planning routes, final-domain CORS and demo access controls have been addressed. CORS is not authentication; the Jobs create route currently has no authorizer.

The first ordinary export reused a cached localhost API setting despite the new environment value. Clearing Metro's cache corrected it. Always inspect the JavaScript referenced by the generated index.html for the actual API base before upload; a successful build exit alone is insufficient. The verified export contains 68 files, 13,345,406 bytes, and bundle `index-31a0793bc093765b55760af215024b9e.js`.

The final instruction for this preparation is **keep all AWS changes prepared only**. The upload command above is a future operator command; only its `--dryrun` form was executed. The frontend bucket remains private and empty.
