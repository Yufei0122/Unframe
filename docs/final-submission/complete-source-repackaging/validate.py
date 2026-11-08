"""Validate the actual restored copy, preserving original sources/evidence."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,os,re,subprocess
OUT=Path(__file__).resolve().parent
inventory=json.loads((OUT/'source-inventory.json').read_text())
ROOT=Path(inventory['sourceRoot']); DEST=Path(inventory['destination']); APP=DEST/'app'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
protected=inventory['protectedOriginalHashes']
changed=[rel for rel,h in protected.items() if not (ROOT/rel).is_file() or sha(ROOT/rel)!=h]
assert not changed,changed
for rel,entry in inventory['files'].items():
    assert sha(ROOT/rel)==entry['sha256'], 'Original source changed: '+rel
    assert sha(APP/rel)==entry['sha256'], 'Copy differs: '+rel
assert sha(DEST/'submission-a3-infra.yml')==inventory['infrastructureSha256']
assert sha(APP/'README-CAB432-A3.md')==sha(OUT/'README-CAB432-A3.md')
expected=set(inventory['files'])|{'README-CAB432-A3.md'}
skip={'node_modules','.expo','dist','test-results','__pycache__','.pytest_cache','coverage'}
actual={}
for directory,dirs,files in os.walk(APP):
    dirs[:]=[d for d in dirs if d not in skip]
    for name in files:
        p=Path(directory)/name; assert not p.is_symlink()
        actual[p.relative_to(APP).as_posix()]=sha(p)
assert set(actual)==expected, {'missing':list(expected-set(actual)),'extra':list(set(actual)-expected)}
missing=[];syntax=[];syntax_count=0; graph={};secret_findings=[]
secret=re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|X-Amz-Signature=[a-f0-9]{64}|(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*[\"\x27]?[A-Za-z0-9/+]{30,}|[\"\x27](?:readToken|readTokenHash|tokenHash)[\"\x27]\s*:\s*[\"\x27][A-Za-z0-9_+/=-]{32,}')
for rel in sorted(expected):
    p=APP/rel
    if p.suffix.lower() in {'.js','.mjs','.ts','.tsx','.json','.md','.yml','.yaml','.ps1','.py','.txt','.example'}:
        text=p.read_text(encoding='utf-8-sig')
        if secret.search(text):secret_findings.append(rel)
        if p.suffix in {'.js','.mjs','.ts','.tsx'} and not p.name.endswith('.d.ts'):
            edges=[]
            for spec in set(re.findall(r'(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)[\"\x27](\.[^\"\x27]+)[\"\x27]',text)):
                base=p.parent/spec
                candidates=[base]+[Path(str(base)+e) for e in ['.js','.mjs','.ts','.tsx','.json','.d.ts']]+[base/('index'+e) for e in ['.js','.ts','.tsx']]
                resolved=next((c for c in candidates if c.is_file()),None)
                edges.append({'specifier':spec,'resolved':resolved.resolve().relative_to(APP).as_posix() if resolved else None})
                if not resolved:missing.append([rel,spec])
            graph[rel]=edges
        if p.suffix in {'.js','.mjs'}:
            syntax_count+=1
            r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
            if r.returncode:syntax.append(rel)
assert not missing,missing
assert not syntax,syntax
assert not secret_findings,secret_findings
locks=[]; script_missing=[]
for prefix in ['','mobile/']:
    pkg=json.loads((APP/prefix/'package.json').read_text())
    lock=json.loads((APP/prefix/'package-lock.json').read_text())
    for key in ['dependencies','devDependencies']: assert pkg.get(key,{})==lock['packages'][''].get(key,{})
    for name,command in pkg['scripts'].items():
        for spec in re.findall(r'\b(?:node|tsx)\s+((?:scripts|server|worker)/[\w./-]+\.(?:js|mjs|ts))',command):
            if not (APP/prefix/spec).is_file():script_missing.append([prefix+name,spec])
    locks.append({'path':prefix+'package-lock.json','matchesOriginal':True,'matchesManifest':True})
assert not script_missing,script_missing
target=json.loads((APP/'deployment/ecs/scalable-target.json').read_text())
assert (target['MinCapacity'],target['MaxCapacity'])==(1,3)
for name in ['autoscaling.json','backlog-target-tracking.json']:
    p=json.loads((APP/'deployment/ecs'/name).read_text())
    assert [p[k] for k in ['TargetValue','ScaleOutCooldown','ScaleInCooldown','DisableScaleIn']]==[3,30,120,False]
task=json.loads((APP/'deployment/ecs/worker-task-definition.example.json').read_text())
assert (task['cpu'],task['memory'])==('512','2048')
assert task['runtimePlatform']=={'cpuArchitecture':'X86_64','operatingSystemFamily':'LINUX'}
required=['mobile/src/screens/AIPlanner.tsx','mobile/src/screens/AIItinerary.tsx','mobile/src/planningStream.ts','server/ai/routes.js','server/ai/chat.js','server/ai/graph.js','server/cloud/planning.js','tests/aws-planning.test.js','tests/planning-runtime.test.js','mobile/e2e/planning.spec.js']
assert all(p in actual for p in required)
receipt={'status':'PASS_LOCAL_SOURCE','checkedUtc':datetime.now(timezone.utc).isoformat(),'originalSourceFiles':len(inventory['files']),'submissionAppFiles':len(actual),'packagingOnlyAdded':['README-CAB432-A3.md'],'originalSourceModified':[],
 'protectedOriginalEvidenceAndSourceFiles':len(protected),'protectedOriginalChanged':changed,'allCopiedSourceHashesMatch':True,'yamlHashPreserved':True,
 'syntaxFilesChecked':syntax_count,'syntaxErrors':syntax,'unresolvedRelativeImports':missing,'missingNpmScriptEntrypoints':script_missing,'secretPatternFindings':secret_findings,'locks':locks,
 'planningSourcePresent':required,'scaling':{'min':1,'max':3,'target':3,'outSeconds':30,'inSeconds':120,'liveVerified':False},'appHashes':actual}
(OUT/'validation.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
(OUT/'dependency-graph.json').write_text(json.dumps(graph,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['appHashes','planningSourcePresent']},indent=2))
