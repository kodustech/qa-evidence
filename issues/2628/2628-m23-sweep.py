"""M23 sweep, matched on this run's ids (audit A17). Usage: sweep.py <fromISO> <toISO>
Step 1 collects this run's leaseIds/sandboxIds from the SandboxLeaseManager lines whose prKey starts
with a slot-b org id (plus the ledger ids), step 2 runs the five patterns and keeps a row when its
leaseId, sandboxId (attribute or inside the message), organizationId or prKey belongs to this run.
The observer's 'Sandbox cleanup failed on pipeline finish' carries no ids: every hit is listed with
its timestamp next to this run's pipeline-finish times."""
import h, json, sys, re
f, t = sys.argv[1], sys.argv[2]
ORGS = ['2a73f120-e3a5-4eea-9e44-3116fce23bfe', '0a010c6e-6636-44b7-a741-a08d546d41c9']
LEASES = set('''b23ca490-aa8e-4160-b53d-3f182de81985 4fc4be85-968b-42ef-aaf6-bcffe2765526 38cf7cb1-6ffa-44c3-b8ae-7c478b0293ef 4e14506b-cfc3-450c-aaf9-01e4254a9a1a
9470d673-9913-472e-b25c-990f95ceb3fe ae477437-5b16-41d2-860e-bba3515ecb2f 1ad83171-9b05-42a0-9593-790c55b7905e 9af5bb7b-beeb-40e6-b451-edf78335662c
b8b243ef-041a-4cc4-b382-7abe36f9d96f 6c5d227a-779e-4789-a4aa-c1780bf71d1d c69e21d2-89f1-4153-86be-c74e4ba941bc c2dfe24a-bfc3-457c-a337-2e7564e12c10
ccee6559-13e7-46a7-9610-a002c83b3d76'''.split())
SANDBOXES = set()  # this run's sandbox ids, masked for publication; step 1 rediscovers them from the slot-b lease lines
W = f'timestamp:{{$gte:new Date("{f}"),$lte:new Date("{t}")}}'
q = lambda extra, proj: h.mongo(f'print(JSON.stringify(db.observability_logs_ts.find({{{W},{extra}}}).limit(5000).toArray().map(x=>({proj}))))') or []
# 1. discover ids from acquire/READY/connected/released lines of the slot orgs
rows = q('component:"SandboxLeaseManager","attributes.prKey":{$regex:"^(' + '|'.join(ORGS) + ')"}', '{lid:(x.attributes||{}).leaseId||"",sid:(x.attributes||{}).sandboxId||""}')
for r in rows:
    if r['lid']: LEASES.add(r['lid'])
    if r['sid']: SANDBOXES.add(r['sid'])
print(json.dumps({'leaseIds': len(LEASES), 'sandboxIds': len(SANDBOXES)}))
proj = '{t:x.timestamp,l:x.level,m:String(x.message).slice(0,300),a:Object.assign({},x.metadata||{},x.attributes||{})}'
pats = [('sandbox used after release', 'SandboxLeaseManager'), ('release called with unknown leaseId', 'SandboxLeaseManager'),
        ('failed to set E2B-side idle timeout', 'SandboxLeaseManager'), ('Could not release the sandbox', 'AgentReviewStage'),
        ('Sandbox cleanup failed on pipeline finish', 'CodeReviewPipelineObserver')]
def mine(r):
    a = r['a']
    if a.get('leaseId') in LEASES or a.get('sandboxId') in SANDBOXES: return True
    if a.get('organizationId') in ORGS or any(str(a.get('prKey', '')).startswith(o) for o in ORGS): return True
    return any(s in r['m'] for s in SANDBOXES) or any(l in r['m'] for l in LEASES)
for p, c in pats:
    r = q(f'component:"{c}",message:{{$regex:{json.dumps(p)}}}', proj)
    levels = {}
    for x in r: levels[x['l']] = levels.get(x['l'], 0) + 1
    out = {'pattern': p, 'component': c, 'total_all_orgs': len(r), 'levels_all_orgs': levels, 'mine': [{'t': x['t'], 'level': x['l']} for x in r if mine(x)]}
    if c == 'CodeReviewPipelineObserver':
        out['unattributable_hits'] = [{'t': x['t'], 'level': x['l']} for x in r]
    print(json.dumps(out))
