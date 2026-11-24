import sys, json, os, glob
from orch import *
def env(sd): return {'E2B_STATE_DIR': sd}
def prov_state(sd): return {os.path.basename(f): open(f).read() for f in glob.glob(sd + '/*')}
def m11_post(rev, mutant=False):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m11_{rev}_{uuid.uuid4().hex[:6]}'
    e = env(sd); 
    if mutant: e['MUTANT_NO_KILLAT'] = '1'
    A = Actor(rev, 'A', db, bar, hooks='after-claim', env=e, log=log); C = Actor(rev, 'C', db, bar, env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0)
    try: barrier_wait(bar, 'A', 'after-claim', 10)
    except TimeoutError: pass
    d_claim = O.call(cmd='raw', key=k)['doc']
    t_kill = A.sigkill()
    d_dead = O.call(cmd='doc', key=k)['doc']
    C.call(cmd='cron'); d_cron = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, mutant=mutant, sigkill_at=t_kill, A_pid=a['pid'], doc_after_claim=d_claim, doc_after_sigkill=d_dead, doc_after_cron=d_cron, provider=prov_state(sd), timeline=lines(log))
    for x in (C, O): x.close()
    json.dump(res, open(f'out-m11-post{"-mutant" if mutant else ""}-{rev}.json', 'w'), indent=1, default=str)
    print('M11 post', 'mutant' if mutant else '', rev, 'claim', d_claim and (d_claim.get('cleanupStatus'), d_claim.get('killAt')), 'sigkill', t_kill, 'afterCron', d_cron and (d_cron['leaseCount'], d_cron.get('cleanupStatus'), d_cron.get('killAt')), 'provider', res['provider'])
def m11_pre(rev):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m11p_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, hooks='after-decrement', env=env(sd), log=log); C = Actor(rev, 'C', db, bar, env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0); barrier_wait(bar, 'A', 'after-decrement', 10)
    t_kill = A.sigkill()
    d_dead = O.call(cmd='doc', key=k)['doc']
    C.call(cmd='cron'); d_cron = O.call(cmd='doc', key=k)['doc']
    C.call(cmd='reap'); d_reap1 = O.call(cmd='doc', key=k)['doc']
    O.call(cmd='set', key=k, set={'expiresAt': {'$date': '2000-01-01T00:00:00Z'}})
    O.call(cmd='set', key=k, set={'expiresAt': '2000-01-01T00:00:00.000Z'})
    C.call(cmd='reap'); d_reap2 = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, sigkill_at=t_kill, doc_after_sigkill=d_dead, doc_after_cron=d_cron, doc_after_reap_before_expiry=d_reap1, doc_after_reap_after_expiry=d_reap2, provider=prov_state(sd), timeline=lines(log))
    for x in (C, O): x.close()
    json.dump(res, open(f'out-m11-pre-{rev}.json', 'w'), indent=1, default=str)
    print('M11 pre', rev, 'afterKill', d_dead and (d_dead['leaseCount'], d_dead.get('cleanupStatus'), d_dead.get('killAt'), d_dead.get('expiresAt')), 'afterCron', bool(d_cron), 'reapBefore', bool(d_reap1), 'reapAfterExpiry', d_reap2, 'provider', res['provider'])
def m17(rev, typ):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m17_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, env=env(sd), log=log); C = Actor(rev, 'C', db, bar, env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    org = '11111111-1111-4111-8111-111111111111'; repo = str(uuid.uuid4()); job = str(uuid.uuid4()); k = f'{org}:{repo}:graph:{job}'
    A.send(cmd='process', type=typ, repoId=repo, jobId=job, org=org, status='ready' if typ == 'incr' else 'pending', ctl={'parseDelayMs': 60000})
    A.wait(lambda e: e.get('kind') == 'cli.parse.start', 60)
    d_run = O.call(cmd='doc', key=k)['doc']
    t_kill = A.sigkill()
    C.call(cmd='cron'); d_cron = O.call(cmd='doc', key=k)['doc']
    C.call(cmd='reap'); d_r1 = O.call(cmd='doc', key=k)['doc']
    O.call(cmd='set', key=k, set={'expiresAt': '2000-01-01T00:00:00.000Z'})
    C.call(cmd='reap'); d_r2 = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, type=typ, doc_while_parsing=d_run, sigkill_at=t_kill, doc_after_idle_cron=d_cron, doc_after_reap_before_expiry=d_r1, doc_after_reap_after_expiry=d_r2, provider=prov_state(sd), timeline=lines(log))
    for x in (C, O): x.close()
    json.dump(res, open(f'out-m17-{typ}-{rev}.json', 'w'), indent=1, default=str)
    print('M17', typ, rev, 'running', d_run and (d_run['leaseCount'], d_run.get('expiresAt')), 'afterCron', bool(d_cron), 'reapBefore', bool(d_r1), 'reapAfter', d_r2, 'provider', res['provider'], [l[30:140] for l in lines(log) if 'REAPER' in l])
what = sys.argv[1]
for r in sys.argv[2:]:
    if what == 'm11': m11_post(r); m11_post(r, True); m11_pre(r)
    if what == 'm17': m17(r, 'full'); m17(r, 'incr')
