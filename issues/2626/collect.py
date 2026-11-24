import sys, json
from h import *
from datetime import datetime, timedelta
def iso(s):
    s = s.replace('Z','').replace(' ','T')
    if '.' in s:
        a, b = s.split('.'); s = a + '.' + (b[:6]).ljust(6, '0')
    return datetime.fromisoformat(s)
def collect(uuids, label, LOGS=None):
    rows = []
    for u in uuids:
        j = job(u)
        key = prkey(j)
        st = (iso(j['created'].replace(' ','T')) - timedelta(minutes=1)).isoformat() + 'Z'
        en = (iso((j['completed'] or j['created']).replace(' ','T')) + timedelta(minutes=8)).isoformat() + 'Z'
        L = [l for l in LOGS if key in l[2] or (len(l)>5 and l[5]==key) or (j['sandboxId'] and len(l)>6 and l[6]==j['sandboxId'])]
        rel = [l for l in L if 'released leaseId' in l[2] and 'leaseCount=0' in l[2]]
        kil = [l for l in L if 'killed single-use sandbox immediately' in l[2]]
        sched = [l for l in L if 'scheduled idle-kill' in l[2]]
        other = [l for l in L if any(k in l[2] for k in ['lost the cleanup claim','immediate kill failed','IDLE-KILL','REAPER'])]
        ld = lease(key)
        ev = e2b(j['sandboxId'])[0] if j['sandboxId'] else {}
        evs = ev.get('events') if isinstance(ev.get('events'), list) else []
        kev = [e for e in evs if e['type'].endswith('killed')]
        pev = [e for e in evs if e['type'].endswith('paused')]
        t_rel = rel[-1][0] if rel else None
        t_kill_log = kil[-1][0] if kil else None
        t_prov = kev[-1]['ts'] if kev else None
        def d(a,b):
            if not a or not b: return None
            return round((iso(b) - iso(a)).total_seconds(), 3)
        rows.append(dict(label=label, job=u, type=j['type'], status=j['status'], org=j['org'], repo=j['repo'], prKey=key, sandboxId=j['sandboxId'],
            t_release=t_rel, t_kill_log=t_kill_log, kill_idleMs=(kil[-1][3] if kil else None), t_provider_kill=t_prov, kill_reason=(kev[-1].get('reason') if kev else None),
            paused=bool(pev), d_release_killlog=d(t_rel, t_kill_log), d_release_provider=d(t_rel, t_prov), scheduled_idle_kill=len(sched),
            other=[o[2][:120] for o in other], lease_doc_after=len(ld), getInfo=ev.get('getInfo') or ev.get('info'), stage=(kev[-1].get('stage') if kev else None),
            deployment=(kev[-1].get('deployment') if kev else None), events=[(e['type'].split('.')[-1], e['ts']) for e in evs]))
    return rows
if __name__ == '__main__':
    label = sys.argv[1]; cache = sys.argv[2]; uu = sys.argv[3:]
    LOGS = json.load(open(cache))
    R = collect(uu, label, LOGS)
    with open(f'manifest-{label}.json','w') as f: json.dump(R, f, indent=1, default=str)
    for r in R:
        print(r['job'][:8], r['type'][10:], r['status'], r['sandboxId'], 'rel', r['t_release'], 'Δlog', r['d_release_killlog'], 'Δprov', r['d_release_provider'], r['kill_reason'], 'idleMs', r['kill_idleMs'], 'sched', r['scheduled_idle_kill'], 'lease', r['lease_doc_after'], 'paused', r['paused'], r['other'], r['getInfo'])
