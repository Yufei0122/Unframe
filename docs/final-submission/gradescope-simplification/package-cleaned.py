"""Package an already-validated submission, without replacing the old ZIP."""
import hashlib, json, stat, zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

out=Path(__file__).resolve().parent
before=json.loads((out/'before.json').read_text())
audit=json.loads((out/'final-source-validation.json').read_text())
assert audit['status']=='PASS'
root=Path(before['submission']).resolve()
destination=root.parent/'CAB432-A3-Submission-recognition-only.zip'
assert not destination.exists(), 'Refuse to replace any existing archive'
sha=lambda b:hashlib.sha256(b).hexdigest()
paths=[]
for p in root.rglob('*'):
    assert not p.is_symlink(), str(p)
    if p.is_file():
        rel=p.relative_to(root).as_posix()
        assert not set(p.relative_to(root).parts)&{'node_modules','.venv','.git','.aws','.expo','dist','build','test-results','__pycache__'}
        assert p.suffix.lower() not in {'.zip','.pyc','.pem','.key'}
        assert not p.name.startswith('.env')
        assert audit['sha256'].get(rel)==sha(p.read_bytes()), rel
        paths.append(rel)
assert sorted(paths)==sorted(audit['sha256'])
assert sha(Path(before['archive']['path']).read_bytes())==before['archive']['sha256']
with zipfile.ZipFile(destination,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.writestr('app/',b'')
    for rel in sorted(paths): z.write(root/rel,rel)
with zipfile.ZipFile(destination) as z:
    assert z.testzip() is None
    names=z.namelist()
    assert len(set(names))==len(names)
    assert {n.split('/')[0] for n in names}=={'app','submission-a3-infra.yml'}
    for i in z.infolist():
        n=i.filename
        assert not n.startswith(('/','\\')) and '..' not in PurePosixPath(n).parts and ':' not in n and '\\' not in n
        assert not stat.S_ISLNK(i.external_attr>>16)
        if not i.is_dir(): assert sha(z.read(n))==audit['sha256'][n]
    receipt={'status':'PASS','createdUtc':datetime.now(timezone.utc).isoformat(),'path':str(destination),'bytes':destination.stat().st_size,
      'sha256':sha(destination.read_bytes()),'entries':len(names),'files':len(paths),'appFiles':audit['afterAppFiles'],
      'roots':['app/','submission-a3-infra.yml'],'crc':'PASS','entryHashesMatchSource':True,'unsafePaths':[],
      'symlinks':[],'excludedBuildArtifacts':True,'originalZipUnchanged':True,
      'largestFiles':sorted([{'path':i.filename,'bytes':i.file_size} for i in z.infolist() if not i.is_dir()],key=lambda i:i['bytes'],reverse=True)[:10]}
(out/'zip-validation.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(json.dumps(receipt,indent=2))
