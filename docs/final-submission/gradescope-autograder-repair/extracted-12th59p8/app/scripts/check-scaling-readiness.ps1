# Read-only. Never invokes the load generator, receives messages or changes scaling.
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '../verification/2026-10-31/bedrock-followup'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
function Save-Read([string]$name, [string[]]$arguments) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $result = & aws @arguments --profile default --region ap-southeast-2 --output json --no-cli-pager 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    $body = $result -join "`n"
    [IO.File]::WriteAllText((Join-Path $dest "$name.json"), $body, [Text.UTF8Encoding]::new($false))
    Write-Host "$name exit=$code"
    return $code
}
if ((Save-Read 'auth' @('sts','get-caller-identity')) -ne 0) { throw 'AWS authentication unavailable. No further AWS checks or load submissions performed.' }
$identity = Get-Content (Join-Path $dest 'auth.json') -Raw | ConvertFrom-Json
if ($identity.Account -ne '901444280953') { throw 'Unexpected AWS account' }
$resource = 'service/n12281212-strobe-a2/a3-n12281212-unframe-worker'
[void](Save-Read 'scaling-target' @('application-autoscaling','describe-scalable-targets','--service-namespace','ecs','--resource-ids',$resource))
[void](Save-Read 'scaling-policy' @('application-autoscaling','describe-scaling-policies','--service-namespace','ecs','--resource-id',$resource))
[void](Save-Read 'scaling-activities' @('application-autoscaling','describe-scaling-activities','--service-namespace','ecs','--resource-id',$resource,'--include-not-scaled-activities'))
[void](Save-Read 'service' @('ecs','describe-services','--cluster','n12281212-strobe-a2','--services','a3-n12281212-unframe-worker'))
[void](Save-Read 'cluster' @('ecs','describe-clusters','--clusters','n12281212-strobe-a2','--include','SETTINGS'))
[void](Save-Read 'quota' @('service-quotas','get-service-quota','--service-code','fargate','--quota-code','L-3032A538'))
foreach ($queue in @('a3-n12281212-unframe-recognition','a3-n12281212-unframe-recognition-dlq')) {
    [void](Save-Read $queue @('sqs','get-queue-attributes','--queue-url',"https://sqs.ap-southeast-2.amazonaws.com/901444280953/$queue",'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed'))
}
$start = [DateTime]::UtcNow.AddMinutes(-30).ToString('yyyy-MM-ddTHH:mm:ssZ')
$end = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
[void](Save-Read 'metrics' @('cloudwatch','get-metric-data','--metric-data-queries','file://verification/2026-10-31/aws-final/metric-queries.json','--start-time',$start,'--end-time',$end))
[void](Save-Read 'jobs-lambda' @('lambda','get-function-configuration','--function-name','a3-n12281212-unframe-jobs','--query','{FunctionName:FunctionName,Role:Role,Runtime:Runtime,Handler:Handler,Timeout:Timeout,MemorySize:MemorySize,RevisionId:RevisionId,LastUpdateStatus:LastUpdateStatus,State:State}'))
Write-Host 'Read-only checks finished. Load test remains NOT EXECUTED; inspect each result and quota/failure gates.'
