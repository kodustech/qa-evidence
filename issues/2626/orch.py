import json, os, subprocess, threading, time, uuid, shutil, sys, queue
W = os.path.dirname(os.path.abspath(__file__))
def prep(rev):
    d = os.path.join(W, rev, 'harness'); shutil.rmtree(d, ignore_errors=True); shutil.copytree(os.path.join(W, 'harness'), d)
class Actor:
    def __init__(self, rev, name, db, bar, hooks='', env=None, log=None):
        e = dict(os.environ, REV=rev, ACTOR=name, DB=db, BARRIER_DIR=bar, HOOKS=hooks, TS_NODE_TRANSPILE_ONLY='1', TS_NODE_SWC='1', TS_NODE_PROJECT='tsconfig.json', **(env or {}))
        self.name = name; self.events = []; self.q = queue.Queue(); self.log = log
        self.p = subprocess.Popen(['node', '-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'harness/actor.ts'], cwd=os.path.join(W, rev), env=e,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        threading.Thread(target=self._read, daemon=True).start()
        self.wait(lambda ev: ev.get('kind') == 'ready', 60)
    def _read(self):
        for line in self.p.stdout:
            if line.startswith('§') or line.startswith('¶'):
                try: ev = json.loads(line[1:]); ev['_src'] = line[0]; ev['_actor'] = self.name
                except Exception: continue
                self.events.append(ev); self.q.put(ev)
                if self.log is not None: self.log.append(ev)
    def send(self, **c):
        c.setdefault('id', uuid.uuid4().hex[:8]); self.p.stdin.write(json.dumps(c) + '\n'); self.p.stdin.flush(); return c['id']
    def wait(self, pred, timeout=60):
        end = time.time() + timeout
        for ev in list(self.events):
            if pred(ev): return ev
        while time.time() < end:
            try: ev = self.q.get(timeout=0.2)
            except queue.Empty: continue
            if pred(ev): return ev
        raise TimeoutError(f'{self.name}: wait timed out')
    def call(self, timeout=60, **c):
        i = self.send(**c)
        return self.wait(lambda ev: ev.get('id') == i and ev.get('_src') == '§', timeout)
    def sigkill(self):
        self.p.kill(); self.p.wait(); return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + '.%03dZ' % (int(time.time()*1000) % 1000)
    def close(self):
        try: self.p.stdin.close()
        except Exception: pass
        self.p.kill()
def barrier_wait(bar, actor, point, timeout=60):
    end = time.time() + timeout
    while time.time() < end:
        if os.path.exists(f'{bar}/{actor}.{point}.reached'): return open(f'{bar}/{actor}.{point}.reached').read()
        time.sleep(0.05)
    raise TimeoutError(point)
def go(bar, actor, point): open(f'{bar}/{actor}.{point}.go', 'w').write('go')
def newbar():
    d = os.path.join(W, 'bar', uuid.uuid4().hex[:8]); os.makedirs(d); return d
def key(org='11111111-1111-4111-8111-111111111111'):
    return f'{org}:33333333-3333-4333-8333-333333333333:graph:{uuid.uuid4()}'
def lines(log, pat=None):
    out = []
    for ev in log:
        if ev['_src'] == '¶':
            if pat is None or pat in ev.get('message', ''): out.append(f"{ev['t']} pid={ev['pid']} {ev['_actor']} {ev['level']} {ev['message'][:170]}")
        else:
            k = ev.get('kind')
            if k not in ('ack',): out.append(f"{ev['t']} pid={ev['pid']} {ev['_actor']} § {k} " + json.dumps({x: ev[x] for x in ev if x not in ('t','pid','rev','kind','_src','_actor')})[:300])
    return out
