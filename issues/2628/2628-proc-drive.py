import subprocess, os, signal, json, time, sys, datetime
rev = sys.argv[1]
WT = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/wt/{rev}')
OUT = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/exec/m13-{rev}.jsonl')
E2B = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/exec/m13-{rev}-e2b.jsonl')
for f in (OUT, E2B):
    if os.path.exists(f): os.remove(f)
env = dict(os.environ, H_WT=WT, H_REV=rev, H_OUT=OUT, H_E2B_LOG=E2B)
now = lambda: datetime.datetime.utcnow().isoformat() + 'Z'
def note(ev, **d):
    open(OUT, 'a').write(json.dumps({'rev': rev, 'driver': True, 'event': ev, 'at': now(), **d}) + '\n')
def start(mode, key, ttl='8000', extra=None):
    e = dict(env, **(extra or {}))
    return subprocess.Popen(['node', 'test/qa2628proc/boot.js', 'worker.ts', mode, key, ttl], cwd=WT, env=e, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
def run(mode, key, ttl='8000'):
    p = start(mode, key, ttl); out, _ = p.communicate(timeout=120); return out
def wait_line(p, word, timeout=90):
    t0 = time.time()
    while time.time() - t0 < timeout:
        line = p.stdout.readline()
        if word in line: return json.loads(line)
    raise RuntimeError('timeout waiting ' + word)
for i, mode in enumerate(['hold', 'pause-before-decrement', 'after-killat']):
    key = f'33333333-2628-4ccc-8ccc-00000000000{i}:r1:{int(time.time())}'
    note('scenario', mode=mode, key=key)
    A = start(mode, key)
    word = {'hold': 'acquired-holding', 'pause-before-decrement': 'release-decided-decrement-pending', 'after-killat': 'killat-written'}[mode]
    wait_line(A, word)
    os.kill(A.pid, signal.SIGKILL); A.wait()
    note('sigkill', mode=mode, pid=A.pid)
    run('read', key)
    if mode == 'hold':
        run('join-and-release', key)   # replacement worker joins the orphaned sandbox and leaves
    time.sleep(9 if mode != 'after-killat' else 4)
    run('reaper', key)
    run('read', key)
print(open(OUT).read()); print('E2B'); print(open(E2B).read() if os.path.exists(E2B) else '')
