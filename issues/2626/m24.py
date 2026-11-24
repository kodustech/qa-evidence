import sys, json, os
from orch import *
def run(rev):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m24_{rev}_{uuid.uuid4().hex[:6]}'
    env = {'E2B_STATE_DIR': sd}
    A = Actor(rev, 'A', db, bar, env=env, log=log); B = Actor(rev, 'B', db, bar, env=env, log=log); O = Actor(rev, 'O', db, bar, env=env, log=log)
    k = key()
    a = A.call(key=k, cmd='acquire'); b = B.call(key=k, cmd='acquire', timeout=90)
    d2 = O.call(cmd='doc', key=k)['doc']
    A.call(cmd='release', leaseId=a['leaseId'], idleMs=0)
    d1 = O.call(cmd='doc', key=k)['doc']
    use = B.call(cmd='use', leaseId=b['leaseId'])
    dup = A.call(cmd='release', leaseId=a['leaseId'], idleMs=0)
    d1b = O.call(cmd='doc', key=k)['doc']
    B.call(cmd='release', leaseId=b['leaseId'], idleMs=0)
    d0 = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, sameSandbox=a['sandboxId'] == b['sandboxId'], afterBothAcquire=d2, afterArelease=d1, Buse=use, afterDuplicateArelease=d1b, afterBrelease=d0,
               kills=[l for l in lines(log) if 'e2b.kill' in l], timeline=lines(log))
    for x in (A, B, O): x.close()
    json.dump(res, open(f'out-m24-{rev}.json', 'w'), indent=1)
    print(rev, 'same', res['sameSandbox'], 'count', d2 and d2['leaseCount'], '->', d1 and d1['leaseCount'], d1 and d1.get('cleanupStatus'), d1 and d1.get('killAt'), 'Buse', use.get('kind'), use.get('err'), 'dup->', d1b and d1b['leaseCount'], 'final', d0)
    print('  kills', res['kills']); print('  warn', [l for l in lines(log) if 'unknown leaseId' in l][:2])
for r in sys.argv[1:]: run(r)
