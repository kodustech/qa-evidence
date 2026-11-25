from h import *
import json, re, datetime
idx=json.load(open('logs-m29-indexer-raw.json'))
mans=[]
for m in ['m2','m4','m23','m20b']: mans+=json.load(open(f'manifest-{m}.json'))
extra=['11352106-4ed0-4d1b-80dd-81a1eaa8a18b','223e0169-9147-4b2b-a687-8f418eef8187','d1d732df-2cbf-47cf-ae9a-e7fc368acf81','0c0e3136-f4a7-4e2a-87bc-3b00c9ecd330','9943b288-3622-448e-bed2-38915b6b02b6','4d57beae-a902-43c0-a436-d3ec413349f9','67ec9aa5-4792-485f-9fba-7fdbad832287','246472ee-c751-437c-af55-4ffbf8ee3987']
ids=[r['job'] for r in mans]+extra
uu=','.join("'%s'"%i for i in ids)
rows=qa.pg('select uuid, "workflowType", status, "startedAt", "completedAt", payload->>\'repositoryId\', coalesce(metadata->>\'headSha\', payload->>\'newSha\',\'\'), metadata->>\'sandboxId\' from kodus_workflow.workflow_jobs where uuid in (%s) order by "startedAt"' % uu)
E={x['sandboxId']:x for x in json.load(open('e2b-own-sandboxes.json'))['sandboxes']}
newids=[r[7] for r in rows if len(r)>7 and r[7] not in E]
for x in e2b(*newids):
    ev=x.get('events') if isinstance(x.get('events'),list) else []
    E[x['id']]={'sandboxId':x['id'],'events':[{'type':e['type'].split('.')[-1],'ts':e['ts'],'kill_reason':e.get('reason')} for e in ev]}
out=['| job | type | job status | started -> completed (UTC) | repo | sha (job) | indexer line at completion | sandbox | E2B killed (reason) | paused |','|---|---|---|---|---|---|---|---|---|---|']
for r in rows:
    r=r+['']*(8-len(r)); job,typ,st,sa,ca,repo,sha,sb=r
    cat=datetime.datetime.fromisoformat(ca.replace(' ','T')[:19])
    line=[l for l in idx if repo in l[1] and abs((datetime.datetime.fromisoformat(l[0][:19])-cat).total_seconds())<5 and ('COMPLETE' in l[1] or '0 nodes' in l[1])]
    ln=(line[0][0][11:23]+' '+re.sub(r'for repo [0-9a-f-]+ ','',line[0][1])[:90]) if line else 'none found'
    ev=E.get(sb,{}).get('events',[])
    k=[e for e in ev if e['type']=='killed']; p=[e for e in ev if e['type']=='paused']
    out.append('| %s | %s | %s | %s -> %s | %s | %s | %s | %s | %s | %s |' % (job[:8], typ.replace('AST_GRAPH_',''), st, sa[11:23], ca[11:23], repo[:8], sha[:8], ln, sb, (k[0]['ts'][11:23]+' '+str(k[0]['kill_reason'])) if k else 'NONE', bool(p)))
hdr="# M29: per-attempt surfaces\n\nRepo state = the GraphIndexerService line logged at each job's completion (status and counts it persisted); sha = the job's own headSha/newSha; E2B = lifecycle events of this run's sandbox ids.\n\n"
open('m29-surfaces.md','w').write(hdr+'\n'.join(out)+'\n')
json.dump({'sandboxes':list(E.values())}, open('e2b-own-sandboxes-2.json','w'), indent=1)
print('\n'.join(out))
