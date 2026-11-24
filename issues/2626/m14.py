import sys, json, os, glob
from orch import *
def env(sd): return {'E2B_STATE_DIR': sd}
def ps(sd): return {os.path.basename(f): open(f).read() for f in glob.glob(sd + '/*')}
def run(rev, variant, typ='full'):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m14_{rev}_{uuid.uuid4().hex[:6]}'
    W1 = Actor(rev, 'W1', db, bar, env=env(sd), log=log); C = Actor(rev, 'C', db, bar, env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    org = '11111111-1111-4111-8111-111111111111'; repo = str(uuid.uuid4()); job = str(uuid.uuid4()); k = f'{org}:{repo}:graph:{job}'
    if variant in ('A', 'C'): W1.call(cmd='kill', behaviors=['fail'])
    if variant == 'C': C.call(cmd='kill', behaviors=[], default='fail')
    r1 = W1.call(cmd='process', type=typ, repoId=repo, jobId=job, org=org, status='ready' if typ == 'incr' else 'pending', ctl={'failParse': '503 sandbox unavailable'}, timeout=60)
    d1 = O.call(cmd='doc', key=k)['doc']
    W1.close()
    W2 = Actor(rev, 'W2', db, bar, env=env(sd), log=log)
    t0 = time.time()
    pid = W2.send(cmd='process', type=typ, repoId=repo, jobId=job, org=org, status='ready' if typ == 'incr' else 'pending')
    ticks = 0
    r2 = None
    while time.time() - t0 < 200:
        try:
            r2 = W2.wait(lambda e: e.get('id') == pid and e.get('_src') == '§', 1); break
        except TimeoutError: pass
        if variant != 'B' and time.time() - t0 > 2 + ticks * 5:
            C.call(cmd='cron'); ticks += 1
    d2 = O.call(cmd='doc', key=k)['doc']
    L = lines(log)
    res = dict(rev=rev, variant=variant, type=typ, run1=r1, doc_after_run1=d1, run2=r2, run2_seconds=round(time.time() - t0, 1), cron_ticks=ticks, doc_end=d2, provider=ps(sd),
               local_cleanup_failed=any('local cleanup previously failed' in l for l in L), waits=len([l for l in L if 'cleanup in progress, waiting' in l]), timeline=L)
    for x in (W2, C, O): x.close()
    json.dump(res, open(f'out-m14-{variant}-{typ}-{rev}.json', 'w'), indent=1, default=str)
    print('M14', variant, typ, rev, 'run1', r1.get('thrown'), r1.get('job'), 'docAfter1', d1 and (d1['leaseCount'], d1.get('cleanupStatus'), d1.get('sandboxId')), 'run2', r2 and (r2.get('thrown'), r2.get('job')), 'secs', res['run2_seconds'], 'ticks', ticks, 'waits', res['waits'], 'localFailed', res['local_cleanup_failed'], 'end', d2, 'provider', res['provider'])
for r in sys.argv[2:]:
    for v in sys.argv[1].split(','):
        run(r, v, 'full'); run(r, v, 'incr') if v != 'C' else None
