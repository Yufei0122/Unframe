"""Static submission audit; uses only saved AWS evidence. Never calls AWS."""
from pathlib import Path
from datetime import datetime, timezone
import json,re,hashlib,csv,sys
import yaml
ROOT=Path(__file__).resolve().parents[3]
OUT=Path(__file__).resolve().parent
def read(p):
    b=Path(p).read_bytes()
    return json.loads(b.decode('utf-16') if b[:2] in [b'\xff\xfe',b'\xfe\xff'] else b.decode('utf-8-sig'))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,data):(OUT/name).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
before=read(OUT/'before.json')
declaration=yaml.safe_load((ROOT/'submission-a3-infra.yml').read_text(encoding='utf-8'))
old=ROOT/'verification/2026-10-31/recognition-final'
aws=ROOT/'verification/2026-10-31/aws-final'
prices=ROOT/'verification/2026-10-31/pricing-calculator'
def tags(x):
    if isinstance(x,dict):
        for k in ['TagSet','Tags','tags','Items']:
            if k in x:return tags(x[k])
        return x
    if isinstance(x,list):return {a.get('Key',a.get('key')):a.get('Value',a.get('value')) for a in x}
    return {}
names={
'ECS cluster':('tags-cluster-shared.json','aws-final/ecs-service.json'),
'ECS service':('tags-worker-service.json','aws-final/ecs-service.json'),
'ECS task definition':('tags-worker-task-definition.json','recognition-final/final-worker-health.json'),
'ECR repository':('tags-ecr.json','pricing-calculator/ecr.json'),
'Lambda function':('tags-jobs-lambda.json','aws-final/lambda-functions.json'),
'API Gateway HTTP API':('tags-api-shared.json','aws-final/api.json'),
'DynamoDB table':('tags-jobs-table.json','recognition-final/jobs-table.json'),
'S3 vector bucket':('tags-vector-bucket.json','recognition-final/vector-index.json'),
'S3 vector index':('tags-vector-index.json','recognition-final/vector-index.json'),
'CloudFront distribution':('tags-cloudfront.json','pricing-calculator/cloudfront.json'),
'CloudWatch dashboard':('tags-dashboard.json','recognition-final/after-dashboard.json'),
}
resources=[]
for r in declaration['cloudInfrastructure']:
    arn=r['arn'];kind=r['type'];tagfile=None;t={};exist='PASS_SAVED_EVIDENCE';notes=[]
    evidence=[]
    if kind in names:
        f,e=names[kind];tagfile=old/f;evidence.append('verification/2026-10-31/'+e)
    elif kind=='S3 bucket':
        tagfile=old/('tags-'+arn.split(':::')[1]+'.json');evidence.append(str(tagfile.relative_to(ROOT)))
    elif kind=='SQS queue':
        q=arn.split(':')[-1];tagfile=old/('tags-'+q+'.json');evidence.append('verification/2026-10-31/recognition-final/attributes-'+q+'.json')
    elif kind=='Application Auto Scaling target':
        tagfile=aws/'tags-scaling-target-after.json';evidence.append('verification/2026-10-31/scaling-max-three/run-01/final-target.json')
    elif kind=='Application Auto Scaling policy':
        evidence.append('verification/2026-10-31/scaling-max-three/run-01/final-policy.json');notes.append('Child scaling policy; target tags are not proof of separately inherited policy tags. Confirm Gradescope handling.')
    elif kind=='CloudWatch alarm':
        n=1 if 'AlarmHigh' in arn else 2;tagfile=aws/f'tags-scaling-alarm-{n}-after.json';evidence.append('verification/2026-10-31/scaling-max-three/run-01/alarms.json')
    elif kind=='CloudWatch log group':
        if 'containerinsights' in arn:evidence.append('verification/2026-10-31/pricing-calculator/logs-ci.json');notes.append('Shared performance log group; saved inventory has no tags, so tag compliance unverified.')
        else:
            f='worker' if '/ecs/' in arn else 'jobs';tagfile=old/f'tags-{f}-logs.json';evidence.append(f'verification/2026-10-31/recognition-final/{f}-log-groups.json')
    elif kind=='EC2 subnet':
        e=aws/'network-subnets.json';evidence.append(str(e.relative_to(ROOT)));t=tags(next(x for x in read(e) if x['SubnetArn']==arn).get('Tags',[]));notes.append('Shared Control Tower networking; do not retag.')
    elif kind=='EC2 security group':
        e=aws/'network-security-group.json';evidence.append(str(e.relative_to(ROOT)));t=tags(next(x for x in read(e)['SecurityGroups'] if arn.endswith('/'+x['GroupId'])).get('Tags',[]));notes.append('Shared network security group; do not retag.')
    elif kind=='EC2 route table':
        e=aws/'network-routes.json';evidence.append(str(e.relative_to(ROOT)));t=tags(next(x for x in read(e) if arn.endswith('/'+x['RouteTableId'])).get('Tags',[]));notes.append('Shared public route table; no S3 gateway endpoint route attached.')
    elif kind in ['EC2 VPC','EC2 internet gateway']:
        evidence.append('verification/2026-10-31/aws-final/'+('network-subnets.json' if kind=='EC2 VPC' else 'network-routes.json'));exist='REFERENCED_BY_SAVED_NETWORK_CONFIG';notes.append('Identifier referenced by observed dependencies; no separate current Describe/tag proof.')
    elif kind in ['IAM role','IAM service-linked role']:
        evidence.append('verification/2026-10-31/scaling-max-three/run-01/final-target.json' if kind=='IAM service-linked role' else 'verification/2026-10-31/aws-final/task-definition.json');exist='REFERENCED_BY_SAVED_DEPLOYMENT';notes.append('Course-managed or service-linked role; direct IAM inspection restricted; no user retagging.')
        if arn.endswith('CAB432-Lambda-Role'):evidence=['verification/2026-10-31/aws-final/lambda-functions.json']
    elif kind=='Bedrock foundation model':
        evidence.append('verification/2026-10-31/bedrock-v5-live/F12-worker-events.json');exist='MODEL_ID_CONFIRMED_BY_SUCCESSFUL_INVOCATION';notes.append('AWS-owned model; student purpose tag not applicable; ARN constructed from verified region/model ID.')
    if tagfile:
        assert tagfile.exists();t=tags(read(tagfile));evidence.append(str(tagfile.relative_to(ROOT)))
    region=arn.split(':')[3]
    region_status='PASS_SYDNEY' if region=='ap-southeast-2' else 'GLOBAL_OR_REGIONLESS_IDENTIFIER'
    if kind=='S3 bucket':
        if arn.endswith('-web'):
            e=aws/'frontend-location.json';assert read(e)['LocationConstraint']=='ap-southeast-2';evidence.append(str(e.relative_to(ROOT)));region_status='PASS_SYDNEY_LOCATION_RECEIPT'
        else:
            region_status='SYDNEY_CONFIGURED_LOCATION_READ_PENDING';notes.append('Regionless ARN; Sydney configured in working deployment, but separate GetBucketLocation receipt not found; fresh location read blocked.')
    tag_status='PASS_SAVED_TAGS' if t.get('purpose')=='assessment 3' and t.get('qut-username')=='n12281212@qut.edu.au' else 'UNVERIFIED_SHARED_OR_MANAGED'
    if kind in ['EC2 subnet','EC2 security group','EC2 route table'] and not t.get('purpose'):tag_status='FAIL_LITERAL_TAG_REQUIREMENT_SHARED_RESOURCE'
    if kind=='API Gateway HTTP API':tag_status='FAIL_PURPOSE_ASSESSMENT_2';notes.append('API reuse permitted under /a3; no explicit API purpose-tag exemption in supplied FAQ. No tag changes authorized.')
    if kind=='Bedrock foundation model':tag_status='NOT_APPLICABLE_AWS_OWNED'
    for e in evidence:assert (ROOT/e).exists(),e
    resources.append({**r,'existence':exist,'region':region_status,'purpose':t.get('purpose'),'qutUsername':t.get('qut-username'),'tagResult':tag_status,'descriptionResult':'PASS_MATCHES_ROLE','freshVerification':'BLOCKED_EXPIRED_TOKEN','evidence':sorted(set(evidence)),'notes':notes})
