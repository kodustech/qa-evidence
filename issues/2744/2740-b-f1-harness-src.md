# H1/H7 harness source (PR #2740 QA, slot b)

Bundles: esbuild of the real modules at merge `aeb08f11f` (merge.js), first parent `b172fdbac` (parent.js), and merge with `void handle.disconnect()` removed from `runCapped` (mutant.js). Logger replaced by a capture shim; everything else real.

## envd-server.js

```js
// Fake envd process service: the ONLY stubbed piece (the E2B sandbox server).
// Runs real commands locally via /bin/bash -l -c, streams their output to the
// client over a socket in ~64 KB chunks at a throttled rate, buffers up to
// AHEAD bytes ahead of the client (like envd + network buffers). kill(pid)
// SIGKILLs the process group but the already-buffered output keeps streaming
// (E2B: kill ends the process, not the stream). A client disconnect stops the
// stream and does NOT kill the process (SDK disconnect semantics).
const net = require('net');
const { spawn } = require('child_process');
const ROOT = process.env.SANDBOX_ROOT; // maps /home/user
const RATE = Number(process.env.RATE_BPS || 30 * 1024 * 1024);
const AHEAD = Number(process.env.AHEAD_BYTES || 30 * 1024 * 1024);
const CHUNK = 64 * 1024;
const procs = new Map();
function frame(type, payload) {
  const h = Buffer.alloc(5); h[0] = type; h.writeUInt32BE(payload.length, 1);
  return Buffer.concat([h, payload]);
}
const srv = net.createServer((sock) => {
  let buf = '';
  sock.once('data', (d) => {
    buf += d.toString();
    const msg = JSON.parse(buf.split('\n')[0]);
    if (msg.kill) {
      const p = procs.get(msg.kill);
      let ok = false;
      if (p && p.alive) { try { process.kill(-p.child.pid, 'SIGKILL'); ok = true; } catch {} }
      sock.end(JSON.stringify({ ok }) + '\n'); return;
    }
    if (msg.alive) {
      const p = procs.get(msg.alive);
      let alive = false;
      if (p) { try { process.kill(-p.child.pid, 0); alive = true; } catch {} }
      sock.end(JSON.stringify({ alive, sent: p ? p.sent : 0, produced: p ? p.produced : 0 }) + '\n'); return;
    }
    const cmd = msg.cmd.split('/home/user').join(ROOT);
    const child = spawn('/bin/bash', ['-c', cmd], { detached: true, cwd: ROOT, env: { ...process.env, PATH: `${process.env.EXTRA_PATH ? process.env.EXTRA_PATH + ":" : ""}${__dirname}/sbin:${process.env.PATH}` } });
    const st = { child, alive: true, queue: [], qbytes: 0, sent: 0, produced: 0, exit: null, closed: false };
    procs.set(child.pid, st);
    sock.write(frame(0, Buffer.from(String(child.pid))));
    const onData = (type) => (d) => {
      st.produced += d.length;
      for (let i = 0; i < d.length; i += CHUNK) { const c = d.subarray(i, i + CHUNK); st.queue.push([type, c]); st.qbytes += c.length; }
      if (st.qbytes > AHEAD) { child.stdout.pause(); child.stderr.pause(); }
    };
    child.stdout.on('data', onData(1)); child.stderr.on('data', onData(2));
    child.on('exit', (code, sig) => { st.alive = false; st.exit = code ?? -1; st.sig = sig; });
    sock.on('close', () => { st.closed = true; });
    sock.on('error', () => { st.closed = true; });
    const tickMs = 10; const perTick = Math.max(CHUNK, Math.floor(RATE * tickMs / 1000));
    const pump = () => {
      if (st.closed) return; // disconnected: stop streaming, process untouched
      let budget = perTick;
      while (budget > 0 && st.queue.length) {
        const [t, c] = st.queue.shift(); st.qbytes -= c.length; budget -= c.length; st.sent += c.length;
        sock.write(frame(t, c));
      }
      if (st.qbytes < AHEAD / 2) { child.stdout.resume(); child.stderr.resume(); }
      // end only after the process exited AND its pipes closed AND the queue drained
      if (!st.alive && st.queue.length === 0 && child.stdout.readableEnded !== false && st.pipesClosed) {
        sock.end(frame(3, Buffer.from(JSON.stringify({ exitCode: st.exit, error: st.sig ? 'signal: killed' : undefined }))));
        return;
      }
      setTimeout(pump, tickMs);
    };
    let ended = 0; const pc = () => { if (++ended === 2) st.pipesClosed = true; };
    child.stdout.on('close', pc); child.stderr.on('close', pc);
    pump();
  });
});
srv.listen(process.env.SOCK, () => console.log('envd-stub ready'));
const PP = process.ppid; setInterval(() => { try { process.kill(PP, 0); } catch { process.exit(0); } }, 500).unref();

```

