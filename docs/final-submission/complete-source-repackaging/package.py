"""Create the requested ZIP exclusively after source validation; no overwrites."""
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import hashlib,json,stat,zipfile
OUT=Path(__file__).resolve().parent
inventory=json.loads((OUT/'source-inventory.json').read_text())
audit=json.loads((OUT/'validation.json').read_text())
assert audit['status']=='PASS_LOCAL_SOURCE'
root=Path(inventory['destination']).resolve()
dest=root.parent/'CAB432-A3-Submission.zip'
assert not dest.exists(), 'Refuse to overwrite any existing ZIP'
sha=lambda b:hashlib.sha256(b).hexdigest()
expected={'app/'+p:h for p,h in audit['appHashes'].items()}
expected['submission-a3-infra.yml']=inventory['infrastructureSha256']
actual={}
for p in root.rglob('*'):
    assert not p.is_symlink(),str(p)
    if p.is_file():
        rel=p.relative_to(root).as_posix()
        assert not set(PurePosixPath(rel).parts)&{'node_modules','.venv','.git','.aws','.expo','dist','build','test-results','__pycache__','.pytest_cache','coverage'}
        assert not p.name.startswith('.env') or p.name=='.env.example'
        assert p.suffix.lower() not in {'.zip','.pyc','.pem','.key','.pt','.pth','.safetensors'}
        actual[rel]=sha(p.read_bytes())
assert actual==expected, 'Unexpected/missing/changed source before packaging'
with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.writestr('app/',b'')
    for rel in sorted(expected):z.write(root/rel,rel)
with zipfile.ZipFile(dest) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert len(set(names))==len(names)
    assert {n.split('/')[0] for n in names}=={'app','submission-a3-infra.yml'}
    for i in z.infolist():
        n=i.filename
        assert not n.startswith(('/','\\')) and '..' not in PurePosixPath(n).parts and ':' not in n and '\\' not in n
        assert not stat.S_ISLNK(i.external_attr>>16)
        if not i.is_dir():assert sha(z.read(n))==expected[n]
    result={'status':'PASS','createdUtc':datetime.now(timezone.utc).isoformat(),'path':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),
     'roots':['submission-a3-infra.yml','app/'],'entries':len(names),'files':len(expected),'appFiles':len(audit['appHashes']),
     'crc':'PASS','allEntryHashesMatchSource':True,'unsafePaths':[],'symlinks':[],'duplicatePaths':[],'extraWrapper':False,
     'largestFiles':sorted([{'path':i.filename,'bytes':i.file_size} for i in z.infolist() if not i.is_dir()],key=lambda i:i['bytes'],reverse=True)[:10]}
(OUT/'zip-validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