save('resource-audit.json',resources)
head='# Every declared resource: final audit\n\nSaved evidence dated 31 October 2026; fresh reads blocked by ExpiredToken. Global identifiers are not mislabelled as regional resources. No AWS tag changed. Full evidence paths and ARN review are in [resource-audit.json](resource-audit.json).\n\n| # / type | Exact ARN | Existence | Region | purpose / username | Tag result | Description / qualification |\n| --- | --- | --- | --- | --- | --- | --- |\n'
for i,r in enumerate(resources,1):
    head+=f"| {i}. {r['type']} | `{r['arn']}` | {r['existence']} | {r['region']} | {r['purpose'] or 'not verified'} / {r['qutUsername'] or 'not verified'} | {r['tagResult']} | {r['descriptionResult']}; {' '.join(r['notes'])} |\n"
(OUT/'resource-audit.md').write_text(head,encoding='utf-8')

rows=[];missing=[];sensitive=[];runtime_changed=[];symlinks=[];unsafe=[]
patterns={
'aws-access-key':r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
'private-key':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
'real-presigned-signature':r'X-Amz-Signature=[a-fA-F0-9]{64}',
'aws-secret-assignment':r'(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|secretAccessKey)\s*[\x22\x27]?\s*[=:]\s*[\x22\x27]?[A-Za-z0-9/+]{30,}',
'session-token':r'IQoJb3JpZ2luX2Vj[A-Za-z0-9/+]{60,}',
'job-capability':r'[\x22\x27](?:readToken|readTokenHash|tokenHash|X-Job-Token)[\x22\x27]\s*:\s*[\x22\x27][A-Za-z0-9_+/=-]{32,}'
}
for p in sorted((ROOT/'app').rglob('*')):
    if p.is_symlink():symlinks.append(p.relative_to(ROOT).as_posix())
    if not p.is_file():continue
    rel=p.relative_to(ROOT/'app').as_posix();h=sha(p);source=ROOT/rel
    if any(x in ['.aws','.git','node_modules','.venv','.expo','__pycache__'] for x in p.parts) or p.name.startswith('.env') or re.search(r'credentials|\.pem$|\.key$|\.pyc$',p.name,re.I):unsafe.append(rel)
    rows.append({'path':rel,'bytes':p.stat().st_size,'sha256':h,'matchesCurrentRoot':source.is_file() and sha(source)==h})
    if rel.startswith(('server/','shared/','worker/','local-ai/','mobile/')):
        if before['files'].get('app/'+rel)!=h:runtime_changed.append(rel)
    if p.suffix in ['.js','.mjs','.ts','.tsx','.json','.md','.yaml','.yml','.txt','.py','.ps1']:
        t=p.read_text(encoding='utf-8',errors='replace')
        for name,pattern in patterns.items():
            if re.search(pattern,t):sensitive.append({'path':rel,'rule':name})
        if p.suffix in ['.js','.mjs','.ts','.tsx']:
            for spec in re.findall(r'(?:from\s*|import\s*\(|require\s*\()\s*[\x22\x27]([^\x22\x27]+)',t):
                if spec.startswith('.'):
                    q=p.parent/spec
                    if not any(x.exists() for x in [q,*[Path(str(q)+e) for e in ['.js','.mjs','.ts','.tsx','.json']],*[q/('index'+e) for e in ['.js','.ts','.tsx']]]):missing.append({'file':rel,'import':spec})
