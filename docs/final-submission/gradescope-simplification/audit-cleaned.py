"""Read-only source audit; writes receipts beside this script, never cloud resources."""
import hashlib, json, os, re, subprocess
from pathlib import Path

out = Path(__file__).resolve().parent
workspace = out.parents[2]
before = json.loads((out / 'before.json').read_text())
root = Path(before['submission'])
app = root / 'app'
skip = {'node_modules', '.expo', 'dist', 'test-results', '__pycache__', '.venv', '.git'}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
files = {}
for directory, dirs, names in os.walk(root):
    dirs[:] = [d for d in dirs if d not in skip]
    for name in names:
        p = Path(directory) / name
        assert not p.is_symlink(), str(p)
        files[p.relative_to(root).as_posix()] = sha(p)
removed = sorted(set(before['files']) - set(files))
added = sorted(set(files) - set(before['files']))
modified = sorted(p for p in files if p in before['files'] and files[p] != before['files'][p])
retained = sorted(set(files) & set(before['files']))
original_changes = [p for p,h in before['originalSourceAndEvidence'].items() if not (workspace/p).is_file() or sha(workspace/p) != h]
assert not original_changes, original_changes
assert len(removed) == 25
assert added == ['app/mobile/e2e/submission-scope.spec.js', 'app/mobile/tests/submissionScope.test.ts'], added
assert files['submission-a3-infra.yml'] == before['files']['submission-a3-infra.yml']
assert sha(Path(before['archive']['path'])) == before['archive']['sha256']
secrets = re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|X-Amz-Signature=[a-f0-9]{64}|(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*[\"\x27]?[A-Za-z0-9/+]{30,}|[\"\x27](?:readToken|readTokenHash|tokenHash)[\"\x27]\s*:\s*[\"\x27][A-Za-z0-9_+/=-]{32,}')
suspects=[]
graph={}
missing=[]
syntax=[]
syntax_count=0
for rel in files:
    p=root/rel
    if p.suffix.lower() in {'.js','.mjs','.ts','.tsx','.json','.md','.yml','.yaml','.ps1','.py','.txt'}:
        text=p.read_text(encoding='utf-8-sig')
        if secrets.search(text): suspects.append(rel)
        if p.suffix in {'.js','.mjs','.ts','.tsx'} and not p.name.endswith('.d.ts'):
            edges=[]
            for spec in set(re.findall(r'(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)[\"\x27](\.[^\"\x27]+)[\"\x27]',text)):
                base=p.parent/spec
                candidates=[base]+[Path(str(base)+e) for e in ['.js','.mjs','.ts','.tsx','.json','.d.ts']]+[base/('index'+e) for e in ['.js','.ts','.tsx']]
                resolved=next((c for c in candidates if c.is_file()),None)
                edges.append({'specifier':spec,'resolved':resolved.resolve().relative_to(app).as_posix() if resolved else None})
                if not resolved: missing.append([rel,spec])
            graph[p.relative_to(app).as_posix()]=edges
        if p.suffix in {'.js','.mjs'}:
            r=subprocess.run(['node','--check',str(p)],capture_output=True,text=True)
            syntax_count+=1
            if r.returncode: syntax.append(rel)
assert not suspects, suspects
assert not missing, missing
assert not syntax, syntax
locks=[]
for prefix in ['', 'mobile/']:
    package=json.loads((app/prefix/'package.json').read_text())
    lock=json.loads((app/prefix/'package-lock.json').read_text())
    for key in ['dependencies','devDependencies']:
        assert package.get(key,{}) == lock['packages'][''].get(key,{})
    rel='app/'+prefix+'package-lock.json'
    assert files[rel] == before['files'][rel]
    locks.append({'path':rel,'unchanged':True,'dependenciesMatch':True})
target=json.loads((app/'deployment/ecs/scalable-target.json').read_text())
assert (target['MinCapacity'],target['MaxCapacity']) == (1,3)
for name in ['autoscaling.json','backlog-target-tracking.json']:
    policy=json.loads((app/'deployment/ecs'/name).read_text())
    assert [policy[k] for k in ['TargetValue','ScaleOutCooldown','ScaleInCooldown','DisableScaleIn']] == [3,30,120,False]
protected = [p for p in retained if (p.startswith(('app/worker/','app/local-ai/','app/server/cloud/')) or p in [
    'app/server/ai/recognition.js','app/server/ai/artwork-analysis.js','app/server/ai/bedrock.js','app/server/ai/s3-vectors.js',
    'app/server/ai/embeddings.js','app/mobile/src/screens/Lookup.tsx','app/mobile/src/screens/Lookup.web.tsx',
    'app/mobile/src/components/CameraCapture.web.tsx','app/mobile/src/webScanTransport.ts','app/mobile/src/recognitionJobs.ts']) and p not in modified]
receipt={'status':'PASS','beforeAppFiles':319,'afterAppFiles':len(files)-1,'removed':removed,'added':added,'modified':modified,'retained':retained,
 'originalFilesChecked':len(before['originalSourceAndEvidence']),'originalFilesChanged':original_changes,'originalZipUnchanged':True,'yamlUnchanged':True,
 'secretPatternFindings':suspects,'missingImports':missing,'syntaxErrors':syntax,'syntaxFilesChecked':syntax_count,'locks':locks,'protectedUnchangedFiles':protected,
 'scaling':{'minimum':1,'maximum':3,'target':3,'cooldowns':[30,120]},'sha256':files}
(out/'final-source-validation.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
(out/'dependency-graph-after.json').write_text(json.dumps(graph,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['sha256','retained','modified','removed','added','protectedUnchangedFiles']}))
print(json.dumps({'removed':len(removed),'modified':len(modified),'added':len(added),'retained':len(retained),'protectedUnchanged':len(protected)}))