## fake-sandbox.js

```js
// Client half: the REAL e2b SDK CommandHandle (patched out of the SDK bundle,
// same module instance the Kodus code imports), fed by an events iterable that
// mirrors envd's Process.Start server stream. Only the transport is fake.
const Module = require('module');
const fs = require('fs');
const net = require('net');
const path = require('path');
function loadPatchedE2B(fromDir) {
  const req = Module.createRequire(path.join(fromDir, 'x.js'));
  const p = req.resolve('e2b');
  if (require.cache[p] && require.cache[p].exports.__CommandHandle) return require.cache[p].exports;
  const src = fs.readFileSync(p, 'utf8') + '\nmodule.exports.__CommandHandle = CommandHandle;\n';
  const m = new Module(p, null); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
  m._compile(src, p); m.loaded = true; require.cache[p] = m;
  return m.exports;
}
function makeSandbox(sockPath, fromDir) {
  const e2b = loadPatchedE2B(fromDir);
  const CommandHandle = e2b.__CommandHandle;
  const req = Module.createRequire(require.resolve('e2b', { paths: [fromDir] }));
  const { ConnectError, Code } = req('@connectrpc/connect');
  const stats = { runs: 0, kills: 0, disconnects: 0, callbackChars: 0 };
  const rpcKill = (pid) => new Promise((res) => {
    const s = net.connect(sockPath, () => s.write(JSON.stringify({ kill: pid }) + '\n'));
    let b = ''; s.on('data', (d) => (b += d)); s.on('end', () => res(JSON.parse(b).ok));
  });
  const alive = (pid) => new Promise((res) => {
    const s = net.connect(sockPath, () => s.write(JSON.stringify({ alive: pid }) + '\n'));
    let b = ''; s.on('data', (d) => (b += d)); s.on('end', () => res(JSON.parse(b)));
  });
  function events(cmd, signal) {
    // async iterable of envd ProcessEvent-shaped messages
    const sock = net.connect(sockPath, () => sock.write(JSON.stringify({ cmd }) + '\n'));
    const q = []; let waiting = null; let done = false; let err = null; let pending = Buffer.alloc(0);
    const push = (v) => { if (waiting) { const w = waiting; waiting = null; w.res(v); } else q.push(v); };
    const fail = (e) => { err = e; if (waiting) { const w = waiting; waiting = null; w.rej(e); } };
    sock.on('data', (d) => {
      pending = pending.length ? Buffer.concat([pending, d]) : d;
      while (pending.length >= 5) {
        const t = pending[0]; const n = pending.readUInt32BE(1);
        if (pending.length < 5 + n) break;
        const payload = pending.subarray(5, 5 + n); pending = pending.subarray(5 + n);
        if (t === 0) push({ event: { event: { case: 'start', value: { pid: Number(payload.toString()) } } } });
        else if (t === 1 || t === 2) push({ event: { event: { case: 'data', value: { output: { case: t === 1 ? 'stdout' : 'stderr', value: new Uint8Array(payload) } } } } });
        else if (t === 3) { const v = JSON.parse(payload.toString()); push({ event: { event: { case: 'end', value: v } } }); done = true; }
      }
    });
    sock.on('end', () => { done = true; if (waiting) { const w = waiting; waiting = null; w.res(undefined); } });
    signal.addEventListener('abort', () => { stats.disconnects++; sock.destroy(); fail(new ConnectError('the operation was aborted', Code.Canceled)); }, { once: true });
    return {
      [Symbol.asyncIterator]() { return this; },
      next() {
        if (q.length) { const v = q.shift(); return Promise.resolve(v === undefined ? { done: true, value: undefined } : { done: false, value: v }); }
        if (err) return Promise.reject(err);
        if (done) return Promise.resolve({ done: true, value: undefined });
        return new Promise((res, rej) => { waiting = { res: (v) => res(v === undefined ? { done: true, value: undefined } : { done: false, value: v }), rej }; });
      },
      return() { sock.destroy(); return Promise.resolve({ done: true, value: undefined }); },
    };
  }
  async function start(cmd, opts = {}) {
    stats.runs++;
    const controller = new AbortController();
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; controller.abort(); };
    const ev = events(cmd, controller.signal);
    const first = await ev.next();
    const pid = first.value.event.event.value.pid;
    const onStdout = opts.onStdout ? (d) => { stats.callbackChars += d.length; return opts.onStdout(d); } : undefined;
    const onStderr = opts.onStderr ? (d) => { stats.callbackChars += d.length; return opts.onStderr(d); } : undefined;
    const h = new CommandHandle(pid, cleanup, () => { stats.kills++; return rpcKill(pid); }, ev, onStdout, onStderr, undefined, undefined, undefined, async () => true);
    h.__pid = pid; stats.lastPid = pid; stats.lastHandle = h;
    return h;
  }
  const sandbox = {
    sandboxId: 'local-envd-stub',
    commands: {
      // exactly the SDK's Commands.run
      async run(cmd, opts) { const proc = await start(cmd, opts); return opts && opts.background ? proc : proc.wait(); },
    },
  };
  return { sandbox, stats, alive, e2b };
}
module.exports = { makeSandbox, loadPatchedE2B };

```