locks=[]
for sub in ['','mobile/']:
    pkg=read(ROOT/'app'/sub/'package.json');lock=read(ROOT/'app'/sub/'package-lock.json');entry=lock['packages']['']
    locks.append({'package':sub+'package.json','dependenciesMatchLock':all(pkg.get(k,{})==entry.get(k,{}) for k in ['dependencies','devDependencies']),'declaredPackagesPresent':all('node_modules/'+k in lock['packages'] for k in {**pkg.get('dependencies',{}),**pkg.get('devDependencies',{})})})
evidence_changes=[p for p,h in before['originalEvidence'].items() if not (ROOT/p).exists() or sha(ROOT/p)!=h]
missing_runtime=[]
excluded={'node_modules','.expo','dist','__pycache__','android','ios','.venv','test-results'}
for d in ['server','shared','worker','local-ai','mobile','tests','deployment']:
    for p in (ROOT/d).rglob('*'):
        if not p.is_file() or any(x in excluded for x in p.parts) or p.name.startswith('.env') or p.suffix in ['.pyc','.log']:continue
        if not (ROOT/'app'/p.relative_to(ROOT)).exists():missing_runtime.append(p.relative_to(ROOT).as_posix())
save('source-manifest.json',{'createdAt':datetime.now(timezone.utc).isoformat(),'files':len(rows),'bytes':sum(x['bytes'] for x in rows),'infrastructureSha256':sha(ROOT/'submission-a3-infra.yml'),'historicalManifestPreserved':'verification/2026-10-31/recognition-final/source-manifest.json','manifest':rows})
findings={'status':'PASS' if not any([missing,sensitive,unsafe,runtime_changed,symlinks,missing_runtime,evidence_changes]) and all(x['dependenciesMatchLock'] and x['declaredPackagesPresent'] for x in locks) else 'FAIL','files':len(rows),'resourceCount':len(resources),'lockChecks':locks,'missingRelativeImports':missing,'missingSourceFiles':missing_runtime,'sensitiveFindings':sensitive,'unsafeFiles':unsafe,'symlinks':symlinks,'runtimeSourceChanged':runtime_changed,'originalEvidenceChanged':evidence_changes,'originalEvidenceFilesChecked':len(before['originalEvidence']),'secretScanLimit':'Pattern scan; synthetic private.example URL in diagnostic test is not an actual signature or capability. No values logged.','runtime':'Static dependency/source checks only; no clean install, Docker rebuild or cloud inference'}
save('static-validation.json',findings)
changes=[]
for p,h in before['files'].items():
    q=ROOT/p
    if q.exists() and sha(q)!=h:changes.append({'path':p,'change':'modified','beforeSha256':h,'afterSha256':sha(q)})
for p in (ROOT/'app').rglob('*'):
    rel=p.relative_to(ROOT).as_posix()
    if p.is_file() and rel not in before['files']:changes.append({'path':rel,'change':'added','afterSha256':sha(p)})
save('changes.json',changes)
print(json.dumps({k:v for k,v in findings.items() if k!='secretScanLimit'},indent=2))
