# Commands for the final AWS verification

Run from `D:\FlyFly\Study\Project\Unframe` in PowerShell. AWS commands use the existing default profile, account 901444280953, Sydney. No credential values belong in commands, files or output. The commands below are a record, not an instruction to rerun mutations or submit duplicate jobs.

## Read-only discovery and regression checks executed

```powershell
aws sts get-caller-identity --profile default --region ap-southeast-2
& ./scripts/verify-final-aws-state.ps1
& ./scripts/audit-final-resource-tags.ps1
node --test tests/aws-*.test.js tests/planning-runtime.test.js
node --test tests/*.test.js
npm.cmd --prefix mobile test
npm.cmd --prefix mobile run check
Get-FileHash artifacts/lambda/unframe-lambda-node22-x64.zip -Algorithm SHA256
```

The two PowerShell scripts contain the exact scoped CLI arguments for resource configuration, tags, queues, metrics discovery and scaling state. The preflight task ID is the verified current task; refresh it via `ecs list-tasks` before future use. The scripts save evidence locally; archive the current evidence directory before a future inspection so original snapshots are preserved.

## Single live Analyse and browser tests executed

```powershell
& mobile/node_modules/.bin/tsx.cmd scripts/verify-one-cloud-analyse.ts --execute
node scripts/verify-cloudfront-browser.mjs --execute
node scripts/verify-cloudfront-cache.mjs
```

The first two helpers exclusively create their evidence files and refuse repeat submission. Do not delete their guard files to rerun a live job. The browser's two initialization failures submitted zero jobs; their evidence was archived before the successful Chrome attempt. The successful run used camera permission denial and one public file upload, without mocked AWS responses or saved HAR/traces.

Safe persistent-result and cleanup checks:

```powershell
aws dynamodb get-item --cli-input-json file://verification/2026-10-31/aws-final/F12-read-job.json --profile default --region ap-southeast-2
aws s3api head-object --bucket a3-n12281212-unframe-job-images --key uploads/d697fc84-9c23-4f15-abd0-2bcd5f040dc8/image --profile default --region ap-southeast-2
```

Expected second command: 404 after automatic cleanup. It is a read, not deletion.

## Scaling mutations executed successfully

```powershell
aws application-autoscaling register-scalable-target --cli-input-json file://deployment/ecs/scalable-target.json --profile default --region ap-southeast-2
aws application-autoscaling put-scaling-policy --service-namespace ecs --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker --scalable-dimension ecs:service:DesiredCount --policy-name unframe-sqs-backlog --policy-type TargetTrackingScaling --target-tracking-scaling-policy-configuration file://deployment/ecs/autoscaling.json --profile default --region ap-southeast-2
aws application-autoscaling describe-scaling-policies --service-namespace ecs --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker --profile default --region ap-southeast-2
aws cloudwatch describe-alarms --alarm-name-prefix TargetTracking-service/n12281212-strobe-a2/a3-n12281212-unframe-worker --profile default --region ap-southeast-2
aws application-autoscaling describe-scaling-activities --service-namespace ecs --resource-id service/n12281212-strobe-a2/a3-n12281212-unframe-worker --include-not-scaled-activities --profile default --region ap-southeast-2
```

Denied quota inspection (no quota changes requested):

```powershell
aws service-quotas get-service-quota --service-code fargate --quota-code L-3032A538 --profile default --region ap-southeast-2
```

The following existing generator command was **NOT RUN**. It remains gated by capacity confirmation, healthy service, active metrics/policy, no significant backlog and no repeated failures:

```powershell
npm.cmd run load:jobs -- --execute --url https://4xfbhsso7a.execute-api.ap-southeast-2.amazonaws.com/prob --image mobile/assets/water-lilies.jpg --museum met --count 30 --concurrency 5
```

## Dashboard and tag mutations executed successfully

