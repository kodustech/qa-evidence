import sys, json, os, subprocess, time, uuid, glob, threading, shutil
from orch import *
def spawn(rev, env, log, name):
    e = dict(os.environ, REV=rev, ACTOR=name, TS_NODE_TRANSPILE_ONLY='1', TS_NODE_SWC='1', TS_NODE_PROJECT='tsconfig.json', API_CRYPTO_KEY='00'*32, **env)
    p = subprocess.Popen(['node', '-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'harness/qworker.ts'], cwd=os.path.join(W, rev), env=e, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    def rd():
        for line in p.stdout:
            if line[:1] in '§¶':
                try: ev = json.loads(line[1:]); ev['_src'] = line[0]; ev['_actor'] = name; log.append(ev)
                except Exception: pass
            elif 'ERROR' in line: log.append({'_src': '!', '_actor': name, 't': '', 'pid': p.pid, 'kind': 'stderr', 'line': line[:300]})
    threading.Thread(target=rd, daemon=True).start(); return p
def psql(sql):
    return subprocess.run(['docker', 'exec', 'qa2626-pg', 'psql', '-U', 'postgres', '-tA', '-F', '\t', '-c', sql], capture_output=True, text=True).stdout.strip()
def run(rev, variant, type='incr'):
    prep(rev); bar = newbar(); sd = newbar(); log = []
    db = f'h2626_m14q_{rev}_{variant}_{uuid.uuid4().hex[:5]}'; repo = str(uuid.uuid4())
    base = dict(E2B_STATE_DIR=sd, DB=db, REPO_ID=repo, JOBTYPE=type, RETRY_DELAY_MS='1000')
    s = subprocess.run(['node', '-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'harness/qworker.ts'], cwd=os.path.join(W, rev), capture_output=True, text=True,
        env=dict(os.environ, REV=rev, ROLE='setup', TS_NODE_TRANSPILE_ONLY='1', TS_NODE_SWC='1', TS_NODE_PROJECT='tsconfig.json', API_CRYPTO_KEY='00'*32, **base, **({'NO_OTD': '1'} if variant == 'no-otd' else {})))
    setup = [json.loads(l[1:]) for l in s.stdout.splitlines() if l.startswith('§') and 'setup.done' in l]
    if not setup: print('setup failed', s.stdout[-800:], s.stderr[-800:]); return
    job, mid = setup[0]['jobId'], setup[0]['messageId']
    C = Actor(rev, 'C', db, bar, env=dict(E2B_STATE_DIR=sd, WITH_LOCK='1'), log=log)
    w1env = dict(base, ROLE='worker', FAIL_PARSE_TIMES='1' if variant != 'no-otd' else '0', EXIT_AFTER='1', KILL={'A': 'fail', 'B': 'ok', 'C': 'fail', 'no-otd': 'ok'}[variant])
    W1 = spawn(rev, w1env, log, 'W1'); time.sleep(4)
    W2 = spawn(rev, dict(base, ROLE='worker', KILL='ok'), log, 'W2')
    if variant == 'C': C.call(cmd='kill', behaviors=[], default='fail')
    t0 = time.time(); t_w2 = None; ticks = 0; tick_every = float(os.environ.get('TICK', '5'))
    while time.time() - t0 < float(os.environ.get('MAXS', '150')):
        st = psql(f"select status from kodus_workflow.workflow_jobs where uuid='{job}'")
        if variant != 'C' and st == 'COMPLETED' and any(e.get('kind') == 'amqp.acked' and e['_actor'] == 'W2' for e in log): break
        if variant == 'C' and any(e.get('kind') == 'amqp.acked' and e['_actor'] == 'W2' for e in log): break
        w2 = next((e for e in log if e.get('kind') == 'amqp.delivery' and e['_actor'] == 'W2'), None)
        if w2 and t_w2 is None: t_w2 = time.time()
        if variant != 'B' and t_w2 and time.time() - t_w2 > 2 + ticks * tick_every:
            try: C.call(cmd='cron', timeout=30)
            except Exception: pass
            ticks += 1
        time.sleep(0.3)
    time.sleep(2)
    jobrow = psql(f"select status, \"retryCount\", \"errorClassification\", left(coalesce(\"lastError\",''),120) from kodus_workflow.workflow_jobs where uuid='{job}'")
    inbox = psql(f"select \"consumerId\", status, \"lockedBy\", \"lockedAt\", attempts from kodus_workflow.inbox_messages where \"messageId\"='{mid}'") or psql("select * from kodus_workflow.inbox_messages limit 3")
    L = lines(log) + [f"{e.get('t','')} {e['_actor']} {e.get('line','')}" for e in log if e.get('_src') == '!']
    prov = {os.path.basename(f): open(f).read() for f in glob.glob(sd + '/*')}
    res = dict(rev=rev, variant=variant, type=type, jobId=job, messageId=mid, seconds=round(time.time() - t0, 1), cron_ticks=ticks, job_row=jobrow, inbox_rows=inbox, provider=prov, timeline=L)
    for p in (W1, W2):
        try: p.kill()
        except Exception: pass
    C.close()
    json.dump(res, open(f'out-m14q-{variant}-{type}-{rev}.json', 'w'), indent=1, default=str)
    print('M14q', variant, type, rev, 'secs', res['seconds'], 'ticks', ticks, 'job', jobrow, '| inbox', inbox.replace('\n', ' || '), '| provider', prov)
    for l in L:
        if any(k in l for k in ['amqp.', 'consumer.threw', 'cleanup in progress', 'Giving up', 'timeout', 'creator path', 'COMPLETED', 'worker.exit', 'stderr', 'single-use', 'immediate kill', 'Message already claimed']): print('   ', l[:200])
for v in sys.argv[2].split(','): run(sys.argv[1], v, os.environ.get('JT', 'incr'))
