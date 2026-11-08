$ErrorActionPreference = 'Continue'
$dest = if ($env:UNFRAME_FINAL_DIR) { $env:UNFRAME_FINAL_DIR } else { Join-Path $PSScriptRoot '../verification/2026-10-31/aws-final' }
function Save-Aws([string]$name, [string[]]$arguments) {
    $output = & aws @arguments --profile default --region ap-southeast-2 --output json 2>&1
    $exitCode = $LASTEXITCODE
    [IO.File]::WriteAllText((Join-Path $dest "$name.json"), ($output -join "`n"))
    Write-Output "$name exit=$exitCode"
}
$prefix = 'arn:aws:'
Save-Aws 'tags-jobs-lambda' @('lambda','list-tags','--resource','arn:aws:lambda:ap-southeast-2:901444280953:function:a3-n12281212-unframe-jobs')
Save-Aws 'tags-jobs-table' @('dynamodb','list-tags-of-resource','--resource-arn','arn:aws:dynamodb:ap-southeast-2:901444280953:table/a3-n12281212-unframe-jobs')
Save-Aws 'jobs-table' @('dynamodb','describe-table','--table-name','a3-n12281212-unframe-jobs')
Save-Aws 'jobs-ttl' @('dynamodb','describe-time-to-live','--table-name','a3-n12281212-unframe-jobs')
foreach ($bucket in @('a3-n12281212-unframe-web','a3-n12281212-unframe-job-images')) {
    Save-Aws "tags-$bucket" @('s3api','get-bucket-tagging','--bucket',$bucket)
    Save-Aws "public-access-$bucket" @('s3api','get-public-access-block','--bucket',$bucket)
}
Save-Aws 'image-lifecycle' @('s3api','get-bucket-lifecycle-configuration','--bucket','a3-n12281212-unframe-job-images')
Save-Aws 'image-notifications' @('s3api','get-bucket-notification-configuration','--bucket','a3-n12281212-unframe-job-images')
foreach ($queue in @('a3-n12281212-unframe-recognition','a3-n12281212-unframe-recognition-dlq')) {
    $url = "https://sqs.ap-southeast-2.amazonaws.com/901444280953/$queue"
    Save-Aws "tags-$queue" @('sqs','list-queue-tags','--queue-url',$url)
    Save-Aws "attributes-$queue" @('sqs','get-queue-attributes','--queue-url',$url,'--attribute-names','All')
}
Save-Aws 'tags-worker-service' @('ecs','list-tags-for-resource','--resource-arn','arn:aws:ecs:ap-southeast-2:901444280953:service/n12281212-strobe-a2/a3-n12281212-unframe-worker')
$taskArn = & aws ecs describe-services --cluster n12281212-strobe-a2 --services a3-n12281212-unframe-worker --query 'services[0].taskDefinition' --output text --profile default --region ap-southeast-2 --no-cli-pager
if ($LASTEXITCODE -eq 0) { Save-Aws 'tags-worker-task-definition' @('ecs','list-tags-for-resource','--resource-arn',$taskArn) }
Save-Aws 'tags-cluster-shared' @('ecs','list-tags-for-resource','--resource-arn','arn:aws:ecs:ap-southeast-2:901444280953:cluster/n12281212-strobe-a2')
Save-Aws 'tags-ecr' @('ecr','list-tags-for-resource','--resource-arn','arn:aws:ecr:ap-southeast-2:901444280953:repository/a3-n12281212-unframe-worker')
Save-Aws 'tags-cloudfront' @('cloudfront','list-tags-for-resource','--resource','arn:aws:cloudfront::901444280953:distribution/E2CK5412ICFTJX')
Save-Aws 'tags-dashboard' @('cloudwatch','list-tags-for-resource','--resource-arn','arn:aws:cloudwatch::901444280953:dashboard/a3-n12281212-unframe')
Save-Aws 'tags-api-shared' @('apigatewayv2','get-tags','--resource-arn','arn:aws:apigateway:ap-southeast-2::/apis/4xfbhsso7a')
$vectorBucket = 'arn:aws:s3vectors:ap-southeast-2:901444280953:bucket/a3-n12281212-unframe-vectors'
Save-Aws 'tags-vector-bucket' @('s3vectors','list-tags-for-resource','--resource-arn',$vectorBucket)
Save-Aws 'tags-vector-index' @('s3vectors','list-tags-for-resource','--resource-arn',"$vectorBucket/index/a3-n12281212-unframe-vectors")
Save-Aws 'vector-index' @('s3vectors','get-index','--index-arn',"$vectorBucket/index/a3-n12281212-unframe-vectors")
Save-Aws 'vector-keys' @('s3vectors','list-vectors','--index-arn',"$vectorBucket/index/a3-n12281212-unframe-vectors",'--max-results','100')
Save-Aws 'worker-log-groups' @('logs','describe-log-groups','--log-group-name-prefix','/ecs/a3-n12281212-unframe-worker')
Save-Aws 'jobs-log-groups' @('logs','describe-log-groups','--log-group-name-prefix','/aws/lambda/a3-n12281212-unframe-jobs')
Save-Aws 'tags-worker-logs' @('logs','list-tags-for-resource','--resource-arn','arn:aws:logs:ap-southeast-2:901444280953:log-group:/ecs/a3-n12281212-unframe-worker')
Save-Aws 'tags-jobs-logs' @('logs','list-tags-for-resource','--resource-arn','arn:aws:logs:ap-southeast-2:901444280953:log-group:/aws/lambda/a3-n12281212-unframe-jobs')
Save-Aws 'scaling-activities' @('application-autoscaling','describe-scaling-activities','--service-namespace','ecs','--resource-id','service/n12281212-strobe-a2/a3-n12281212-unframe-worker','--include-not-scaled-activities')
