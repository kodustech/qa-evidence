"""R18 driver: start w-shutdown in its own process, signal it, time the exit, read the doc after it exited."""
import subprocess, sys, os, time, json, signal
rev, wt, sig, tag = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
X = os.path.expanduser('~/.kodus-qa-runs/2026-11-27/2628-retest/exec')
out = f'{X}/shutdown-{tag}.jsonl'
env = dict(os.environ, H_REV=tag, H_WT=wt, H_OUT=out, H_E2B_LOG=f'{X}/shutdown-{tag}-e2b.jsonl', H_ROLE='worker')
for f in (out, env['H_E2B_LOG']):
    if os.path.exists(f): os.remove(f)
prKey = '44444444-2628-4ddd-8ddd-000000000004:r18:1'
ttl = '6000' if sig == 'KILL' else '1800000'
subprocess.run(['docker', 'exec', 'qa2628r-mongo', 'mongosh', '--quiet', '--eval', f"db.getSiblingDB('qa2628r_shutdown_{tag}').dropDatabase()"], capture_output=True)
p = subprocess.Popen(['node', 'qa-h/proc/boot.js', 'w-shutdown.ts', prKey, ttl], cwd=wt, env=env, stdout=open(f'{X}/shutdown-{tag}.out', 'w'), stderr=subprocess.STDOUT)
def lines():
    try: return [json.loads(l) for l in open(out)]
    except FileNotFoundError: return []
while not any(l['event'] == 'release-returned' for l in lines()):
    if p.poll() is not None: break
    time.sleep(0.1)
time.sleep(1.0)
ts = time.time()
os.kill(p.pid, signal.SIGTERM if sig == 'TERM' else signal.SIGKILL)
try: code = p.wait(timeout=30)
except subprocess.TimeoutExpired: code = 'timeout'; p.kill()
exit_s = time.time() - ts
doc = subprocess.run(['docker', 'exec', 'qa2628r-mongo', 'mongosh', '--quiet', '--eval', f"print(JSON.stringify(db.getSiblingDB('qa2628r_shutdown_{tag}').sandbox_leases.find().toArray()))"], capture_output=True, text=True).stdout.strip()
res = {'event': 'driver', 'signal': sig, 'signalAt': ts, 'exitCode': code, 'exitAfterSignalS': round(exit_s, 3), 'docAfterExit': json.loads(doc or '[]')}
if sig == 'KILL':
    time.sleep(6.5)
    subprocess.run(['node', 'qa-h/proc/boot.js', 'w-reaper.ts', prKey], cwd=wt, env=env, capture_output=True)
    res['e2bKills'] = [json.loads(l) for l in open(env['H_E2B_LOG'])] if os.path.exists(env['H_E2B_LOG']) else []
with open(out, 'a') as f: f.write(json.dumps(res) + '\n')
logs = [l for l in open(f'{X}/shutdown-{tag}.out') if 'SandboxLeaseManager' in l and ('shutdown' in l or 'released leaseId' in l or 'scheduled idle-kill' in l)]
print(json.dumps(res)); print(''.join(l[l.find('"msg"'):][:200] + '\n' for l in logs))