```powershell
node scripts/prepare-final-aws-evidence.mjs
$before = Get-Content verification/2026-10-31/aws-final/dashboard-before.json -Raw | ConvertFrom-Json
$current = aws cloudwatch get-dashboard --dashboard-name a3-n12281212-unframe --profile default --region ap-southeast-2 --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $current.DashboardBody -cne $before.DashboardBody) { throw 'Dashboard changed since review; do not overwrite.' }
aws cloudwatch put-dashboard --dashboard-name a3-n12281212-unframe --dashboard-body file://verification/2026-10-31/aws-final/F20-dashboard-replacement.json --profile default --region ap-southeast-2
aws s3control tag-resource --cli-input-json file://deployment/web/job-images-tags.review.json --profile default --region ap-southeast-2
aws logs tag-resource --resource-arn arn:aws:logs:ap-southeast-2:901444280953:log-group:/ecs/a3-n12281212-unframe-worker --tags file://deployment/monitoring/final-tags.review.json --profile default --region ap-southeast-2
aws logs tag-resource --resource-arn arn:aws:logs:ap-southeast-2:901444280953:log-group:/aws/lambda/a3-n12281212-unframe-jobs --tags file://deployment/monitoring/final-tags.review.json --profile default --region ap-southeast-2
$target = (Get-Content verification/2026-10-31/aws-final/F13-target.json -Raw | ConvertFrom-Json).ScalableTargets[0]
aws application-autoscaling tag-resource --resource-arn $target.ScalableTargetARN --tags file://deployment/monitoring/final-tags.review.json --profile default --region ap-southeast-2
$policy = (Get-Content verification/2026-10-31/aws-final/F13-policy.json -Raw | ConvertFrom-Json).ScalingPolicies[0]
foreach ($alarm in $policy.Alarms) { aws cloudwatch tag-resource --resource-arn $alarm.AlarmARN --tags file://deployment/monitoring/alarm-tags.review.json --profile default --region ap-southeast-2 }
```

Dashboard mutation changed only widget 3; the preparation script asserts equality for the six other widgets. Do not rerun an old replacement over later dashboard changes.

Actual metric retrieval used a 30-minute window with these arguments (the saved result includes exact datapoint timestamps):

```powershell
$start = [DateTime]::UtcNow.AddMinutes(-30).ToString('yyyy-MM-ddTHH:mm:ssZ')
$end = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
aws cloudwatch get-metric-data --metric-data-queries file://verification/2026-10-31/aws-final/metric-queries.json --start-time $start --end-time $end --profile default --region ap-southeast-2
```

## Planning attempt denied by AWS

```powershell
aws lambda get-function-configuration --function-name a3-n12281212-unframe-planning --profile default --region ap-southeast-2
aws iam list-attached-role-policies --role-name CAB432-Lambda-Role --profile default --region ap-southeast-2
aws lambda create-function --function-name a3-n12281212-unframe-planning --runtime nodejs22.x --role arn:aws:iam::901444280953:role/CAB432-Lambda-Role --handler server/cloud/planning.planningHandler --architectures x86_64 --timeout 30 --memory-size 1024 --zip-file fileb://artifacts/lambda/unframe-lambda-node22-x64.zip --environment file://verification/2026-10-31/aws-final/planning-env.json --tags 'purpose=assessment 3' --profile default --region ap-southeast-2
```

Discovery returned ResourceNotFound, role inspection AccessDenied, and CreateFunction an explicit identity-policy deny. No later deployment/API mutation was attempted. The ZIP was not rebuilt, pushed or deployed to Jobs.

## Submission preparation

```powershell
node scripts/prepare-a3-submission.mjs
node scripts/validate-a3-submission.mjs
```

This generates a source-only snapshot, resource inventory and draft YAML. It copies explicit source directories, skips symlinks/environment/credential/cache/build files and writes a SHA256 manifest. It neither creates AWS infrastructure nor submits to Canvas/Gradescope. Review pending limitations in `docs/a3-submission-audit.md` first.
