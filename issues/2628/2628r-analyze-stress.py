"""R7 analysis: per rev, every Sandbox.kill against every holder interval of that sandbox, across processes."""
import json, sys, os, collections
X = os.path.expanduser('~/.kodus-qa-runs/2026-11-27/2628-retest/exec')
res = {}
for rev in sys.argv[1:]:
    ev = [json.loads(l) for l in open(f'{X}/stress-{rev}.jsonl')]
    e2b = [json.loads(l) for l in open(f'{X}/stress-{rev}-e2b.jsonl')]
    holds = collections.defaultdict(list)  # sandboxId -> [(role,i,start,end)]
    open_ = {}
    cmd_end = {}
    for e in ev:
        if e['event'] == 'cmd-end': cmd_end[(e['role'], e['i'])] = e['t']
    for e in ev:
        if e['event'] == 'acquired': open_[(e['role'], e['i'])] = (e['sandboxId'], e['t'], e.get('created'))
    for e in ev:
        if e['event'] == 'release-called':
            sid, st, created = open_[(e['role'], e['i'])]
            end = max(e['t'], cmd_end.get((e['role'], e['i']), 0))
            holds[sid].append({'role': e['role'], 'i': e['i'], 'start': st, 'end': end, 'created': created})
    kills = [x for x in e2b if x['op'] == 'kill']
    viol = []
    for k in kills:
        sid, t = k['args'][0], k['t']
        for h in holds.get(sid, []):
            if h['start'] <= t <= h['end']:
                viol.append({'sandboxId': sid, 'killAt': t, 'killerPid': k['pid'], 'holder': h['role'], 'i': h['i'], 'holdStart': h['start'], 'holdEnd': h['end']})
    per_sbx = collections.Counter(k['args'][0] for k in kills)
    joins = [e for e in ev if e['event'] == 'acquired' and e['role'] == 'B']
    warm = sum(1 for e in joins if not e.get('created'))
    samples = [e for e in ev if e['event'] == 'sample-held-with-killAt']
    final = json.load(open(f'{X}/stress-{rev}-finaldocs.json'))
    # overlap evidence: iterations where B's acquire-called lies within 20 ms of A's release-called or of a kill by a reaper
    rel = {(e['i']): e['t'] for e in ev if e['event'] == 'release-called' and e['role'] == 'A'}
    acq = {(e['i']): e['t'] for e in ev if e['event'] == 'acquire-called' and e['role'] == 'B'}
    close = sorted((abs(acq[i] - rel[i]), i) for i in acq if i in rel)[:5]
    pids = sorted({e['pid'] for e in ev} | {k['pid'] for k in e2b})
    res[rev] = {
        'iterations': len({e['i'] for e in ev if 'i' in e}), 'errors': [e for e in ev if e['event'] in ('error', 'fatal', 'reaper-error')][:5],
        'processes': len(pids), 'kills': len(kills), 'sandboxesKilledMoreThanOnce': sum(1 for v in per_sbx.values() if v > 1),
        'warmJoins': warm, 'coldJoins': len(joins) - warm,
        'violations_killWhileHeld': len(viol), 'violationSamples': viol[:5],
        'samplesHeldWithKillAt': len(samples),
        'finalDocs': len(final), 'finalHeldDocs': sum(1 for d in final if d.get('leaseCount', 0) > 0),
        'finalDocsWithFutureOrPastKillAt': sum(1 for d in final if d.get('killAt')),
        'closestBJoinToARelease_ms': close,
    }
print(json.dumps(res, indent=1))
