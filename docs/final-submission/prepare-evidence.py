"""Read-only source audit and byte-identical evidence copies. No AWS calls."""
from pathlib import Path
import json, hashlib, re, shutil, csv, zipfile, zlib
from datetime import datetime, timezone
import yaml

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
def read(p): return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name, value):
    p = OUT/name; p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

secret_patterns = {
 'aws-access-key': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
 'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'signed-url': re.compile(r'[?&]X-Amz-(?:Signature|Credential|Security-Token)=[^\s"<>]+',re.I),
 'literal-aws-secret': re.compile(r'(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*[\x22\x27]?[A-Za-z0-9/+]{30,}'),
 'literal-read-token': re.compile(r'"(?:readToken|readTokenHash|tokenHash|X-Job-Token)"\s*:\s*"[A-Za-z0-9_+/=-]{32,}"',re.I)
}
def scan(p):
    if p.suffix.lower() in ['.png','.jpg','.jpeg','.pdf','.woff','.woff2','.ttf']: return []
    text=p.read_text(encoding='utf-8',errors='replace')
    return [name for name,pattern in secret_patterns.items() if pattern.search(text)]

base='verification/2026-10-31/'
manifest=[]
def copy(src,dest):
    p=ROOT/src if not Path(src).is_absolute() else Path(src)
    findings=scan(p)
    if findings: raise RuntimeError('Unsafe copy rejected: '+str(src)+' '+','.join(findings))
    q=OUT/'evidence'/dest; q.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(p,q)
    manifest.append({'source':str(p),'copy':q.relative_to(OUT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size,'sourceFileModifiedUtc':datetime.fromtimestamp(p.stat().st_mtime,timezone.utc).isoformat(),'transformation':'none; byte-identical copy'})

groups={
 'config': ('recognition-final', ['resource-inventory.json','jobs-table.json','jobs-ttl.json','image-lifecycle.json','image-notifications.json','vector-index.json','vector-keys.json','public-access-a3-n12281212-unframe-job-images.json','public-access-a3-n12281212-unframe-web.json','attributes-a3-n12281212-unframe-recognition.json','attributes-a3-n12281212-unframe-recognition-dlq.json']),
 'recognition': ('recognition-final',['F18-browser.json','F18-candidate.png','F18-confirmation.png','F19-cache.json','F14-load-results.json']),
 'bedrock': ('bedrock-v5-live',['F12-summary.json','F12-worker-events.json']),
 'scaling': ('scaling-max-three/run-01',['F14-F16-verdict.json','F14-F16-metrics.csv','F14-F16-cloudwatch-metrics.json','F15-F16-scaling-activities.json','F14-queue.png','F15-F16-running.png','worker-utilization.png','final-health.json','final-target.json','final-policy.json','run-summary.json','jobs.json','stopped-tasks.json','alarms.json','alarm-0-history.json','alarm-1-history.json','observations.json']),
 'monitoring': ('recognition-final',['F20-graphs.json']+[f'F20-widget-{i}.png' for i in range(7)]),
 'cost': ('pricing-calculator',['calculator-model.json','lambda-reports.json','safe-worker-cost-settings.json','vector-sizes.json','ecr-scanning.json','ecr-unique-layers.json','vpc-endpoints.json','cloudfront.json','api-routes.json','api-stage.json'])
}
for group,(sub,files) in groups.items():
    for f in files: copy(base+sub+'/'+f,group+'/'+f)
for p in (ROOT/base/'recognition-final').glob('tags-*.json'): copy(str(p),'tags/'+p.name)
for p in (ROOT/base/'pricing-calculator/prices').glob('*.json'): copy(str(p),'cost/prices/'+p.name)
copy('artifacts/bedrock-v5-deployment/worker-limits/summary.json','local/v5-worker-limits.json')
copy('artifacts/bedrock-v5-deployment/deployment-verified.json','config/v5-deployment-verified.json')
copy('artifacts/bedrock-v5-deployment/ecr-v5.json','config/ecr-v5.json')
for f in ['root-tests.txt','mobile-tests.txt','mobile-check.txt','browser-focused.txt']:
    copy(base+'bedrock-v5/'+f,'local/'+f)

# Existing public Calculator export: extract literal text/URI objects only.
pdf=Path(r'D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\a86ca30d-a6c7-48f0-a909-28baa0981bb1.pdf')
copy(str(pdf),'cost/calculator-export-2026-10-31.pdf')
b=pdf.read_bytes(); lines=[]
for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream',b,re.S):
    try: stream=zlib.decompress(m[1])
    except zlib.error: stream=m[1]
    if b' Tm ' not in stream: continue
    for t in re.findall(rb'\[((?:.|\n)*?)\]\s*TJ',stream):
        parts=re.findall(rb'\(((?:\\.|[^\\)])*)\)',t)
        lines.append(b''.join(parts).replace(b'\\(',b'(').replace(b'\\)',b')').decode('latin1'))
urls=[x.decode('ascii') for x in re.findall(rb'/URI\s*\(([^)]+)\)',b)]
(OUT/'evidence/cost/calculator-extracted-text.txt').write_text('\n'.join(lines)+'\n\n'+ '\n'.join(urls)+'\n',encoding='utf-8')
save('evidence/cost/calculator-extraction-provenance.json',{'sourceSha256':sha(pdf),'method':'PDF literal TJ strings and URI annotations; not OCR; layout not rendered','exportDate':'2026-10-31','displayedMonthlyUsd':34.69,'displayedAnnualUsd':416.28,'links':urls,'shareLinkExtractedFromOriginal':True,'liveShareLinkNotVerified':True})

# Inventory every submitted file; compare all 315 original manifest entries.
old=read(ROOT/base/'recognition-final/source-manifest.json')
prior={x['path']:x['sha256'] for x in old['manifest']}
rows=[]; hits=[]; missing_local=[]; external=[]
for p in sorted((ROOT/'app').rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(ROOT/'app').as_posix(); root=ROOT/rel
    h=sha(p); same=root.is_file() and sha(root)==h
    category='runtime/source'
    if rel.startswith('docs/') or p.suffix=='.md': category='documentation; historical claims need scope review'
    elif rel.startswith('tests/') or '/tests/' in rel or '/e2e/' in rel: category='test; fixtures and optional integrations may be needed'
    elif rel.startswith('scripts/'): category='tooling; not automatically executed for submission'
    elif rel.startswith('deployment/'): category='configuration/template; not proof of deployment'
    elif '/assets/' in rel: category='bundled application/catalogue asset'
    rows.append({'path':rel,'bytes':p.stat().st_size,'sha256':h,'inOriginal315':rel in prior,'originalHashMatches':prior.get(rel)==h if rel in prior else None,'matchesCurrentRoot':same,'classification':category})
    for rule in scan(p): hits.append({'path':rel,'rule':rule})
    if p.suffix in ['.js','.mjs','.ts','.tsx']:
        text=p.read_text(encoding='utf-8',errors='replace')
        for spec in re.findall(r'(?:from\s*|import\s*\(|require\s*\()\s*[\x22\x27]([^\x22\x27]+)',text):
            if spec.startswith('.'):
                target=p.parent/spec
                if not any(x.exists() for x in [target,*[Path(str(target)+ext) for ext in ['.js','.mjs','.ts','.tsx','.json']],*[target/('index'+ext) for ext in ['.js','.ts','.tsx']]]): missing_local.append({'file':rel,'import':spec})
            elif not spec.startswith('node:'): external.append({'file':rel,'module':spec})
with (OUT/'source-file-audit.csv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
lock_checks=[]
for sub in ['', 'mobile/']:
    pkg=read(ROOT/'app'/sub/'package.json'); lock=read(ROOT/'app'/sub/'package-lock.json'); entry=lock['packages']['']
    lock_checks.append({'package':sub+'package.json','rootDependenciesMatch':pkg.get('dependencies',{})==entry.get('dependencies',{}),'rootDevDependenciesMatch':pkg.get('devDependencies',{})==entry.get('devDependencies',{}),'declaredDependenciesPresentInLock':all('node_modules/'+k in lock['packages'] for k in {**pkg.get('dependencies',{}),**pkg.get('devDependencies',{})})})
inv=yaml.safe_load((ROOT/'submission-a3-infra.yml').read_text(encoding='utf-8'))
oldinv=read(ROOT/base/'recognition-final/resource-inventory.json')
resource_rows=[{'type':x['type'],'arn':x['arn'],'matchesCollectedInventory':any(y['arn']==x['arn'] for y in oldinv),'regionCheck':':ap-southeast-2:' in x['arn'] or x['arn'].startswith(('arn:aws:s3:::','arn:aws:iam::','arn:aws:cloudfront::','arn:aws:cloudwatch::'))} for x in inv['cloudInfrastructure']]
save('resource-id-audit.json',resource_rows)
save('source-audit.json',{'auditedAt':datetime.now(timezone.utc).isoformat(),'sourceFiles':len(rows),'original315PresentUnchanged':sum(x['originalHashMatches'] is True for x in rows),'additionalFiles':[x['path'] for x in rows if not x['inOriginal315']],'differsFromCurrentRoot':[x['path'] for x in rows if not x['matchesCurrentRoot']],'secretPatternFindings':hits,'lockChecks':lock_checks,'missingStaticImports':missing_local,'externalModuleImports':external,'infraResources':len(resource_rows),'allDeclaredIDsMatchHistoricalCollection':all(x['matchesCollectedInventory'] for x in resource_rows),'allDeclaredRegionalARNsSydneyOrGlobal':all(x['regionCheck'] for x in resource_rows),'scope':'Static inspection; no install, build, cloud calls, jobs or tests rerun'})
save('evidence-manifest.json',{'preparedAt':datetime.now(timezone.utc).isoformat(),'files':manifest,'note':'File modification time is provenance, not necessarily observation time; use timestamps inside evidence. Original files unchanged.'})
print(json.dumps({'copies':len(manifest),'sourceFiles':len(rows),'original315Unchanged':sum(x['originalHashMatches'] is True for x in rows),'additional':[x['path'] for x in rows if not x['inOriginal315']],'secretPatternFindings':hits,'missingStaticImports':missing_local,'lockChecks':lock_checks},indent=2))
