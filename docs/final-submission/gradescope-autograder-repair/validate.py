"""Validate 32-resource submission and original-source equivalence, read-only."""
from pathlib import Path
import hashlib,json,re,subprocess
import yaml
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
SUB=Path(r'D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\CAB432-A3-Submission');APP=SUB/'app'
inventory=json.loads((OUT.parent/'complete-source-repackaging/source-inventory.json').read_text())
prior=json.loads((OUT/'before.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p,h in inventory['protectedOriginalHashes'].items():assert sha(ROOT/p)==h,p
for p,e in inventory['files'].items():assert sha(ROOT/p)==sha(APP/p)==e['sha256'],p
files={}
for p in APP.rglob('*'):
    assert not p.is_symlink()
    rel=p.relative_to(APP)
    assert not set(rel.parts)&{'node_modules','.venv','.aws','.git','.expo','dist','build','__pycache__','.pytest_cache','test-results','coverage'}
    if p.is_file():
        assert p.suffix.lower() not in {'.zip','.pyc','.pem','.key','.pt','.pth','.safetensors','.log'}
        assert not p.name.startswith('.env') or p.name=='.env.example'
        files[rel.as_posix()]=sha(p)
assert set(files)==set(prior['appHashes']) and len(files)==336
changed=[p for p,h in files.items() if h!=prior['appHashes'][p]]
assert changed==['README-CAB432-A3.md'],changed
old=yaml.safe_load((OUT/'submission-before.yml').read_text())
new=yaml.safe_load((SUB/'submission-a3-infra.yml').read_text())
model='arn:aws:bedrock:ap-southeast-2::foundation-model/google.gemma-3-12b-it'
assert new=={**old,'cloudInfrastructure':[x for x in old['cloudInfrastructure'] if x['arn']!=model]}
assert len(new['cloudInfrastructure'])==len({x['arn'] for x in new['cloudInfrastructure']})==32
for r in new['cloudInfrastructure']:
    assert r['type'] and r['description'] and r['arn'].startswith('arn:aws:')
    parts=r['arn'].split(':');assert parts[3] in {'','ap-southeast-2'};assert parts[4] in {'','901444280953'}
    assert 'function:a3-n12281212-unframe-planning' not in r['arn']
secret=re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|X-Amz-Signature=[a-f0-9]{64}|(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*[\"\x27]?[A-Za-z0-9/+]{30,}|[\"\x27](?:readToken|readTokenHash|tokenHash)[\"\x27]\s*:\s*[\"\x27][A-Za-z0-9_+/=-]{32,}')
missing=[];syntax=[];count=0;graph={};suspects=[]
for rel in files:
    p=APP/rel
    if p.suffix.lower() in {'.js','.mjs','.ts','.tsx','.json','.md','.yml','.yaml','.ps1','.py','.txt','.example'}:
        text=p.read_text(encoding='utf-8-sig')
        if secret.search(text):suspects.append(rel)
        if p.suffix in {'.js','.mjs','.ts','.tsx'} and not p.name.endswith('.d.ts'):
            edges=[]
            for spec in set(re.findall(r'(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)[\"\x27](\.[^\"\x27]+)[\"\x27]',text)):
                base=p.parent/spec;candidates=[base]+[Path(str(base)+e) for e in ['.js','.mjs','.ts','.tsx','.json','.d.ts']]+[base/('index'+e) for e in ['.js','.ts','.tsx']]
                resolved=next((c for c in candidates if c.is_file()),None)
                edges.append({'specifier':spec,'resolved':resolved.resolve().relative_to(APP).as_posix() if resolved else None})
                if not resolved:missing.append([rel,spec])
            graph[rel]=edges
        if p.suffix in {'.js','.mjs'}:
            count+=1
            if subprocess.run(['node','--check',str(p)],capture_output=True).returncode:syntax.append(rel)
assert not missing and not syntax and not suspects,(missing,syntax,suspects)
for prefix in ['', 'mobile/']:
    p=json.loads((APP/prefix/'package.json').read_text()); lock=json.loads((APP/prefix/'package-lock.json').read_text())
    for key in ['dependencies','devDependencies']:assert p.get(key,{})==lock['packages'][''].get(key,{})
target=json.loads((APP/'deployment/ecs/scalable-target.json').read_text());assert (target['MinCapacity'],target['MaxCapacity'])==(1,3)
for name in ['autoscaling.json','backlog-target-tracking.json']:
    p=json.loads((APP/'deployment/ecs'/name).read_text());assert [p[x] for x in ['TargetValue','ScaleOutCooldown','ScaleInCooldown','DisableScaleIn']]==[3,30,120,False]
receipt={'status':'PASS','resources':32,'originalSourceFilesUnchanged':335,'protectedOriginalFilesUnchanged':len(inventory['protectedOriginalHashes']),'appFiles':len(files),
 'submissionAppModified':changed,'missingRelativeImports':missing,'syntaxErrors':syntax,'syntaxFilesChecked':count,'sensitivePatternFindings':suspects,
 'safeEnvironmentExamples':['.env.example','mobile/.env.example'],'lockfilesMatchManifests':True,'yamlSha256':sha(SUB/'submission-a3-infra.yml'),'appHashes':files}
(OUT/'source-validation.json').write_text(json.dumps(receipt,indent=2)+'\n')
(OUT/'dependency-graph.json').write_text(json.dumps(graph,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='appHashes'},indent=2))
