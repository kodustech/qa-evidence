import os, random, subprocess, sys
random.seed(2744)
root = 'corpus'
def w(p, text):
    full = os.path.join(root, p); os.makedirs(os.path.dirname(full), exist_ok=True); open(full, 'w').write(text)
# S29: three ~50MB rg outputs, produced by real rg over real files
# SVG path data: boundary-dense '-N-' numbers
svg_lines = []
for i in range(60000):
    d = ''.join(f'{random.choice("MLC")}{random.randint(-999,999)}-{random.randint(1,999)}-{random.randint(1,99)}' for _ in range(60))
    svg_lines.append(f'<path fill="#abc" d="{d}"/>')
w('perf/svg/assets/icons/logo.svg', '\n'.join(svg_lines))
# timecode lines (subtitles)
tc = []
for i in range(700000):
    a = i*3; tc.append(f'{a//3600:02d}:{a//60%60:02d}:{a%60:02d}.000 --> {a//3600:02d}:{a//60%60:02d}:{(a+2)%60:02d}.500 line {i}')
w('perf/tc/media/captions/episode-01.vtt', '\n'.join(tc))
# ordinary TS
ts = []
for i in range(600000):
    ts.append(f'    const grade{i} = await this.gradeRepository.findOne({{ where: {{ classId, studentId: "s-{i}" }} }});')
w('perf/ts/src/grades/grade.service.ts', '\n'.join(ts))
# S30: secret-name corpus
names = ['.env', '.env.local', '.env.production', '.env.production.local.backup', '.ENV', '.Env.Test', '.env.example', '.env.sample', '.env.template', '.env.dist',
         'server.pem', 'SERVER.PEM', 'tls.key', 'api.KEY', 'cert.p12', 'cert.pfx', 'store.jks', 'release.keystore', 'release.KEYSTORE', 'my-very-long-certificate-name-for-prod.pem',
         'id_rsa', 'id_rsa.pub', 'ID_RSA', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'id_ed25519.pub', 'id_ed25519_backup_2026_old', 'id_rsa-cert.pub',
         'environment.ts', 'env.ts', 'keys.ts', 'monkey.ts', 'key.ts', 'pem.ts', 'my.env', 'x.pem.bak', 'x.keystore.old', 'notid_rsa', 'README.md', 'a.keystore-backup.ts', 'jks.json']
lines = []
for i in range(200000):
    depth = random.choice([0,1,2,3,8])
    seglen = random.choice([1,5,30,200,1000])
    dirs = [''.join(random.choice('abcxyz-_.0123456789') for _ in range(seglen)) for _ in range(depth)]
    sep = random.choice(['/', '/', '\\'])
    p = sep.join(dirs + [random.choice(names)])
    if random.random() < 0.2: p = './' + p
    if random.random() < 0.05: p = p + sep + '..' + sep + random.choice(names)
    kind = random.choice([':', '-', 'name'])
    content = random.choice(['API_TOKEN=fake', 'export const x = 1;', '-----BEGIN KEY-----', 'a:1:b-2-c', '12-34-56'])
    if kind == 'name': lines.append(p)
    elif kind == ':': lines.append(f'{p}:{random.randint(1,999)}:{content}')
    else: lines.append(f'{p}-{random.randint(1,999)}-{content}')
    if random.random() < 0.05: lines.append('--')
    if random.random() < 0.02: lines.append(f'[kodus-olimpo/codex-athena] {p}:{random.randint(1,99)}:{content}')
open('s30-corpus.txt','w').write('\n'.join(lines))
