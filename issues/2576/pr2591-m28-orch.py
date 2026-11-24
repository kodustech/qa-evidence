import subprocess, os, time, json, signal, datetime, sys
WT=os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2576/wt'); OUT=os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2576/evidence/m28')
os.makedirs(OUT, exist_ok=True)
SPEC='libs/platform/application/use-cases/codeManagement/qa2576-worker.spec.ts'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
log=open(f'{OUT}/orchestrator.log','w')
def note(m): log.write(f'{now()} {m}\n'); log.flush()
def start(role):
    f=open(f'{OUT}/{role}.out','w')
    p=subprocess.Popen(['node','node_modules/.bin/jest','--runInBand',SPEC], cwd=WT, env={**os.environ,'ROLE':role}, stdout=f, stderr=subprocess.STDOUT)
    note(f'start {role} pid={p.pid}'); return p
def events(role):
    try: return [json.loads(l.split('QAEVT ',1)[1]) for l in open(f'{OUT}/{role}.out') if 'QAEVT ' in l]
    except FileNotFoundError: return []
def wait_for(role, ev, timeout=120):
    t0=time.time()
    while time.time()-t0<timeout:
        if any(e['event']==ev for e in events(role)): return True
        time.sleep(0.2)
    return False
def psql(q):
    return subprocess.run(['/opt/homebrew/opt/libpq/bin/psql','-h','localhost','-p','55476','-U','postgres','-d','qa','-At','-c',q], env={**os.environ,'PGPASSWORD':'qa2576'}, capture_output=True, text=True).stdout.strip()
psql('delete from kodus_workflow.inbox_messages')
v=start('victim'); assert wait_for('victim','file-read-start'), 'victim never reached file read'
note('victim in file read; row=' + psql('select status,"lockedBy","lockedAt",attempts from kodus_workflow.inbox_messages'))
c=start('concurrent'); c.wait(timeout=300); note('concurrent exited rc=%s' % c.returncode)
note('victim alive=%s; SIGKILL' % (v.poll() is None)); os.kill(v.pid, signal.SIGKILL); v.wait(); note('victim killed rc=%s' % v.returncode)
note('row after kill=' + psql('select status,"lockedBy","lockedAt",attempts,"processedAt" from kodus_workflow.inbox_messages'))
e=start('early'); e.wait(timeout=300); note('early exited rc=%s' % e.returncode)
note('row after early=' + psql('select status,"lockedBy","lockedAt",attempts,"processedAt" from kodus_workflow.inbox_messages'))
locked=psql('select extract(epoch from "lockedAt") from kodus_workflow.inbox_messages')
note('waiting for 15 min claim expiry from lockedAt epoch %s (db clock)' % locked)
while True:
    r=psql('select extract(epoch from (now() - "lockedAt")) from kodus_workflow.inbox_messages')
    if not r: note('ERROR db unreachable or row gone during wait'); raise SystemExit(2)
    age=float(r)
    if age > 15*60 + 20: break
    time.sleep(15)
l=start('late'); l.wait(timeout=300); note('late exited rc=%s' % l.returncode)
note('row after late=' + psql('select status,"lockedBy","lockedAt",attempts,"processedAt" from kodus_workflow.inbox_messages'))
again=start('after'); again.wait(timeout=300); note('after exited rc=%s' % again.returncode)
note('row final=' + psql('select status,"lockedBy","lockedAt",attempts,"processedAt" from kodus_workflow.inbox_messages'))
note('DONE')
