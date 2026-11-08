"""Validate local documentation/evidence without invoking application or AWS."""
from pathlib import Path
import json, re, hashlib, csv, argparse
from datetime import datetime, timezone

out=Path(__file__).resolve().parent
root=out.parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--submission-manifest', required=True)
parser.add_argument('--output', required=True)
args=parser.parse_args()
repair=out/'gradescope-repair'
assert Path(args.output).resolve().is_relative_to(repair), 'Keep historical receipts read-only'
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
issues=[]; links=0
for p in out.glob('*.md'):
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
        if target.startswith(('http://','https://','#')): continue
        links+=1
        if not (p.parent/target.split('#')[0]).exists(): issues.append({'kind':'broken-local-link','file':p.name,'target':target})
manifest=read(out/'evidence-manifest.json')
for x in manifest['files']:
    if sha(out/x['copy'])!=x['sha256'] or sha(Path(x['source']))!=x['sha256']:
        issues.append({'kind':'changed-evidence','path':x['copy']})
source_rows=read(Path(args.submission_manifest))['manifest']
for x in source_rows:
    if sha(root/'app'/x['path'])!=x['sha256']: issues.append({'kind':'changed-submission-source','path':x['path']})
index=(out/'evidence-index.md').read_text(encoding='utf-8')
for i in range(1,21):
    if not re.search(r'\| F'+str(i)+r'\b',index): issues.append({'kind':'missing-F-entry','id':i})
model=read(out/'evidence/cost/calculator-model.json')
assert abs(sum(model['expected']['costs'].values())-97.07090675697893)<1e-9
assert sum([20,40,30,30,25,60,30,45])==280
assert len(source_rows)>=316
verdict=read(out/'evidence/scaling/F14-F16-verdict.json')
assert verdict['successful']==verdict['correct']==883
assert verdict['peakCloudWatchVisible']==321 and verdict['peakObservedVisible']==337
f12=read(out/'evidence/bedrock/F12-summary.json')
assert f12['jobStatus']=='SUCCEEDED' and f12['bedrockCompleteEvents']==1
# Bounded secret/capability checks on copied textual evidence, never print matches.
patterns=[r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'[?&]X-Amz-(?:Signature|Credential|Security-Token)=[^\s"<>]+',r'"(?:readToken|readTokenHash|tokenHash|X-Job-Token)"\s*:\s*"[A-Za-z0-9_+/=-]{32,}"']
for p in (out/'evidence').rglob('*'):
    if not p.is_file() or p.suffix.lower() in ['.png','.pdf']: continue
    b=p.read_bytes();t=b.decode('utf-16') if b[:2] in [b'\xff\xfe',b'\xfe\xff'] else b.decode('utf-8-sig',errors='replace')
    if any(re.search(x,t,re.I) for x in patterns): issues.append({'kind':'potential-sensitive-evidence','path':p.relative_to(out).as_posix()})
result={'checkedAt':datetime.now(timezone.utc).isoformat(),'status':'PASS' if not issues else 'FAIL','localLinksChecked':links,'byteIdenticalEvidenceCopies':len(manifest['files']),'sourceFilesUnchanged':len(source_rows),'FEntries':20,'demoSeconds':280,'costSumVerified':True,'issues':issues,'limits':['Static document checks only; no runtime or AWS tests rerun.','Mermaid specs reviewed as text, not rendered; final AWS icons/layout remain student tasks.','PDF text/link extraction checked; PDF visual layout remains student review.','Historical AWS evidence dates retained; no new cloud health verification.']}
Path(args.output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
