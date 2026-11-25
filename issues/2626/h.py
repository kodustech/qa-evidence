import sys, json, os
sys.path.insert(0, os.path.expanduser('~/.claude/skills/qa-validator/scripts'))
import qa
PROV = ['github','gitlab','bitbucket','azure','forgejo']
def acct(o): return json.load(open(os.path.expanduser(f'~/.kodus-qa-accounts/jr-claude-{o}.json')))
_tok = {}
def api(o, method, path, body=None):
    if o not in _tok:
        a = acct(o)
        s, d = qa.http('POST', qa.QA_API + '/auth/login', {'email': a['email'], 'password': a['password']})
        assert s < 300, s
        _tok[o] = d['data']['accessToken']
    return qa.http(method, qa.QA_API + path, body, {'authorization': 'Bearer ' + _tok[o]})
def repos(o):
    a = acct(o)
    return qa.pg(f"""select r.uuid,r.full_name,r.external_id,r.default_branch,r.ast_graph_status,r.ast_graph_sha,r.ast_graph_node_count,r.ast_graph_edge_count,r.ast_graph_built_at from repositories r join integration_configs ic on ic.uuid=r.integration_config_id where ic.team_id='{a['teamId']}' order by r.name""")
ORGS = {o: acct(o)['organizationId'] for o in PROV}
def jobs(where="", limit=20):
    orgs = ','.join("'%s'" % v for v in ORGS.values())
    return qa.pg(f"""select uuid, "workflowType", status, "createdAt", "startedAt", "completedAt", "retryCount", "organizationId", payload->>'repositoryId', metadata->>'sandboxId', left(coalesce("lastError",''),150) from kodus_workflow.workflow_jobs where "organizationId" in ({orgs}) and "workflowType"::text like 'AST%' {where} order by "createdAt" desc limit {limit}""")
REPS = {'github':'kodus-olimpo/claude-athena','gitlab':'sartorijr/claude-athena','bitbucket':'kodustech/claude-athena','azure':'Kodus QA/claude-athena','forgejo':'kodus/claude-athena'}
def prov(o, repo=None): return qa.provider(o, repo or REPS[o])
import subprocess
OWN = os.path.join(os.path.dirname(__file__), 'own-sandboxes.txt')
def own(*ids):
    cur = set(open(OWN).read().split())
    with open(OWN, 'a') as f:
        for i in ids:
            if i and i not in cur: f.write(i + '\n'); cur.add(i)
def e2b_key():
    # through scripts/qa.py: API_E2B_KEY lives in the checkout's .env, so qa.env reads it with KODUS_ENV_FILE pointed there, in a child process
    r = subprocess.run([sys.executable, '-c', "import sys; sys.path.insert(0, %r); import qa; sys.stdout.write(qa.env('API_E2B_KEY'))" % os.path.expanduser('~/.claude/skills/qa-validator/scripts')],
                       capture_output=True, text=True, env=dict(os.environ, KODUS_ENV_FILE='~/Projects/Kody/kodus-ai/.env'))
    return r.stdout
def e2b(*ids):
    r = subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'e2binfo.js'), *ids], capture_output=True, text=True, env=dict(os.environ, QA_E2B_KEY=e2b_key()))
    return [json.loads(l) for l in r.stdout.splitlines() if l.startswith('{')]
def prkey(job):
    return f"{job['org']}:{job['repo']}:graph:{job['uuid']}"
def job(uuid):
    r = qa.pg(f"""select uuid,"workflowType",status,"createdAt","startedAt","completedAt","retryCount","organizationId",payload->>'repositoryId',metadata->>'sandboxId',metadata::text,"lastError",payload->'organizationAndTeamData'->>'organizationId' from kodus_workflow.workflow_jobs where uuid='{uuid}'""")[0]; r = r + [""]*(13-len(r))
    return dict(uuid=r[0], type=r[1], status=r[2], created=r[3], started=r[4], completed=r[5], retry=r[6], org=r[7] or r[12], repo=r[8], sandboxId=r[9], metadata=r[10][:600], lastError=r[11][:300])
def keylogs(key, start, end):
    js = f"""const s=new Date('{start}'), e=new Date('{end}');
print(JSON.stringify(db.observability_logs_ts.find({{timestamp:{{$gte:s,$lt:e}}, component:'SandboxLeaseManager', message:{{$regex:{json.dumps(re.escape(key))}}}}}).sort({{timestamp:1}}).toArray().map(x=>[x.timestamp,x.level,String(x.message).slice(0,230), x.metadata && x.metadata.idleTimeoutMs])))"""
    return qa.mongo(js)
def lease(key):
    return qa.mongo(f"print(JSON.stringify(db.sandbox_leases.find({{_id:{json.dumps(key)}}}).toArray()))")
import re
def snap(repo_uuid):
    n = qa.pg(f"select kind,name,qualified_name,file_path,line_start,line_end,coalesce(parent_name,''),coalesce(params,''),coalesce(return_type,''),coalesce(modifiers::text,''),is_test,coalesce(file_hash,'') from ast_nodes where repo_id='{repo_uuid}' order by file_path,qualified_name,kind,line_start")
    e = qa.pg(f"select kind,source_qualified,target_qualified,file_path,coalesce(line::text,''),coalesce(confidence::text,'') from ast_edges where repo_id='{repo_uuid}' order by kind,source_qualified,target_qualified,file_path,line")
    import hashlib
    h = lambda rows: hashlib.sha256('\n'.join('\t'.join(x) for x in rows).encode()).hexdigest()[:16]
    return {'nodes': n, 'edges': e, 'nh': h(n), 'eh': h(e)}
ATHENA = {}
import urllib.parse as _up
def _az_get_file(self, path, ref):
    s, d = self.api('GET', f'/items?path={_up.quote("/" + path.lstrip("/"), safe="")}&versionDescriptor.version={_up.quote(ref)}&versionDescriptor.versionType=branch&includeContent=true')
    if s != 200: return None
    if isinstance(d, dict): return d.get('content')
    return d if isinstance(d, str) else None
qa.Azure.get_file = _az_get_file
def slmlogs(start, end, cache):
    if os.path.exists(cache): return json.load(open(cache))
    js = f"""const s=new Date('{start}'), e=new Date('{end}');
print(JSON.stringify(db.observability_logs_ts.find({{timestamp:{{$gte:s,$lt:e}}, component:{{$in:['SandboxLeaseManager','SandboxLeaseReaperService']}}}},{{timestamp:1,level:1,message:1,component:1,'metadata.idleTimeoutMs':1,'metadata.prKey':1,'metadata.sandboxId':1}}).toArray().map(x=>[x.timestamp,x.level,String(x.message).slice(0,300), x.metadata && x.metadata.idleTimeoutMs, x.component, x.metadata && (x.metadata.prKey||''), x.metadata && (x.metadata.sandboxId||'')])))"""
    r = qa.mongo(js, timeout=400); json.dump(r, open(cache, 'w')); return r
