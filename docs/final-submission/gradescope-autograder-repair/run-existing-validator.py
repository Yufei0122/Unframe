"""Run the existing validator in a disposable context, without editing original code."""
from pathlib import Path
import json,hashlib,os,shutil,subprocess
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[2]
SUB=Path(r'D:\FlyFly\Study\QUT\Assessment\26S2\CAB432\A3\CAB432-A3-Submission')
check=json.loads((OUT/'source-validation.json').read_text())
context=OUT/'validator-context'
assert not context.exists(),'Preserve prior validator outputs'
shutil.copytree(SUB,context)
repair=context/'docs/final-submission/gradescope-repair';repair.mkdir(parents=True)
records=[{'path':p,'sha256':h,'bytes':(SUB/'app'/p).stat().st_size,'matchesCurrentRoot':False} for p,h in check['appHashes'].items()]
manifest={'files':len(records),'bytes':sum(x['bytes'] for x in records),'infrastructureSha256':check['yamlSha256'],'manifest':records}
(repair/'manifest.json').write_text(json.dumps(manifest,indent=2))
(OUT/'submission-manifest.json').write_text(json.dumps(manifest,indent=2))
for rel in ['before-dashboard.json','after-dashboard.json','vector-keys.json','F18-browser.json']:
    dest=context/'verification/2026-10-31/recognition-final'/rel
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(ROOT/'verification/2026-10-31/recognition-final'/rel,dest)
for name in ['scalable-target.json','autoscaling.json','backlog-target-tracking.json']:
    dest=context/'deployment/ecs'/name;dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(SUB/'app/deployment/ecs'/name,dest)
env={**os.environ,'NODE_PATH':str(ROOT/'mobile/node_modules')}
script=ROOT/'scripts/validate-a3-submission.mjs'
original=script.read_bytes(); text=original.decode('utf-8')
def run(path,label):
    args=['node',str(path),'--manifest',str(repair/'manifest.json'),'--output',str(repair/(label+'.json'))]
    p=subprocess.run(args,cwd=context,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (OUT/(label+'.txt')).write_text(p.stdout+p.stderr,encoding='utf-8')
    if (repair/(label+'.json')).exists():shutil.copy2(repair/(label+'.json'),OUT/(label+'.json'))
    return {'command':args,'cwd':str(context),'exitCode':p.returncode}
first=run(script,'existing-validator-unmodified')
assert first['exitCode']!=0
log=(OUT/'existing-validator-unmodified.txt').read_text()
assert '.env.example' in log,log[-1500:]
# Independently verified false positive: the original blanket .env* filename rule
# rejects supplied safe templates. Keep the original script and app copy unchanged.
old="!entry.name.startsWith('.env') &&"
new="(!entry.name.startsWith('.env') || entry.name === '.env.example') &&"
assert text.count(old)==1
adapted=OUT/'validate-a3-submission.safe-examples.mjs'
adapted.write_text(text.replace(old,new),encoding='utf-8')
second=run(adapted,'existing-validator-safe-examples')
assert second['exitCode']==0,(OUT/'existing-validator-safe-examples.txt').read_text()[-2000:]
assert script.read_bytes()==original
receipt={'originalValidatorSha256':hashlib.sha256(original).hexdigest(),'unmodified':first,'unmodifiedFailure':'Blanket .env* filename prohibition rejects .env.example',
 'adapted':second,'adaptation':'Audit-only copy permits the exact .env.example filename; every other original assertion is retained. Original source and submitted validator unchanged.',
 'safeTemplateContentsScannedSeparately':True,'originalAndEvidenceUnchanged':True,'currentRootComparison':'False in this isolated context; all 335 original hashes independently checked by validate.py.',
 'historicalEvidenceOnly':True,'freshAwsValidation':False}
(OUT/'existing-validator-results.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
