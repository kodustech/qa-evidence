import subprocess, os, signal, json, time, sys, datetime
rev = sys.argv[1]
WT = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/wt/{rev}')
OUT = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/exec/m13v2-{rev}.jsonl')
if os.path.exists(OUT): os.remove(OUT)
env = dict(os.environ, H_WT=WT, H_REV=rev, H_OUT=OUT, H_E2B_LOG=OUT.replace('.jsonl', '-e2b.jsonl'), TZ='UTC', API_CRYPTO_KEY=os.urandom(32).hex())
now = lambda: datetime.datetime.utcnow().isoformat() + 'Z'
def note(ev, **d): open(OUT, 'a').write(json.dumps({'rev': rev, 'driver': True, 'event': ev, 'at': now(), **d}) + '\n')
def start(role, pr='1'): return subprocess.Popen(['node', 'test/qa2628proc/boot.js', 'worker2.ts', role, pr], cwd=WT, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
def run(role, pr='1'): p = start(role, pr); p.communicate(timeout=300)
def psql(sql): return subprocess.run(['docker', 'exec', 'qa2628-pg', 'psql', '-U', 'postgres', '-d', 'qa2628', '-Atc', sql], capture_output=True, text=True).stdout.strip()
def mongo(js): return subprocess.run(['docker', 'exec', 'qa2628-mongo', 'mongosh', '--quiet', f'qa2628_m13v2_{rev}', '--eval', js], capture_output=True, text=True).stdout.strip()
REPO = f'rq13{rev}'
mongo('db.sandbox_leases.deleteMany({})')
psql(f"delete from code_review_execution where automation_execution_id in (select uuid from automation_execution where \"repositoryId\"='{REPO}'); delete from automation_execution where \"repositoryId\"='{REPO}'")
A = start('review-A')
while True:
    line = A.stdout.readline()
    if not line: break
    if '"event":"publishing"' in line: break
os.kill(A.pid, signal.SIGKILL); A.wait(); note('sigkill-A-during-publication', pid=A.pid)
run('read')
note('start-B1-while-A-row-in-progress')
run('review-B')
a_uuid = psql(f"select uuid from automation_execution where \"repositoryId\"='{REPO}' order by \"createdAt\" limit 1")
psql(f"update automation_execution set \"updatedAt\" = now() - interval '6 minutes' where uuid='{a_uuid}'")
note('clock-advance: A heartbeat aged 6 min (> 5 min gate cutoff)', a_uuid=a_uuid)
run('review-B')
psql(f"update automation_execution set \"updatedAt\" = now() - interval '16 minutes' where uuid='{a_uuid}'")
note('clock-advance: A heartbeat aged 16 min (> 15 min watchdog cutoff)')
run('watchdog')
mongo(f'db.sandbox_leases.updateMany({{}}, {{$set: {{expiresAt: new Date(Date.now() - 1000)}}}})')
note('clock-advance: lease TTL expired')
run('lease-reaper')
run('read')
for l in open(OUT):
    d = json.loads(l)
    keep = {k: d[k] for k in d if k in ('role', 'event', 'at', 'lease', 'result', 'executions', 'usage', 'a_uuid', 'pid')}
    print(json.dumps(keep, default=str)[:520])
