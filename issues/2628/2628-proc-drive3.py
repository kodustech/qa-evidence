import subprocess, os, sys, json, signal, time, re
sys.path.insert(0, os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2628/exec')); import h
rev, role = sys.argv[1], sys.argv[2]
WT = os.path.expanduser(f'~/.kodus-qa-runs/2026-11-24/2628/wt/{rev}')
EX = os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2628/exec/paid')
OUT = f'{EX}/{role}-{rev}.jsonl'
if os.path.exists(OUT): os.remove(OUT)
dotenv = {}
for line in open('~/Projects/Kody/kodus-ai/.env'):
    m = re.match(r'^(API_E2B_KEY|API_E2B_TEMPLATE_ID)=(.*)$', line.strip())
    if m: dotenv[m.group(1)] = m.group(2).strip().strip('"').strip("'")
base = {k: v for k, v in os.environ.items() if not re.search(r'(_API_KEY|_TOKEN|OPENAI|ANTHROPIC|FIREWORKS|TOGETHER|OPENROUTER|MONGO|POSTGRES|DATABASE)', k)}
env = dict(base, H_WT=WT, H_REV=rev, H_OUT=OUT, H_FIXTURE=f'{EX}/pr2.json', TZ='UTC', API_CRYPTO_KEY=os.urandom(32).hex(),
           QA_FW_KEY=h.qa.env('FIREWORKS_API_KEY'), QA_GH_TOKEN=h.qa.env('GITHUB_TOKEN'))
if role.startswith('e2b'): env.update(dotenv)
log = open(f'{EX}/{role}-{rev}.stdout.log', 'w')
p = subprocess.Popen(['node', 'test/qa2628proc/bootreal.js', 'worker3.ts', role], cwd=WT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
kill_on = {'e2b-kill-after-stage': '"event":"publishing"', 'e2b-kill-during-orchestrator': '"event":"ready-to-kill-during-orchestrator"'}.get(role)
killed = None
for line in p.stdout:
    log.write(line)
    if kill_on and kill_on in line:
        os.kill(p.pid, signal.SIGKILL); killed = time.time()
        open(OUT, 'a').write(json.dumps({'rev': rev, 'role': role, 'driver': True, 'event': 'SIGKILL', 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}) + '\n')
        break
p.wait(); log.close()
print(open(OUT).read())
