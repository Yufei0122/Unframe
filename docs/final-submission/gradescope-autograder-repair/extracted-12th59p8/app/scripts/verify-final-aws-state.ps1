$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../verification/2026-10-31/aws-final'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
function Read-AwsEvidence([string]$name, [string[]]$arguments) {
    $result = & aws @arguments --profile default --region ap-southeast-2 --output json 2>&1
    $code = $LASTEXITCODE
    $body = $result -join "`n"
    [IO.File]::WriteAllText((Join-Path $destination "$name.json"), $body)
    Write-Output "$name exit=$code"
    if ($code -ne 0) { Write-Output $body }
}
Read-AwsEvidence 'identity' @('sts','get-caller-identity')
Read-AwsEvidence 'ecs-service' @('ecs','describe-services','--cluster','n12281212-strobe-a2','--services','a3-n12281212-unframe-worker')
Read-AwsEvidence 'ecs-task' @('ecs','describe-tasks','--cluster','n12281212-strobe-a2','--tasks','cb916ca6f0484d318109cddf9c3436a1','--query','tasks[].{taskArn:taskArn,taskDefinitionArn:taskDefinitionArn,lastStatus:lastStatus,healthStatus:healthStatus,cpu:cpu,memory:memory,containers:containers[].{name:name,image:image,imageDigest:imageDigest,lastStatus:lastStatus,healthStatus:healthStatus}}')
Read-AwsEvidence 'ecs-cluster' @('ecs','describe-clusters','--clusters','n12281212-strobe-a2','--include','SETTINGS')
Read-AwsEvidence 'api' @('apigatewayv2','get-api','--api-id','4xfbhsso7a')
Read-AwsEvidence 'api-stages' @('apigatewayv2','get-stages','--api-id','4xfbhsso7a')
Read-AwsEvidence 'api-routes' @('apigatewayv2','get-routes','--api-id','4xfbhsso7a','--query',"Items[?contains(RouteKey, '/a3/') || contains(RouteKey, '/api/ai/')]")
Read-AwsEvidence 'cloudfront' @('cloudfront','get-distribution','--id','E2CK5412ICFTJX')
Read-AwsEvidence 'frontend-location' @('s3api','get-bucket-location','--bucket','a3-n12281212-unframe-web')
Read-AwsEvidence 'frontend-tags' @('s3api','get-bucket-tagging','--bucket','a3-n12281212-unframe-web')
Read-AwsEvidence 'dashboard-before' @('cloudwatch','get-dashboard','--dashboard-name','a3-n12281212-unframe')
foreach ($queue in @('a3-n12281212-unframe-recognition','a3-n12281212-unframe-recognition-dlq')) {
    Read-AwsEvidence $queue @('sqs','get-queue-attributes','--queue-url',"https://sqs.ap-southeast-2.amazonaws.com/901444280953/$queue",'--attribute-names','ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible','ApproximateNumberOfMessagesDelayed','QueueArn')
}
Read-AwsEvidence 'scaling-targets-before' @('application-autoscaling','describe-scalable-targets','--service-namespace','ecs','--resource-ids','service/n12281212-strobe-a2/a3-n12281212-unframe-worker')
Read-AwsEvidence 'scaling-policies-before' @('application-autoscaling','describe-scaling-policies','--service-namespace','ecs','--resource-id','service/n12281212-strobe-a2/a3-n12281212-unframe-worker')
Read-AwsEvidence 'running-task-metric' @('cloudwatch','list-metrics','--namespace','ECS/ContainerInsights','--metric-name','RunningTaskCount','--dimensions','Name=ClusterName,Value=n12281212-strobe-a2','Name=ServiceName,Value=a3-n12281212-unframe-worker')
Read-AwsEvidence 'lambda-functions' @('lambda','list-functions','--query',"Functions[?contains(FunctionName, 'n12281212')].{name:FunctionName,role:Role,runtime:Runtime,handler:Handler,architecture:Architectures}")