## run-h1.js

```js
const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');
const [,, side, kase, rateArg] = process.argv;
const COMMANDS = {
  gitshow: 'git show 52e07d5009902685627b94f8797c0ffd58b31d27',
  seq: 'seq 1 60000000',
  oneline: 'cat oneline/one.txt',
  emoji: 'cat emoji/edge.txt',
  envtoken: 'API_TOKEN=abc123 seq 1 3000000',
  small: 'git log --oneline -1',
};
const SOCK = `/tmp/envd-f1-${process.pid}.sock`;
const ROOT = path.join(__dirname, 'sbx');
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'envd-server.js')], { env: { ...process.env, SOCK, SANDBOX_ROOT: ROOT, RATE_BPS: String(rateArg ? Number(rateArg) : 30 * 1024 * 1024) }, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const bundle = require(path.join(__dirname, `${side}.js`));
  const { makeSandbox } = require('./fake-sandbox');
  const { sandbox, stats, alive } = makeSandbox(SOCK, __dirname);
  // record when the streamed chars first pass 2M (cap) — instrument via a run wrapper
  const origRun = sandbox.commands.run;
  let capAt = null;
  sandbox.commands.run = (cmd, opts = {}) => {
    const wrap = (fn) => fn && ((d) => { const r = fn(d); if (capAt === null && stats.callbackChars > 2_000_000) capAt = performance.now(); return r; });
    return origRun(cmd, { ...opts, onStdout: wrap(opts.onStdout), onStderr: wrap(opts.onStderr) });
  };
  const L = (globalThis.__LOGS = globalThis.__LOGS || []);
  const mk = (lvl) => (a) => L.push({ level: lvl, logger: 'SandboxLeaseManager(param)', ...a });
  const svcLogger = { log: mk('info'), info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug') };
  const remote = bundle.buildE2BRemoteCommands(sandbox, { logger: svcLogger, logContext: 'SandboxLeaseManager', logMetadata: { organizationId: 'org-harness', prKey: 'harness#1' } });
  let raw = null;
  const origExec = remote.exec;
  remote.exec = async (c) => { const r = await origExec(c); if (!raw) raw = { stdoutLen: r.stdout.length, stderrLen: (r.stderr || '').length, exitCode: r.exitCode, truncated: r.truncated, stdoutUtf8RoundTrip: Buffer.from(r.stdout).toString() === r.stdout, lastCharCode: r.stdout.length ? r.stdout.charCodeAt(r.stdout.length - 1).toString(16) : null }; return r; };
  const tools = bundle.buildNativeToolConfigs(async () => ({ type: 'e2b', remoteCommands: remote }));
  const execTool = tools.find((t) => t.name === 'exec');
  global.gc(); global.gc();
  const base = process.memoryUsage();
  let peak = { heapUsed: base.heapUsed, rss: base.rss, external: base.external, arrayBuffers: base.arrayBuffers };
  const sampler = setInterval(() => { const m = process.memoryUsage(); for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], m[k]); }, 100);
  const eld = monitorEventLoopDelay({ resolution: 10 }); eld.enable();
  // independent long-gap detector (catches a block the histogram attributes to one sample)
  let lastTick = performance.now(), maxGap = 0;
  const ticker = setInterval(() => { const n = performance.now(); maxGap = Math.max(maxGap, n - lastTick - 50); lastTick = n; }, 50);
  const t0 = performance.now();
  let out, err;
  try { out = await execTool.execute({ command: COMMANDS[kase] }); } catch (e) { err = String(e && e.stack || e); }
  const t1 = performance.now();
  await new Promise((r) => setTimeout(r, 120));
  eld.disable(); clearInterval(sampler); clearInterval(ticker);
  const pid = stats.lastPid;
  await new Promise((r) => setTimeout(r, 300));
  const procState = await alive(pid);
  const e0 = performance.now();
  const echo = await execTool.execute({ command: 'echo ok' });
  const e1 = performance.now();
  // keep watching what still arrives on the stopped handle's callbacks for 3 s
  const cbAtAnswer = stats.callbackCharsAtAnswer = stats.callbackChars;
  await new Promise((r) => setTimeout(r, 3000));
  const procState2 = await alive(pid);
  const result = {
    side, case: kase, command: COMMANDS[kase].replace('52e07d5009902685627b94f8797c0ffd58b31d27', '<C_big>'),
    wallMs: Math.round(t1 - t0), capToAnswerMs: capAt ? Math.round(t1 - capAt) : null,
    eventLoopDelayMaxMs: Math.round(eld.max / 1e6), maxTimerGapMs: Math.round(maxGap),
    heapUsedPeakDeltaMb: Math.round((peak.heapUsed - base.heapUsed) / 1048576), rssPeakDeltaMb: Math.round((peak.rss - base.rss) / 1048576), externalPeakDeltaMb: Math.round((peak.external - base.external) / 1048576),
    rawExec: raw, toolAnswer: out ? { stdoutLen: typeof out.stdout === 'string' ? out.stdout.length : null, stdoutUtf8RoundTrip: typeof out.stdout === 'string' ? Buffer.from(out.stdout).toString() === out.stdout : null, lastStdoutLine: typeof out.stdout === 'string' ? out.stdout.trimEnd().split('\n').pop().slice(0, 120) : null, cut: out.cut, keys: Object.keys(out), error: out.error } : null,
    error: err,
    callbackCharsReceived: stats.callbackChars, kills: stats.kills, disconnects: stats.disconnects,
    sandboxProcessAfterAnswer: procState, sandboxProcessAfter3s: procState2,
    followupEchoMs: Math.round(e1 - e0), followupEchoStdout: echo && echo.stdout,
    logs: L.filter((l) => /SANDBOX-EXEC|CONVERSATION-TOOLS|SLOW-SYNC/.test(l.message || '')).map((l) => ({ level: l.level, message: l.message, context: l.context, metadata: l.metadata })),
  };
  fs.writeFileSync(path.join(__dirname, 'results', `h1-${side}-${kase}${rateArg ? '-r' + rateArg : ''}.json`), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
  srv.kill('SIGKILL');
  try { process.kill(-pid, 'SIGKILL'); } catch {}
  process.exit(0);
})();

```

