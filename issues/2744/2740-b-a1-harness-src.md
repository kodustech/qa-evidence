# A1 harness source

## build.js
```js
const esbuild = require('~/Projects/Kody/kodus-ai/node_modules/esbuild');
const path = require('path'); const fs = require('fs');
const [,, wt, out, mutant] = process.argv;
const realLogger = path.join(wt, 'libs/core/log/logger.ts');
const shim = fs.readFileSync(path.join(__dirname, 'logger-shim.ts'), 'utf8').replace('__REAL_LOGGER__', realLogger.replace(/\.ts$/, ''));
const shimPath = path.join(__dirname, `.shim-${path.basename(out)}.ts`); fs.writeFileSync(shimPath, shim);
const plugins = [{ name: 'logger', setup(b) {
  b.onResolve({ filter: /^@libs\/core\/log\/logger$|\/log\/logger$/ }, (a) => a.importer === shimPath ? undefined : { path: shimPath });
  if (mutant === 'no-filter-on-cut') b.onLoad({ filter: /native-tools\.factory\.ts$/ }, (a) => {
    let s = fs.readFileSync(a.path, 'utf8');
    const needle = "? withoutSecretFileLines(scanned)";
    if (!s.includes(needle)) throw new Error('mutant needle missing');
    // secret filter skipped when the answer was cut (unread > 0)
    return { contents: s.replace(needle, "? (unread > 0 ? scanned : withoutSecretFileLines(scanned))"), loader: 'ts' };
  });
}}];
esbuild.build({ entryPoints: [path.join(__dirname, 'entry.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: out, tsconfig: path.join(wt, 'tsconfig.json'), packages: 'external', plugins, logLevel: 'warning',
  nodePaths: [path.join(wt, 'node_modules')], absWorkingDir: wt,
}).then(() => console.log('built', out)).catch((e) => { console.error(e.message); process.exit(1); });
```
## entry.ts
```ts
export { buildNativeToolConfigs } from '@libs/agents/infrastructure/services/agents/native-tools.factory';
export { withoutSecretFileLines } from '@libs/common/utils/tool-output/secret-files';
```
## s31.js
```js
const { execSync } = require('child_process');
const [,, side, kase] = process.argv;
const bundle = require(`./${side}.js`);
const CASES = {
  headSecret: 'grep -rn . qa2744/config qa2744/grades qa2744/fixtures',
  secretAfter1M: 'grep -rn . qa2744/mid qa2744/config',
  secretAfter2M: 'grep -rn . qa2744/fixtures qa2744/config',
  smallGrep: 'grep -rn API_TOKEN .',
};
const CAP = 2_000_000;
const cmd = CASES[kase];
const full = execSync(cmd, { cwd: __dirname + '/repo', maxBuffer: 64 << 20 }).toString();
const truncated = full.length > CAP;
const stdout = truncated ? full.slice(0, CAP) : full;
const remote = { exec: async () => ({ stdout, stderr: '', exitCode: truncated ? -1 : 0, ...(truncated ? { truncated: true } : {}) }) };
(async () => {
  const tools = bundle.buildNativeToolConfigs(async () => ({ type: 'e2b', remoteCommands: remote }));
  const ex = tools.find((t) => t.name === 'exec');
  const t0 = performance.now();
  const out = await ex.execute({ command: cmd });
  const ms = performance.now() - t0;
  const s = String(out.stdout ?? '');
  const logs = (globalThis.__LOGS || []).filter((l) => /CONVERSATION-TOOLS|SLOW-SYNC/.test(l.message || ''));
  const res = { side, kase, cmd, producedChars: full.length, execReturnedChars: stdout.length, truncated,
    secretInExecStdout: stdout.includes('qa2744-fake-not-a-secret'), secretPosInExec: stdout.indexOf('qa2744-fake-not-a-secret'),
    agentChars: s.length, secretReachesAgent: s.includes('qa2744-fake-not-a-secret'), envLineReachesAgent: s.includes('.env.production'),
    cut: out.cut, guardMs: Math.round(ms), logs: logs.map((l) => ({ message: l.message, metadata: l.metadata })) };
  console.log(JSON.stringify(res));
})();
```
## s1.js
```js
const { monitorEventLoopDelay } = require('perf_hooks');
const [,, side, shape, mbStr, via] = process.argv;
const bundle = require(`./${side}.js`);
const MB = Number(mbStr);
function line(shape, n) {
  switch (shape) {
    case 'diffNoBoundary': return `+{"studentId": "stu", "classId": "cls", "present": true, "note": "attendance export record for the monthly report", "n": ${n}},`;
    case 'diffDates': return `+{"studentId": "stu-${n}", "date": "2026-0${n%9+1}-1${n%9}", "present": true, "note": "attendance export record ${n}"},`;
    case 'grepPath': return `services/school/attendance/exports/2026/batch-${n%500}/attendance-export-${n%97}.json:${n}:{"studentId": "stu", "present": true, "note": "record"}`;
    case 'grepLongDir': return `${'very/deep/module/path/'.repeat(40)}file-${n%97}.json:${n}:{"studentId":"stu","present":true}`;
    case 'svg': return `+    <path d="M10-20-30-40-50-60-70-80-90-100-110-120-130-140-150-160-170-180-190-200-${n}-1-2-3-4-5-6-7-8-9" fill="#fff"/>`;
    case 'svgLong': { let d=''; for (let i=0;d.length<8000;i++) d+='-'+(i%97)+'.5'; return `+    <path d="M0${d}" fill="#fff"/>`; }
    case 'numbersLong': { let d=''; for (let i=0;d.length<8000;i++) d+='-'+(i%9973); return `+[${d}-]`; }
    case 'timecodes': { let d=''; for (let i=0;d.length<6000;i++) d+=`00:${String(i%60).padStart(2,'0')}:${String(i%60).padStart(2,'0')},${n%1000} `; return `+${d}`; }
    case 'dotdot': { let d=''; for (let i=0;d.length<4000;i++) d+='../x'+(i%9)+'-'+i+'-'; return `+${d}`; }
    case 'gitLogHeader': return n % 4 === 0 ? `diff --git a/src/app/file${n}.ts b/src/app/file${n}.ts` : `+  const value${n} = computeTotal(rows, factor) / Math.max(1, rows.length);`;
  }
}
const parts = []; let size = 0, n = 0; const target = MB * 1e6;
while (size < target) { const l = line(shape, n++); parts.push(l); size += l.length + 1; }
let text = parts.join('\n'); parts.length = 0;
global.gc && global.gc();
const eld = monitorEventLoopDelay({ resolution: 20 }); eld.enable();
(async () => {
  await new Promise(r => setTimeout(r, 50));
  const t0 = performance.now(); let outLen;
  if (via === 'tool') {
    const remote = { exec: async () => ({ stdout: text, stderr: '', exitCode: 0 }) };
    const tools = bundle.buildNativeToolConfigs(async () => ({ type: 'e2b', remoteCommands: remote }));
    const r = await tools.find(t => t.name === 'exec').execute({ command: 'git log -p' });
    outLen = String(r.stdout).length;
  } else outLen = bundle.withoutSecretFileLines(text).length;
  const ms = performance.now() - t0;
  await new Promise(r => setTimeout(r, 50)); eld.disable();
  const slow = (globalThis.__LOGS || []).filter(l => /SLOW-SYNC/.test(l.message || '')).map(l => ({ message: l.message, metadata: l.metadata }));
  console.log(JSON.stringify({ side, shape, via: via || 'fn', chars: text.length, lines: n, ms: Math.round(ms), msPerMB: +(ms / (text.length / 1e6)).toFixed(2), eldMaxMs: Math.round(eld.max / 1e6), outLen, slow }));
})();
```
