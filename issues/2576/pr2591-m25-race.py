# Two worker processes, same comment version, released by one wall-clock barrier, racing the INSERT ... ON CONFLICT claim on real Postgres.
import subprocess, os, time, json, datetime
WT=os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2576/wt'); OUT=os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2576/evidence/m25-race'); os.makedirs(OUT, exist_ok=True)
SPEC='libs/platform/application/use-cases/codeManagement/qa2576-worker.spec.ts'
def psql(q): return subprocess.run(['/opt/homebrew/opt/libpq/bin/psql','-h','localhost','-p',os.environ['QA_PG_PORT'],'-U','postgres','-d','qa','-At','-c',q], env={**os.environ,'PGPASSWORD':os.environ['QA_PG_PASSWORD']}, capture_output=True, text=True).stdout.strip()
res=[]
for rnd in range(1, 4):
    psql('delete from kodus_workflow.inbox_messages')
    start_at=str(int(time.time()*1000)+9000)
    ps=[subprocess.Popen(['node','node_modules/.bin/jest','--runInBand',SPEC], cwd=WT, env={**os.environ,'ROLE':f'race{rnd}{c}','START_AT':start_at}, stdout=open(f'{OUT}/r{rnd}-{c}.out','w'), stderr=subprocess.STDOUT) for c in 'ab']
    for p in ps: p.wait(timeout=300)
    ev={c:[json.loads(l.split('QAEVT ',1)[1]) for l in open(f'{OUT}/r{rnd}-{c}.out') if 'QAEVT ' in l] for c in 'ab'}
    row=psql('select status,attempts,"createdAt","processedAt" from kodus_workflow.inbox_messages')
    summ={c:{'execute_start':next((e['t'] for e in ev[c] if e['event']=='execute-start'),None),'execute_end':next((e['t'] for e in ev[c] if e['event']=='execute-end'),None),'outcome':[e.get('message') for e in ev[c] if e['event']=='log' and ('claimed' in (e.get('message') or '') or 'unanswered' in (e.get('message') or ''))],'classifier':sum(1 for e in ev[c] if e['event']=='classifier-called')} for c in 'ab'}
    res.append({'round':rnd,'row':row,'workers':summ})
json.dump(res, open(f'{OUT}/summary.json','w'), indent=1); print(json.dumps(res, indent=1))
