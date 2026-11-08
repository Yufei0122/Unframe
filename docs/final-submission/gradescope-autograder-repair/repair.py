"""Repair only submission metadata; preserve all original application source."""
from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import hashlib,json,re,stat,sys,tempfile,zipfile
import yaml

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
BASE=Path(r'D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3')
SUB=BASE/'CAB432-A3-Submission'
MODEL='arn:aws:bedrock:ap-southeast-2::foundation-model/google.gemma-3-12b-it'
sha=lambda b:hashlib.sha256(b).hexdigest()
save=lambda name,obj:(OUT/name).write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
inventory=json.loads((OUT.parent/'complete-source-repackaging/source-inventory.json').read_text())

if '--repair' in sys.argv:
    assert not (OUT/'before.json').exists(),'Preserve original repair receipts'
    archives=[]
    for p in sorted(BASE.glob('*Submission*.zip')):
        with zipfile.ZipFile(p) as z:
            entries=z.infolist(); files=[x for x in entries if not x.is_dir()]
            archives.append({'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'files':len(files),'entries':len(entries),
              'roots':sorted({x.filename.split('/')[0] for x in entries}),'rootAppFiles':sum(x.filename.startswith('app/') for x in files),
              'crcError':z.testzip(),'paths':[x.filename for x in entries],
              'generatedOrNested':[x.filename for x in entries if set(PurePosixPath(x.filename).parts)&{'node_modules','.venv','dist','build','.expo','__pycache__','test-results'} or x.filename.lower().endswith('.zip')],
              'largestFiles':[{'path':x.filename,'bytes':x.file_size} for x in sorted(files,key=lambda x:x.file_size,reverse=True)[:10]]})
    original=(SUB/'submission-a3-infra.yml').read_bytes(); parsed=yaml.safe_load(original)
    assert len(parsed['cloudInfrastructure'])==33
    matches=[x for x in parsed['cloudInfrastructure'] if x['arn']==MODEL]
    assert len(matches)==1
    app={p.relative_to(SUB/'app').as_posix():sha(p.read_bytes()) for p in (SUB/'app').rglob('*') if p.is_file()}
    assert len(app)==336
    for rel,e in inventory['files'].items():
        assert app[rel]==e['sha256']==sha((ROOT/rel).read_bytes()),rel
    save('before.json',{'createdUtc':datetime.now(timezone.utc).isoformat(),'archives':archives,'yamlSha256':sha(original),'appHashes':app,'removedResource':matches[0]})
    (OUT/'submission-before.yml').write_bytes(original)
    text=original.decode('utf-8')
    pattern=r'  - type: "Bedrock foundation model"\n    arn: "'+re.escape(MODEL)+r'"\n    description: "[^\n]+"\n\n'
    new,n=re.subn(pattern,'',text)
    assert n==1
    after=yaml.safe_load(new)
    expected={**parsed,'cloudInfrastructure':[x for x in parsed['cloudInfrastructure'] if x['arn']!=MODEL]}
    assert after==expected
    (SUB/'submission-a3-infra.yml').write_bytes(new.encode())
    p=SUB/'app/README-CAB432-A3.md'
    content=p.read_text(encoding='utf-8')
    old='The restored infrastructure YAML reproduces the previously audited 33 resource declarations exactly.'
    assert content.count(old)==1
    content=content.replace(old,'The infrastructure YAML retains 32 declarations after removing only the AWS-managed Bedrock foundation model ARN, which is not a student-owned/tagged resource. Bedrock application integration is unchanged; no replacement ARN is declared.')
    p.write_text(content,encoding='utf-8')
    risks=json.loads((OUT.parent/'gradescope-repair/resource-audit.json').read_text())
    save('retained-ownership-risks.json',[x for x in risks if x['arn']!=MODEL and x['tagResult']!='PASS_SAVED_TAGS'])
    save('yaml-validation.json',{'status':'PASS','beforeResources':33,'afterResources':32,'removed':matches[0],
      'allOtherDeclarationsAndMetadataUnchanged':True,'planningLambdaDeclared':False,'originalYamlSha256':sha(original),'repairedYamlSha256':sha(new.encode()),'awsModified':False})
    print('Removed exactly the specified model declaration; 32 declarations retained. All 335 original source files unchanged.')

if '--package' in sys.argv:
    check=json.loads((OUT/'source-validation.json').read_text()); assert check['status']=='PASS'
    before=json.loads((OUT/'before.json').read_text())
    for a in before['archives']:assert sha(Path(a['path']).read_bytes())==a['sha256']
    expected={**{'app/'+p:h for p,h in check['appHashes'].items()},'submission-a3-infra.yml':check['yamlSha256']}
    actual={}
    for p in SUB.rglob('*'):
        assert not p.is_symlink()
        if p.is_file():actual[p.relative_to(SUB).as_posix()]=sha(p.read_bytes())
    assert actual==expected
    dest=BASE/'CAB432-A3-Submission-fixed.zip'
    assert not dest.exists(),'Refuse to overwrite an existing ZIP'
    with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.writestr('app/',b'')
        for rel in sorted(expected):z.write(SUB/rel,rel)
    extraction=Path(tempfile.mkdtemp(prefix='extracted-',dir=OUT))
    with zipfile.ZipFile(dest) as z:
        assert z.testzip() is None
        names=z.namelist();assert len(names)==len(set(names))
        assert {n.split('/')[0] for n in names}=={'app','submission-a3-infra.yml'}
        assert sum(n.startswith('app/') and not n.endswith('/') for n in names)==336
        for e in z.infolist():
            n=e.filename
            assert not n.startswith(('/','\\')) and '..' not in PurePosixPath(n).parts and ':' not in n and '\\' not in n
            assert not stat.S_ISLNK(e.external_attr>>16)
            if not e.is_dir():assert sha(z.read(n))==expected[n]
        z.extractall(extraction)
    assert {p.name for p in extraction.iterdir()}=={'app','submission-a3-infra.yml'}
    extracted={p.relative_to(extraction).as_posix():sha(p.read_bytes()) for p in extraction.rglob('*') if p.is_file()}
    assert extracted==expected
    result={'status':'PASS','path':str(dest),'bytes':dest.stat().st_size,'sha256':sha(dest.read_bytes()),'files':len(expected),'appFiles':336,'entries':len(names),
      'roots':['submission-a3-infra.yml','app/'],'crc':'PASS','symlinks':[],'unsafePaths':[],'nestedArchives':[],
      'freshExtractionDirectory':str(extraction),'extractedFiles':len(extracted),'extractedAppNonempty':True,'allExtractedHashesMatch':True,'previousArchivesUnchanged':True}
    save('zip-validation.json',result)
    print(json.dumps(result,indent=2))
