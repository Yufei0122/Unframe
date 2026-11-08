"""Inventory/copy complete original source; never edits original application files."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, os, re, shutil, sys

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
DEST=Path(r'D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\CAB432-A3-Submission')
SKIP={'node_modules','.venv','__pycache__','.pytest_cache','.expo','.git','.aws','.credentials','dist','build','artifacts','test-results','playwright-report','coverage','.cache'}
DIRS=['server','worker','shared','mobile','local-ai','scripts','tests','deployment','docs']
ROOT_FILES=['package.json','package-lock.json','.gitignore','.env.example','README.md','AI-INTEGRATION.md','TRAINING.md','GOMA-DEMO.md','QUT-DEMO.md','MUSEUM-DISCOVERY.md','playwright.config.js','playwright.mobile.config.js','playwright.mobile-dev.config.js']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
secret=re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|X-Amz-Signature=[a-f0-9]{64}|(?:AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*[=:]\s*[\"\x27]?[A-Za-z0-9/+]{30,}|[\"\x27](?:readToken|readTokenHash|tokenHash)[\"\x27]\s*:\s*[\"\x27][A-Za-z0-9_+/=-]{32,}')
files=[]
excluded=[]
for directory in DIRS:
    for parent,dirs,names in os.walk(ROOT/directory):
        parent=Path(parent)
        for name in dirs[:]:
            p=parent/name
            rel=p.relative_to(ROOT).as_posix()
            if name in SKIP or rel=='docs/final-submission':
                dirs.remove(name);excluded.append({'path':rel+'/','reason':'generated dependencies/cache/output or redundant submission/evidence pack'})
            else: assert not p.is_symlink(), rel
        for name in names:
            p=parent/name;rel=p.relative_to(ROOT).as_posix()
            assert not p.is_symlink(),rel
            if (name.startswith('.env') and name!='.env.example') or re.search(r'credentials|service-account|\.(pem|key|pt|pth|safetensors|log|pyc|zip)$',name,re.I):
                excluded.append({'path':rel,'reason':'local environment, sensitive filename or generated output/model weights'});continue
            files.append(rel)
files+=ROOT_FILES
files += [p.relative_to(ROOT).as_posix() for p in (ROOT/'models').glob('*LICENSE.txt')]
assert len(files)==len(set(files))
files.sort()
findings=[]
for rel in files:
    p=ROOT/rel
    if p.suffix.lower() in {'.js','.mjs','.ts','.tsx','.py','.json','.yml','.yaml','.md','.txt','.ps1','.example'}:
        if secret.search(p.read_text(encoding='utf-8-sig')): findings.append(rel)
assert not findings, 'Potential sensitive data: '+repr(findings)
baseline={rel:{'sha256':sha(ROOT/rel),'bytes':(ROOT/rel).stat().st_size} for rel in files}
old=json.loads((OUT.parent/'gradescope-simplification/final-source-validation.json').read_text())
previous=json.loads((OUT.parent/'gradescope-simplification/before.json').read_text())
restored=[p for p in old['removed'] if p.removeprefix('app/') in baseline]
compared=[{'path':p,'matchesOriginal':old['sha256'][p]==baseline[p.removeprefix('app/')]['sha256']} for p in old['modified'] if p.removeprefix('app/') in baseline]
protected={p:sha(ROOT/p) for p in previous['originalSourceAndEvidence'] if (ROOT/p).is_file()}
receipt={'createdUtc':datetime.now(timezone.utc).isoformat(),'sourceRoot':str(ROOT),'destination':str(DEST),'originalRelevantSourceFiles':len(files),
 'sourceBytes':sum(x['bytes'] for x in baseline.values()),'files':baseline,'excluded':excluded,
 'excludedTopLevel':['.git/','.local-ai/','.test-data/','.venv/','.vscode/','node_modules/','artifacts/','build/','data/artwork-embeddings.json (generated local vector cache)','models/*/ (generated training runs/checkpoints; source is in local-ai/)','test-results/','verification/ (original evidence remains external)','.env'],
 'restoredPreviouslyDeleted':restored,'previousModifiedCompared':compared,'protectedOriginalHashes':protected,'secretPatternFindings':findings,
 'infrastructureSha256':sha(OUT/'submission-a3-infra.yml'),'previousSubmissionPresent':DEST.exists()}
if '--copy' in sys.argv:
    assert not DEST.exists(), 'Refuse to replace an existing submission directory'
    assert receipt['infrastructureSha256']==previous['files']['submission-a3-infra.yml']
    for rel in files:
        target=DEST/'app'/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/rel,target)
        assert sha(target)==baseline[rel]['sha256']
    shutil.copy2(OUT/'submission-a3-infra.yml',DEST/'submission-a3-infra.yml')
    receipt['copied']=True
(OUT/'source-inventory.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sourceFiles':len(files),'sourceBytes':receipt['sourceBytes'],'previouslyDeletedRestored':len(restored),'excludedPaths':len(excluded),'sensitiveFindings':findings,'copied':receipt.get('copied',False),'destinationAlreadyExisted':receipt['previousSubmissionPresent']}))
