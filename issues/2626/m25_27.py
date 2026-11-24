import sys, json, os
from orch import *
def env(sd): return {'E2B_STATE_DIR': sd}
def m25(rev):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m25_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, hooks='after-decrement', env=env(sd), log=log); B = Actor(rev, 'B', db, bar, env=env(sd), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0)
    barrier_wait(bar, 'A', 'after-decrement'); d_mid = O.call(cmd='doc', key=k)['doc']
    b = B.call(key=k, cmd='acquire', timeout=90)
    d_b = O.call(cmd='doc', key=k)['doc']
    go(bar, 'A', 'after-decrement'); A.wait(lambda e: e.get('kind') == 'released', 30)
    d_after = O.call(cmd='doc', key=k)['doc']
    use = B.call(cmd='use', leaseId=b['leaseId'])
    B.call(cmd='release', leaseId=b['leaseId'], idleMs=0)
    d_end = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, doc_after_A_decrement=d_mid, B=b, doc_after_B_acquire=d_b, doc_after_A_resumed=d_after, B_use=use, doc_after_B_release=d_end, timeline=lines(log))
    for x in (A, B, O): x.close()
    json.dump(res, open(f'out-m25-{rev}.json', 'w'), indent=1)
    print('M25', rev, 'B joined same', b['sandboxId'] == a['sandboxId'], 'lost-claim', any('lost the cleanup claim' in l for l in lines(log)), 'A-kills', [l[:120] for l in lines(log) if 'e2b.kill' in l and ' A ' in l], 'docAfterA', d_after and (d_after['leaseCount'], d_after.get('cleanupStatus'), d_after.get('killAt')), 'Buse', use.get('kind'), 'end', d_end)
def m26(rev, fail):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m26_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, hooks='after-claim', env=env(sd), log=log); B = Actor(rev, 'B', db, bar, env=env(sd), log=log); C = Actor(rev, 'C', db, bar, env=env(sd), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    if fail: A.call(cmd='kill', behaviors=['fail'])
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0)
    try: barrier_wait(bar, 'A', 'after-claim', 15); claimed = True
    except TimeoutError: claimed = False
    d_claim = O.call(cmd='doc', key=k)['doc']
    bid = B.send(cmd='acquire', key=k)
    time.sleep(2.5); d_wait = O.call(cmd='doc', key=k)['doc']
    if claimed: go(bar, 'A', 'after-claim')
    A.wait(lambda e: e.get('kind') == 'released', 30)
    d_afterA = O.call(cmd='doc', key=k)['doc']
    if fail:
        time.sleep(1); C.call(cmd='cron'); 
    b = B.wait(lambda e: e.get('id') == bid and e.get('_src') == '§', 90)
    d_b = O.call(cmd='doc', key=k)['doc']
    B.call(cmd='release', leaseId=b['leaseId'], idleMs=0)
    d_end = O.call(cmd='doc', key=k)['doc']
    res = dict(rev=rev, killFails=fail, doc_after_claim=d_claim, doc_while_B_waits=d_wait, doc_after_A=d_afterA, B=b, doc_after_B=d_b, doc_end=d_end, timeline=lines(log))
    for x in (A, B, C, O): x.close()
    json.dump(res, open(f'out-m26-{rev}-{"fail" if fail else "ok"}.json', 'w'), indent=1)
    print('M26', rev, 'fail' if fail else 'ok', 'claimDoc', d_claim and (d_claim['leaseCount'], d_claim.get('cleanupStatus'), bool(d_claim.get('killAt'))), 'whileWait', d_wait and (d_wait['leaseCount'], d_wait.get('cleanupStatus')), 'B', b.get('kind'), b.get('sandboxId'), 'old', a['sandboxId'], 'waited', b.get('waitedMs'), 'connect-old', any(('e2b.connect' in l and a['sandboxId'] in l) for l in lines(log)), 'end', d_end)