## run-h7.js

```js
const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
const [,, side, extraPath] = process.argv;
const SOCK = `/tmp/envd-f1h7-${process.pid}.sock`;
const ROOT = path.join(__dirname, 'sbx');
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'envd-server.js')], { env: { ...process.env, SOCK, SANDBOX_ROOT: ROOT, SG_MATCHES: '12000', ...(extraPath ? { EXTRA_PATH: path.join(__dirname, extraPath) } : {}) }, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const bundle = require(path.join(__dirname, `${side}.js`));
  const { makeSandbox } = require('./fake-sandbox');
  const { sandbox } = makeSandbox(SOCK, __dirname);
  const L = (globalThis.__LOGS = globalThis.__LOGS || []);
  const lg = (lvl) => (a) => L.push({ level: lvl, ...a });
  const remote = bundle.buildE2BRemoteCommands(sandbox, { logger: { log: lg('info'), warn: lg('warn'), error: lg('error'), debug: lg('debug') }, logContext: 'SandboxLeaseManager', logMetadata: { organizationId: 'org-harness' } });
  const calls = [];
  for (const k of ['exec', 'grep', 'listDir', 'read']) { const o = remote[k]; if (typeof o !== 'function') continue; remote[k] = async (...a) => { const r = await o(...a); calls.push({ fn: k, arg: String(a[0]).replace(/qaNeedle/g, 'qaNeedle').slice(0, 140), ...(k === 'exec' ? { stdoutLen: r.stdout.length, stderrLen: (r.stderr || '').length, exitCode: r.exitCode, truncated: r.truncated } : { resultLen: typeof r === 'string' ? r.length : null }) }); return r; }; }
  const linked = { list: () => [{ repository: 'kodus-olimpo/linked-lib' }], ensureCloned: async (repo) => ({ ok: true, rootPath: '/home/user/_linked/kodus-olimpo/linked-lib', repository: 'kodus-olimpo/linked-lib' }) };
  const tools = bundle.buildAgentTools(remote, undefined, 'kodus-olimpo/codex-athena', undefined, undefined, undefined, linked, []);
  const ast = bundle.buildAstGrepTool({ exec: remote.exec, writeFile: async () => {}, changedFiles: [], removeDir: async () => {} });
  const cases = extraPath ? [
    ['findFile(*.test.ts, many) fd missing', () => tools.findFile.execute({ pattern: '*.test.ts', path: 'many' })],
  ] : [
    ['grep qaNeedle big3m (3M-char matching file)', () => tools.grep.execute({ pattern: 'qaNeedle', path: 'big3m' })],
    ['grep qaNeedle big3m namesOnly', () => tools.grep.execute({ pattern: 'qaNeedle', path: 'big3m', namesOnly: true })],
    ['grep qaNeedle keysonly (secret-only head)', () => tools.grep.execute({ pattern: 'qaNeedle', path: 'keysonly' })],
    ['grep qaNeedle perm (stderr flood, empty stdout)', () => tools.grep.execute({ pattern: 'qaNeedle', path: 'perm' })],
    ['findFile(*.test.ts, many) with fd', () => tools.findFile.execute({ pattern: '*.test.ts', path: 'many' })],
    ['linked grep qaNeedle big3m', () => tools.grep.execute({ pattern: 'qaNeedle', path: 'big3m', repo: 'kodus-olimpo/linked-lib' })],
    ['linked listDir many depth 4 (40k files)', () => tools.listDir.execute({ path: 'many', maxDepth: 4, repo: 'kodus-olimpo/linked-lib' })],
    ['astGrep pattern (5.3M chars of --json=stream)', async () => (await ast.execute({ pattern: 'this.repo.save($A)', language: 'typescript' })).output],
  ];
  const out = [];
  for (const [name, fn] of cases) {
    calls.length = 0; const t0 = performance.now();
    let ans; try { ans = await fn(); } catch (e) { ans = 'THREW: ' + e.message; }
    const s = String(ans);
    out.push({ case: name, ms: Math.round(performance.now() - t0), answerLen: s.length, answerHead: s.slice(0, 160), answerTail: s.slice(-230), utf8ok: Buffer.from(s).toString() === s, calls: calls.slice() });
  }
  const res = { side, extraPath: extraPath || null, out, logs: L.filter((l) => /SANDBOX-EXEC/.test(l.message || '')).length };
  fs.writeFileSync(path.join(__dirname, 'results', `h7-${side}${extraPath ? '-nofd' : ''}.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1).slice(0, 12000));
  srv.kill('SIGKILL'); process.exit(0);
})();

