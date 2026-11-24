import sys, os, json, subprocess, secrets
sys.path.insert(0, os.path.expanduser('~/.claude/skills/qa-validator/scripts')); import qa
R=os.path.expanduser('~/.kodus-qa-runs/2026-11-24/2576'); fx=json.load(open(f'{R}/snap/item16-repos.json'))
env={**os.environ,'API_CRYPTO_KEY':secrets.token_hex(32),'QA_GL_TOKEN':qa.env('GITLAB_TOKEN'),'QA_GL_PROJECT':str(fx['gitlab']['id']),
 'QA_BB_EMAIL':qa.env('BITBUCKET_EMAIL'),'QA_BB_TOKEN':qa.env('BITBUCKET_TOKEN'),'QA_BB_REPO':fx['bitbucket']['uuid'].strip('{}'),'QA_BB_WS':fx['bitbucket']['ws'].strip('{}'),
 'QA_AZ_ORG':qa.env('AZURE_REPOS_ORG'),'QA_AZ_TOKEN':qa.env('AZURE_REPOS_TOKEN'),'QA_AZ_REPO':fx['azure']['id'],'QA_AZ_PROJECT':fx['azure']['project'],'QA_OUT':f'{R}/evidence/item16-yaml-providers.json'}
p=subprocess.run(['node','node_modules/.bin/jest','--runInBand','libs/platform/application/use-cases/codeManagement/qa2576-yaml-providers.spec.ts'],cwd=f'{R}/'+sys.argv[1],env=env,capture_output=True,text=True)
out=p.stdout+p.stderr
for k in ['GITLAB_TOKEN','BITBUCKET_TOKEN','AZURE_REPOS_TOKEN','BITBUCKET_EMAIL']:
    v=qa.env(k); out=out.replace(v,'***') if v else out
print('\n'.join(l for l in out.splitlines() if any(x in l for x in ['Tests:','✕','●','Error','error']))[:3000])