def m27(rev):
    # (1) stale cron snapshot vs replacement lease
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m27_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, hooks='after-claim', env=env(sd), log=log); B = Actor(rev, 'B', db, bar, env=env(sd), log=log)
    C = Actor(rev, 'C', db, bar, hooks='cron-after-read', env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0)
    try: barrier_wait(bar, 'A', 'after-claim', 10); claimed = True
    except TimeoutError: claimed = False
    C.send(cmd='cron'); barrier_wait(bar, 'C', 'cron-after-read')
    if claimed: go(bar, 'A', 'after-claim')
    A.wait(lambda e: e.get('kind') == 'released', 30)
    d_afterA = O.call(cmd='doc', key=k)['doc']
    b = B.call(key=k, cmd='acquire', timeout=90)
    d_b = O.call(cmd='doc', key=k)['doc']
    go(bar, 'C', 'cron-after-read'); C.wait(lambda e: e.get('kind') == 'cron.done', 30)
    d_afterC = O.call(cmd='doc', key=k)['doc']
    use = B.call(cmd='use', leaseId=b['leaseId'])
    B.call(cmd='release', leaseId=b['leaseId'], idleMs=0)
    d_end = O.call(cmd='doc', key=k)['doc']
    import glob
    alive = {os.path.basename(f): open(f).read() for f in glob.glob(sd + '/*')}
    res = dict(rev=rev, doc_after_A=d_afterA, B=b, doc_after_B_acquire=d_b, doc_after_stale_cron=d_afterC, B_use=use, doc_end=d_end, provider_state=alive, timeline=lines(log))
    for x in (A, B, C, O): x.close()
    json.dump(res, open(f'out-m27-stale-{rev}.json', 'w'), indent=1)
    print('M27 stale', rev, 'docAfterA', d_afterA and (d_afterA['leaseCount'], d_afterA.get('cleanupStatus')), 'B', b['sandboxId'], 'fresh', b['sandboxId'] != a['sandboxId'], 'docAfterB', d_b and (d_b['sandboxId'], d_b['leaseCount']), 'docAfterStaleCron', d_afterC, 'Buse', use.get('kind'), use.get('err'), 'end', d_end, 'provider', alive)
def m27b(rev, order):
    # (2) cron tick overlapping the immediate kill
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m27b_{rev}_{uuid.uuid4().hex[:6]}'
    A = Actor(rev, 'A', db, bar, hooks='after-claim', env=env(sd), log=log)
    C = Actor(rev, 'C', db, bar, hooks='cron-after-read' if order == 'cron-reads-first' else '', env=dict(env(sd), WITH_LOCK='1'), log=log); O = Actor(rev, 'O', db, bar, env=env(sd), log=log)
    k = key(); a = A.call(key=k, cmd='acquire')
    A.send(cmd='release', leaseId=a['leaseId'], idleMs=0)
    try: barrier_wait(bar, 'A', 'after-claim', 10); claimed = True
    except TimeoutError: claimed = False
    if order == 'cron-first':
        C.call(cmd='cron')
        if claimed: go(bar, 'A', 'after-claim')
        A.wait(lambda e: e.get('kind') == 'released', 30)
    else:
        C.send(cmd='cron'); 
        try: barrier_wait(bar, 'C', 'cron-after-read', 10)
        except TimeoutError: pass
        if claimed: go(bar, 'A', 'after-claim')
        A.wait(lambda e: e.get('kind') == 'released', 30)
        go(bar, 'C', 'cron-after-read'); C.wait(lambda e: e.get('kind') == 'cron.done', 30)
    d = O.call(cmd='doc', key=k)['doc']
    L = lines(log)
    res = dict(rev=rev, order=order, doc_end=d, errors=[l for l in L if ' error ' in l or 'ERROR' in l], timeline=L)
    for x in (A, C, O): x.close()
    json.dump(res, open(f'out-m27-{order}-{rev}.json', 'w'), indent=1)
    print('M27', order, rev, 'end', d, 'kills', len([l for l in L if 'e2b.kill.call' in l]), 'errors', res['errors'][:2], [l[30:150] for l in L if 'IDLE-KILL' in l or 'single-use' in l or 'immediate kill' in l])
what = sys.argv[1]; revs = sys.argv[2:]
for r in revs:
    if what == 'm25': m25(r)
    if what == 'm26': m26(r, False); m26(r, True)
    if what == 'm27': m27(r); m27b(r, 'cron-first'); m27b(r, 'cron-reads-first')