```

## build.js

```js
const esbuild = require('<local>/kodus-ai/node_modules/esbuild');
const path = require('path'); const fs = require('fs');
const [,, wt, out, mutant] = process.argv;
const realLogger = path.join(wt, 'libs/core/log/logger.ts');
const shim = fs.readFileSync(path.join(__dirname, 'logger-shim.ts'), 'utf8').replace('__REAL_LOGGER__', realLogger.replace(/\.ts$/, ''));
const shimPath = path.join(__dirname, `.shim-${path.basename(out)}.ts`); fs.writeFileSync(shimPath, shim);
const plugins = [{ name: 'logger', setup(b) {
  b.onResolve({ filter: /^@libs\/core\/log\/logger$|\/log\/logger$/ }, (a) => a.importer === shimPath ? undefined : { path: shimPath });
  if (mutant === 'no-disconnect') b.onLoad({ filter: /e2b-sandbox\.service\.ts$/ }, (a) => {
    let s = fs.readFileSync(a.path, 'utf8');
    const needle = 'void handle.disconnect().catch(() => undefined);';
    if (!s.includes(needle)) throw new Error('mutant needle missing');
    return { contents: s.replace(needle, '/* MUTANT: disconnect removed */'), loader: 'ts' };
  });
}}];
esbuild.build({ entryPoints: [path.join(__dirname, 'entry.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: out, tsconfig: path.join(wt, 'tsconfig.json'), packages: 'external', plugins, logLevel: 'warning',
  nodePaths: [path.join(wt, 'node_modules')], absWorkingDir: wt,
}).then(() => console.log('built', out)).catch((e) => { console.error(e.message); process.exit(1); });

```

## logger-shim.ts

```js
export * from '__REAL_LOGGER__';
const g: any = globalThis as any;
g.__LOGS = g.__LOGS || [];
export function createLogger(name: string): any {
    const mk = (level: string) => (arg: any, ...rest: any[]) => {
        g.__LOGS.push({ level, logger: name, ...(typeof arg === 'object' ? arg : { message: String(arg) }) });
    };
    return { log: mk('info'), info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug'), verbose: mk('debug'), child: () => createLogger(name) };
}

```

## entry.ts

```js
export { buildE2BRemoteCommands } from '@libs/sandbox/infrastructure/providers/e2b-sandbox.service';
export { buildNativeToolConfigs } from '@libs/agents/infrastructure/services/agents/native-tools.factory';
export { buildAgentTools } from '@libs/code-review/infrastructure/agents/engine/agent-tools.factory';
export { buildAstGrepTool } from '@libs/code-review/infrastructure/agents/adapters/ast-grep.tool';

```

## sbin/ast-grep

```js
#!/usr/bin/env node
// Shape-only stand-in for `ast-grep run --json=stream` (no ast-grep binary on this machine).
const n = Number(process.env.SG_MATCHES || 12000);
let out = [];
for (let i = 0; i < n; i++) {
  out.push(JSON.stringify({ text: `this.repo.save(grade${i})`, range: { byteOffset: { start: i * 40, end: i * 40 + 24 }, start: { line: i, column: 4 }, end: { line: i, column: 28 } }, file: `src/generated/grades_${i % 300}.service.ts`, lines: `    this.repo.save(grade${i}); // ${'pad'.repeat(40)}`, language: 'TypeScript', metaVariables: { single: {}, multi: {}, transformed: {} } }));
  if (out.length === 500) { process.stdout.write(out.join('\n') + '\n'); out = []; }
}
process.stdout.write(out.join('\n') + (out.length ? '\n' : ''));

```

## gen.js

```js
const fs = require('fs'); const path = require('path');
const R = path.join(__dirname, 'sbx/repo');
const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(R, p)), { recursive: true }); fs.writeFileSync(path.join(R, p), s); };
w('src/grades.service.ts', 'export class GradesService {\n  save(g: number) { return g; }\n}\n');
w('src/attendance.ts', 'export const attendance = [];\n');
// 3M chars of matching lines
w('big3m/match.ts', 'const qaNeedle = 1; // x\n'.repeat(120000));
// secret-only matches
w('keysonly/server.key', 'qaNeedle-----BEGIN KEY-----\n'.repeat(110000));
// 5M chars single line
w('oneline/one.txt', 'x'.repeat(5_000_000));
// high surrogate exactly at unit 2,000,000 of exec stdout (cat prints file as is)
w('emoji/edge.txt', 'a'.repeat(1_999_999) + '\u{1F600}' + 'b'.repeat(500_000));
// 50k files for find walk / linked listDir
for (let i = 0; i < 50000; i++) { const d = `many/d${String(i % 50).padStart(2, '0')}`; w(`${d}/attendance_report_component_long_name_${String(i).padStart(5, '0')}.test.ts`, ''); }
console.log('small done');

```
