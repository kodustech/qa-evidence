import { build, graphKey, cloneParams, doc, note, done, sleep, e2bState, providerCtl, logs, transcript, ORG_A, ORG_B, REPO, REV, ts } from './lib';
import { pgDs, memRepos, cliTransport, buildGraphStack, canon } from './graph';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures.json', 'utf8'));
const out: any = { rev: REV, scenario: process.argv[2], results: {} };
const R = (k: string, v: any) => { out.results[k] = v; note('RESULT ' + k, { v }); };
const leaseLogs = () => logs.filter((l) => /SandboxLease|SANDBOX-|AST-GRAPH/.test(l.message + l.component)).map((l) => `${l.t} ${l.level} ${l.message.slice(0, 200)}${l.err ? ' | err=' + l.err.slice(0, 120) : ''}`);
const dbn = (s: string) => `h2626_${s}_${REV}_${Date.now() % 100000}`;

function spyRelease(mgr: any) {
    const calls: any[] = [];
    const orig = mgr.release.bind(mgr);
    mgr.release = async (id: string, opts?: any) => { calls.push({ t: ts(), id, opts: opts ?? null }); note('mgr.release', { id, opts: opts ?? null }); return orig(id, opts); };
    return calls;
}
async function newJob(mem: any, type: 'full' | 'incr', repoId: string, extra: any = {}) {
    const id = randomUUID();
    const payload = type === 'full'
        ? { repositoryId: repoId, cloneUrl: 'x', defaultBranch: 'main', fullName: 'org/athena', platform: 'github', organizationAndTeamData: { organizationId: ORG_A, teamId: 't' }, ...extra }
        : { repositoryId: repoId, cloneUrl: 'x', defaultBranch: 'main', fullName: 'org/athena', platform: 'github', newSha: 'beef', changedFiles: FX.changed, organizationAndTeamData: { organizationId: ORG_A, teamId: 't' }, ...extra };
    mem.jobs.set(id, { id, payload, correlationId: 'c', metadata: {} });
    return id;
}
const keyOf = (repoId: string, jobId: string) => `${ORG_A}:${repoId}:graph:${jobId}`;

const scenarios: Record<string, () => Promise<void>> = {
    // M5(b): GraphIndexerService full/incremental at F and I through the real processors, canonical hashes
    async m5b() {
        const { mgr } = await build(dbn('m5b'));
        const ds = await pgDs();
        const repoId = randomUUID();
        const mem = memRepos(repoId, 'pending');
        const g = await buildGraphStack(ds, mem, mgr);
        let graph: any = FX.F;
        providerCtl.run = cliTransport({ graph: () => graph });
        providerCtl.readFile = async () => JSON.stringify(graph);
        await g.full.process(await newJob(mem, 'full', repoId));
        R('full@F', (({ rows, ...x }) => x)(await canon(ds, repoId)));
        graph = FX.I_parse;
        await g.incr.process(await newJob(mem, 'incr', repoId));
        R('incr@I', (({ rows, ...x }) => x)(await canon(ds, repoId)));
        const repo2 = randomUUID(); const mem2 = memRepos(repo2, 'pending'); const g2 = await buildGraphStack(ds, mem2, mgr);
        graph = FX.I_full;
        await g2.full.process(await newJob(mem2, 'full', repo2));
        R('full@I', (({ rows, ...x }) => x)(await canon(ds, repo2)));
        // Azure-shaped changedFiles (leading slash), X1
        const repo3 = randomUUID(); const mem3 = memRepos(repo3, 'pending'); const g3 = await buildGraphStack(ds, mem3, mgr);
        graph = FX.F; await g3.full.process(await newJob(mem3, 'full', repo3));
        graph = { nodes: FX.I_parse.nodes, edges: FX.I_parse.edges };
        await g3.incr.process(await newJob(mem3, 'incr', repo3, { changedFiles: FX.changed.map((f: string) => '/' + f) }));
        const c3 = await canon(ds, repo3);
        R('incr@I azure-paths', { ...(({ rows, ...x }) => x)(c3), status: mem3.repoState.astGraphStatus, sha: mem3.repoState.sha, hasTotalTuition: c3.rows.n.some((n: any) => n.qualified_name.endsWith('totalTuition')), hasArchive: c3.rows.n.some((n: any) => n.qualified_name.endsWith('archiveStudent')) });
        await ds.destroy();
    },

    // M9: post-acquire failures in both processors
    async m9() {
        const { mgr, model } = await build(dbn('m9'));
        const ds = await pgDs();
        const cases: any[] = [
            ['full', { failParse: 'kodus-graph parse failed: unexpected token' }],
            ['full', { failParse: '503 sandbox unavailable' }],
            ['full', { blankHead: true }],
            ['incr', { failParse: 'kodus-graph parse failed: unexpected token' }],
            ['incr', { failParse: '503 sandbox unavailable' }],
        ];
        for (const [type, ctl] of cases) {
            const repoId = randomUUID();
            const mem = memRepos(repoId, type === 'incr' ? 'ready' : 'pending');
            const g = await buildGraphStack(ds, mem, mgr);
            const rel = spyRelease(mgr);
            e2bState.calls.length = 0;
            providerCtl.run = cliTransport({ graph: () => FX.F, ...ctl });
            providerCtl.readFile = async () => JSON.stringify(FX.F);
            const jobId = await newJob(mem, type, repoId);
            let thrown: any = null;
            try { await (type === 'full' ? g.full : g.incr).process(jobId); } catch (e: any) { thrown = e.message; }
            await sleep(200);
            const key = keyOf(repoId, jobId);
            R(`${type} ${JSON.stringify(ctl)}`, {
                thrownToConsumer: thrown, jobStatus: mem.jobs.get(jobId).status, errClass: mem.jobs.get(jobId).errorClassification,
                repoStatus: mem.repoState.astGraphStatus, releaseCalls: rel.map((c) => c.opts), killCalls: e2bState.calls.filter((c) => c.op === 'kill').length,
                setTimeoutCalls: e2bState.calls.filter((c) => c.op === 'setTimeout').map((c) => c.ms), leaseDoc: await doc(model, key),
            });
            mgr.release = Object.getPrototypeOf(mgr).release.bind(mgr);
        }
        await ds.destroy();
    },

    // M10: immediate kill rejects with canary text; cron fails once more; acquire on same key waits; cron recovers
    async m10() {
        process.env.CANARY_ERR = 'qa2626-provider-canary 502 upstream (api_key=<fake-canary-key>)';
        const { mgr, model, reaper, repo } = await build(dbn('m10'));
        const ds = await pgDs();
        const repoId = randomUUID();
        const mem = memRepos(repoId, 'pending');
        const g = await buildGraphStack(ds, mem, mgr);
        providerCtl.run = cliTransport({ graph: () => FX.F });
        providerCtl.readFile = async () => JSON.stringify(FX.F);
        const jobId = await newJob(mem, 'full', repoId);
        const key = keyOf(repoId, jobId);
        e2bState.kill = ['fail'];
        await g.full.process(jobId);
        const d1 = await doc(model, key);
        R('after release (kill failed)', { doc: d1, jobStatus: mem.jobs.get(jobId).status, repoStatus: mem.repoState.astGraphStatus });
        const raw = await model.findById(key).lean();
        R('canary persisted in lease doc?', JSON.stringify(raw).includes('canary'));
        // acquire on same key (a RabbitMQ retry with the same jobId would use this key)
        const t0 = Date.now();
        const bP = mgr.acquire(key, 'graph-build', 7200000, cloneParams).then((r: any) => { note('B acquired', { sandboxId: r.sandboxId, waitedMs: Date.now() - t0 }); return r; });
        await sleep(1500);
        R('while B waits', { doc: await doc(model, key) });
        e2bState.kill = ['fail'];
        await reaper.killIdleSandboxes();
        R('after cron tick 1 (kill fails again)', { doc: await doc(model, key) });
        e2bState.kill = ['ok'];
        await reaper.killIdleSandboxes();
        R('after cron tick 2 (kill ok)', { doc: await doc(model, key) });
        const b = await bP;
        R('B result', { sandboxId: b.sandboxId, oldSandbox: d1?.sandboxId, fresh: b.sandboxId !== d1?.sandboxId, doc: await doc(model, key) });
        await mgr.release(b.leaseId, { idleMs: 0 });
        R('after B release', { doc: await doc(model, key), killCalls: e2bState.calls.filter((c) => c.op === 'kill').map((c) => c.id) });
        await ds.destroy();
    },

    // M12: kill ok but completeCleanup throws once; and kill returns already-gone (SDK false)
    async m12() {
        const { mgr, model, reaper, repo } = await build(dbn('m12'));
        // (a)
        const k1 = graphKey();
        const a = await mgr.acquire(k1, 'graph-build', 7200000, cloneParams);
        const orig = repo.completeCleanup.bind(repo);
        let once = true;
        (repo as any).completeCleanup = async (...args: any[]) => { if (once) { once = false; note('completeCleanup throws (injected Mongo error)'); throw new Error('MongoNetworkError: connection reset'); } return orig(...args); };
        await mgr.release(a.leaseId, { idleMs: 0 });
        R('(a) after release', { doc: await doc(model, k1), alive: e2bState.alive.get(a.sandboxId) });
        e2bState.kill = ['gone'];
        await reaper.killIdleSandboxes();
        R('(a) after cron', { doc: await doc(model, k1) });
        // (b)
        const k2 = graphKey();
        const b = await mgr.acquire(k2, 'graph-build', 7200000, cloneParams);
        e2bState.kill = ['gone'];
        await mgr.release(b.leaseId, { idleMs: 0 });
        R('(b) kill returns false (404)', { doc: await doc(model, k2) });
        // (c) kill throws a not-found error
        const k3 = graphKey();
        const c = await mgr.acquire(k3, 'graph-build', 7200000, cloneParams);
        e2bState.kill = ['gone-throw'];
        await mgr.release(c.leaseId, { idleMs: 0 });
        R('(c) kill throws not-found: after release', { doc: await doc(model, k3) });
        await reaper.killIdleSandboxes();
        R('(c) after cron (kill gone false)', { doc: await doc(model, k3) });
    },
    // M13: Mongo failures at decrement / claim / committed claim with client error
    async m13() {
        const ds = await pgDs();
        for (const mode of ['decrement', 'claim', 'claim-committed']) {
            const { mgr, model, reaper, repo } = await build(dbn('m13' + mode));
            const repoId = randomUUID(); const mem = memRepos(repoId, 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            providerCtl.run = cliTransport({ graph: () => FX.F }); providerCtl.readFile = async () => JSON.stringify(FX.F);
            const m = mode === 'decrement' ? 'decrementLease' : 'claimCleanup';
            const orig = (repo as any)[m].bind(repo); let once = true;
            (repo as any)[m] = async (...a: any[]) => {
                if (once) { once = false;
                    if (mode === 'claim-committed') { const r = await orig(...a); note('injected: write committed, client sees error', { m }); throw new Error('MongoNetworkError: connection closed after write'); }
                    note('injected: transport error before write', { m }); throw new Error('MongoNetworkError: connection reset'); }
                return orig(...a);
            };
            e2bState.calls.length = 0;
            const jobId = await newJob(mem, 'full', repoId); const key = keyOf(repoId, jobId);
            await g.full.process(jobId);
            const d1 = await doc(model, key);
            const sandboxId = mem.jobs.get(jobId).metadata.sandboxId;
            await reaper.killIdleSandboxes();
            const d2 = await doc(model, key);
            await model.updateOne({ _id: key }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
            await reaper.reapExpiredLeases();
            const d3 = await doc(model, key);
            R(mode, { job: mem.jobs.get(jobId).status, afterRelease: d1, killsAfterRelease: e2bState.calls.filter((c) => c.op === 'kill').length, afterIdleCron: d2, afterTTLreaper: d3, sandboxState: e2bState.alive.get(sandboxId),
                warn: logs.filter((l) => /cleanup failed|immediate kill/.test(l.message)).map((l) => `${l.level} ${l.message.slice(0, 80)}`), killedLog: logs.some((l) => /killed single-use/.test(l.message) && l.message.includes(key)) });
            const mg = require('mongoose'); await mg.disconnect();
        }
        await ds.destroy();
    },

    // M15: abort during parse after acquire; inner work then finishes
    async m15() {
        const { mgr, model } = await build(dbn('m15'));
        const ds = await pgDs();
        const unhandled: any[] = []; process.on('unhandledRejection', (e: any) => { unhandled.push(String(e?.message || e)); note('UNHANDLED REJECTION', { e: String(e?.message || e) }); });
        for (const type of ['full', 'incr']) {
            const repoId = randomUUID(); const mem = memRepos(repoId, type === 'incr' ? 'ready' : 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            if (type === 'incr') { await g.astRepo.fullRebuild(repoId, FX.F.nodes, FX.F.edges); }
            const before = await canon(ds, repoId);
            providerCtl.run = cliTransport({ graph: () => (type === 'full' ? FX.F : FX.I_parse), parseDelayMs: 3000 });
            providerCtl.readFile = async () => JSON.stringify(type === 'full' ? FX.F : FX.I_parse);
            e2bState.calls.length = 0;
            const jobId = await newJob(mem, type as any, repoId); const key = keyOf(repoId, jobId);
            const ac = new AbortController();
            setTimeout(() => { note('ABORT', { type }); ac.abort(new Error('job timeout')); }, 1000);
            let thrown: any = null; const t0 = Date.now();
            try { await (type === 'full' ? g.full : g.incr).process(jobId, ac.signal); } catch (e: any) { thrown = e.message; }
            const tProc = Date.now() - t0;
            const atReturn = { job: mem.jobs.get(jobId).status, repo: mem.repoState.astGraphStatus, lease: await doc(model, key), kills: e2bState.calls.filter((c) => c.op === 'kill').map((c) => c.t) };
            await sleep(5000);
            const after = await canon(ds, repoId);
            R(type, { thrown, processReturnedAfterMs: tProc, atReturn, after5s: { job: mem.jobs.get(jobId).status, jobHistory: mem.jobs.get(jobId).history, repo: mem.repoState.astGraphStatus, repoHistory: mem.repoState.history, lease: await doc(model, key) },
                graphChangedByDeadAttempt: before.nh !== after.nh || before.eh !== after.eh, before: (({ rows, ...x }) => x)(before), after: (({ rows, ...x }) => x)(after), unhandled: [...unhandled],
                deadSandboxOps: transcript.filter((t) => /on-dead/.test(t.kind)).length });
        }
        await ds.destroy();
    },

    // M16: pre-aborted signal; abort while acquire/create is pending, then create resolves
    async m16() {
        const { mgr, model, reaper } = await build(dbn('m16'));
        const ds = await pgDs();
        for (const type of ['full', 'incr']) {
            const repoId = randomUUID(); const mem = memRepos(repoId, type === 'incr' ? 'ready' : 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            providerCtl.run = cliTransport({ graph: () => FX.F }); providerCtl.readFile = async () => JSON.stringify(FX.F);
            // (a)
            const ac0 = new AbortController(); ac0.abort();
            const j0 = await newJob(mem, type as any, repoId); e2bState.calls.length = 0;
            let t0e: any = null; try { await (type === 'full' ? g.full : g.incr).process(j0, ac0.signal); } catch (e: any) { t0e = e.message; }
            R(`${type} (a) pre-aborted`, { thrown: t0e, lease: await doc(model, keyOf(repoId, j0)), creates: transcript.filter((t) => t.kind === 'provider.create.start').length });
            // (c)
            let open: () => void = () => {}; providerCtl.createGate = new Promise<void>((r) => (open = r));
            const j1 = await newJob(mem, type as any, repoId); const key = keyOf(repoId, j1);
            const ac = new AbortController(); setTimeout(() => ac.abort(new Error('job timeout')), 1000);
            let thrown: any = null; try { await (type === 'full' ? g.full : g.incr).process(j1, ac.signal); } catch (e: any) { thrown = e.message; }
            const atReturn = await doc(model, key);
            open(); providerCtl.createGate = undefined; await sleep(2000);
            const later = await doc(model, key);
            await reaper.killIdleSandboxes(); const afterCron = await doc(model, key);
            await reaper.reapExpiredLeases(); const afterReapBeforeExpiry = await doc(model, key);
            const sid = later?.sandboxId;
            R(`${type} (c) abort during create`, { thrown, job: mem.jobs.get(j1).status, repo: mem.repoState.astGraphStatus, leaseAtReturn: atReturn, leaseAfterCreateResolved: later, afterIdleCron: !!afterCron, afterReaperBeforeExpiry: !!afterReapBeforeExpiry,
                sandboxState: sid && e2bState.alive.get(sid), releaseOrKill: e2bState.calls.filter((c) => c.op === 'kill' && c.id === sid).length, ttlMs: later && new Date(later.expiresAt).getTime() - Date.now() });
        }
        await ds.destroy();
    },

    // M18: API_E2B_KEY absent at release and cron
    async m18() {
        const { mgr, model, reaper, env } = await build(dbn('m18'));
        const k = graphKey(); const a = await mgr.acquire(k, 'graph-build', 7200000, cloneParams);
        env.API_E2B_KEY = undefined; e2bState.calls.length = 0;
        await mgr.release(a.leaseId, { idleMs: 0 });
        const d1 = await doc(model, k);
        if (d1 && new Date(d1.killAt).getTime() > Date.now()) await model.updateOne({ _id: k }, { $set: { killAt: new Date(Date.now() - 1000) } });
        await reaper.killIdleSandboxes();
        const d2 = await doc(model, k);
        R('no key', { afterRelease: d1, afterCron: d2, kills: e2bState.calls.filter((c) => c.op === 'kill').length, sandboxState: e2bState.alive.get(a.sandboxId), cronLog: logs.filter((l) => /IDLE-KILL/.test(l.message)).map((l) => l.message) });
        env.API_E2B_KEY = 'fake-e2b-key-not-real';
    },

    // M19: local sandbox path and null provider
    async m19() {
        const os = require('os'); const path = require('path');
        const { mgr, model } = await build(dbn('m19'));
        const lib = require('./lib');
        const origCreate = lib.fakeProvider.createSandboxWithRepo;
        lib.fakeProvider.createSandboxWithRepo = async () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kodus-sandbox-'));
            fs.writeFileSync(path.join(dir, 'x.ts'), 'export const a = 1;');
            note('local.create', { dir });
            return { sandboxId: dir, type: 'local', repoDir: dir, run: async () => ({ stdout: 'abc\n', stderr: '', exitCode: 0 }), readFile: async () => JSON.stringify(FX.F), cleanup: async () => {} };
        };
        const k = graphKey(); const a = await mgr.acquire(k, 'graph-build', 7200000, cloneParams);
        const raw0 = await model.findById(k).lean();
        e2bState.calls.length = 0;
        const origClaim = (mgr as any).leaseRepo.claimCleanup.bind((mgr as any).leaseRepo); const claimArgs: any[] = [];
        (mgr as any).leaseRepo.claimCleanup = async (...x: any[]) => { claimArgs.push(x.length); return origClaim(...x); };
        await mgr.release(a.leaseId, { idleMs: 0 });
        R('local', { sandboxId: a.sandboxId, isLocal: require('@libs/sandbox/infrastructure/services/local-sandbox-cleanup.service').isLocalSandboxPath(a.sandboxId), dirExistsAfter: fs.existsSync(a.sandboxId), docAfter: await doc(model, k), sdkKills: e2bState.calls.filter((c) => c.op === 'kill').length, claimArgCounts: claimArgs, log: logs.filter((l) => /cleaned local sandbox/.test(l.message)).length });
        lib.fakeProvider.createSandboxWithRepo = origCreate;
        // null provider
        const avail = lib.fakeProvider.isAvailable; lib.fakeProvider.isAvailable = () => false;
        const k2 = graphKey(); const b = await mgr.acquire(k2, 'graph-build', 7200000, cloneParams);
        const d = await doc(model, k2); e2bState.calls.length = 0; claimArgs.length = 0;
        await mgr.release(b.leaseId, { idleMs: 0 });
        R('null', { sandboxId: b.sandboxId, docBefore: d, docAfter: await doc(model, k2), sdkKills: e2bState.calls.length, claims: claimArgs.length });
        lib.fakeProvider.isAvailable = avail;
    },

    // M22: review 30000, conversation default, reacquire during window; idleMs -1 / 0 / 1
    async m22() {
        const { mgr, model } = await build(dbn('m22'));
        const prKey = `${ORG_A}:123456:7`;
        for (const [label, opts] of [['review 30000', { idleMs: 30000 }], ['conversation default', undefined]] as any[]) {
            const a = await mgr.acquire(prKey, label.split(' ')[0], 1800000, cloneParams);
            e2bState.calls.length = 0;
            await mgr.release(a.leaseId, opts);
            const d1 = await doc(model, prKey);
            const b = await mgr.acquire(prKey, label.split(' ')[0], 1800000, cloneParams);
            const d2 = await doc(model, prKey);
            R(label, { killInMs: d1 && new Date(d1.killAt).getTime() - Date.now(), cleanupStatus: d1?.cleanupStatus ?? null, setTimeout: e2bState.calls.filter((c) => c.op === 'setTimeout').map((c) => c.ms), kills: e2bState.calls.filter((c) => c.op === 'kill').length, reacquiredSame: b.sandboxId === a.sandboxId, killAtAfterReacquire: d2?.killAt ?? null });
            await mgr.release(b.leaseId, { idleMs: 0 });
        }
        for (const ms of [-1, 0, 1]) {
            const k = graphKey(); const a = await mgr.acquire(k, 'graph-build', 7200000, cloneParams);
            e2bState.calls.length = 0;
            await mgr.release(a.leaseId, { idleMs: ms });
            const d = await doc(model, k);
            R(`idleMs ${ms}`, { kills: e2bState.calls.filter((c) => c.op === 'kill').length, setTimeout: e2bState.calls.filter((c) => c.op === 'setTimeout').map((c) => c.ms), doc: d && { killAt: d.killAt, cleanupStatus: d.cleanupStatus ?? null } });
        }
    },

    // M28: input boundaries
    async m28() {
        const { mgr, model } = await build(dbn('m28'));
        const ds = await pgDs();
        const rel = spyRelease(mgr);
        const runCase = async (label: string, type: 'full' | 'incr', setup: (mem: any) => any, extra: any = {}, ctl: any = {}) => {
            const repoId = randomUUID(); const mem = memRepos(repoId, type === 'incr' ? 'ready' : 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            providerCtl.run = cliTransport({ graph: () => FX.F, ...ctl }); providerCtl.readFile = async () => JSON.stringify(FX.F);
            setup(mem); rel.length = 0; e2bState.calls.length = 0;
            let jobId = await newJob(mem, type, repoId, extra);
            if (label.startsWith('missing job')) jobId = randomUUID();
            let thrown: any = null; try { await (type === 'full' ? g.full : g.incr).process(jobId); } catch (e: any) { thrown = e.message; }
            R(label, { thrown, releases: rel.map((r) => r.opts), kills: e2bState.calls.filter((c) => c.op === 'kill').length, lease: await doc(model, keyOf(repoId, jobId)) });
        };
        await runCase('missing job (full)', 'full', () => {});
        await runCase('missing job (incr)', 'incr', () => {});
        await runCase('pre-acquire: clone params null (full)', 'full', (m) => { m.codeManagementService.getCloneParams = async () => null; });
        await runCase('pre-acquire: clone params null (incr)', 'incr', (m) => { m.codeManagementService.getCloneParams = async () => null; });
        providerCtl.createFail = 'repository not found (bad credentials)';
        await runCase('acquire rejects (full)', 'full', () => {});
        await runCase('acquire rejects (incr)', 'incr', () => {});
        providerCtl.createFail = undefined;
        await runCase('incr empty changedFiles', 'incr', () => {}, { changedFiles: [] });
        // large slow graph: release must come after persistence
        const big = { nodes: [] as any[], edges: [] as any[] };
        for (let i = 0; i < 6000; i++) big.nodes.push({ kind: 'Function', name: 'f' + i, qualified_name: `src/qa2626/ünïcødé-日本/${'deep/'.repeat(20)}m${i % 50}.ts::f${i}`, file_path: `src/qa2626/ünïcødé-日本/${'deep/'.repeat(20)}m${i % 50}.ts`, line_start: 1, line_end: 2, language: 'typescript', is_test: false });
        for (let i = 1; i < 6000; i++) big.edges.push({ kind: 'CALLS', source_qualified: big.nodes[i].qualified_name, target_qualified: big.nodes[i - 1].qualified_name, file_path: big.nodes[i].file_path, line: 1 });
        const repoId = randomUUID(); const mem = memRepos(repoId, 'pending'); const g = await buildGraphStack(ds, mem, mgr);
        providerCtl.run = cliTransport({ graph: () => big, parseDelayMs: 2000 }); providerCtl.readFile = async () => JSON.stringify(big);
        rel.length = 0;
        const jobId = await newJob(mem, 'full', repoId);
        await g.full.process(jobId);
        const persisted = await ds.query('select count(*)::int n from ast_nodes where repo_id=$1', [repoId]);
        const uni = await ds.query("select count(*)::int n from ast_nodes where repo_id=$1 and file_path like '%ünïcødé-日本%'", [repoId]);
        const statusReady = mem.repoState.history.find((h: any) => h.status === 'ready');
        R('large slow graph', { persisted: persisted[0].n, unicodeRows: uni[0].n, readyAt: statusReady?.t, releaseAt: rel[0]?.t, releaseAfterReady: statusReady && rel[0] && rel[0].t >= statusReady.t, completedAt: mem.jobs.get(jobId).history.find((h: any) => h.status === 'COMPLETED')?.t });
        // enqueue use case: 0 / 500 / 501 files
        const { EnqueueAstGraphUpdateOnMergedUseCase } = require('@libs/code-review/application/use-cases/enqueue-ast-graph-update-on-merged.use-case');
        const enq: any[] = [];
        for (const n of [0, 500, 501]) {
            const files = Array.from({ length: n }, (_, i) => ({ filename: i === 0 ? `src/qa2626/ünïcødé-日本/${'deep/'.repeat(30)}file.ts` : `src/f${i}.ts` }));
            const uc = new EnqueueAstGraphUpdateOnMergedUseCase(
                { findByExternalId: async () => ({ uuid: 'r', fullName: 'org/athena', defaultBranch: 'main', astGraphStatus: 'ready', platform: 'github' }) },
                { enqueue: async (j: any) => { enq.push(j); return 'job-' + n; } },
                { getFilesByPullRequestId: async () => files });
            const r = await uc.execute({ prNumber: 1, repoExternalId: 'e', repoName: 'athena', platform: 'github', baseBranch: 'main', newSha: 'abc', organizationAndTeamData: { organizationId: ORG_A, teamId: 't' } });
            const last = enq[enq.length - 1];
            R(`enqueue ${n} files`, { result: r, workflowType: n === 0 ? null : last?.workflowType, payloadFiles: n === 0 ? null : (last?.payload?.changedFiles?.length ?? null), unicodeKept: n > 0 && JSON.stringify(last?.payload ?? {}).includes('ünïcødé-日本') });
        }
        await ds.destroy();
    },

    // M31: tenant isolation and error text in logs
    async m31() {
        process.env.CANARY_ERR = 'kill failed: 401 for https://api.e2b.dev/sandboxes/x X-API-Key: <fake-canary-key>';
        const { mgr, model, repo } = await build(dbn('m31'));
        const job = '55555555-5555-4555-8555-555555555555';
        const kA = `${ORG_A}:${REPO}:graph:${job}`, kB = `${ORG_B}:${REPO}:graph:${job}`;
        const a = await mgr.acquire(kA, 'graph-build', 7200000, cloneParams);
        const b = await mgr.acquire(kB, 'graph-build', 7200000, cloneParams);
        const bBefore = await doc(model, kB);
        await mgr.release(a.leaseId, { idleMs: 0 });
        const bAfter = await doc(model, kB);
        R('two orgs, same repo/job suffix', { aDoc: await doc(model, kA), bUnchanged: JSON.stringify(bBefore) === JSON.stringify(bAfter), bSandboxAlive: e2bState.alive.get(b.sandboxId), killed: e2bState.calls.filter((c) => c.op === 'kill').map((c) => c.id), aSandbox: a.sandboxId });
        const wrongClaim = await repo.claimCleanup(kB, 'some-other-sandbox', true, new Date());
        const wrongComplete = await repo.completeCleanup(kB, 'some-other-sandbox');
        R('stale claim/complete with wrong sandboxId', { claim: wrongClaim, complete: wrongComplete, bAfter: await doc(model, kB) });
        e2bState.kill = ['fail'];
        await mgr.release(b.leaseId, { idleMs: 0 });
        const raw = await model.findById(kB).lean();
        R('provider error with fake key', { persistedHasCanary: JSON.stringify(raw).includes('qa2626fakecanary'), warn: logs.filter((l) => /immediate kill failed/.test(l.message)).map((l) => ({ level: l.level, err: l.err?.slice(0, 160) })) });
    },

    // M32: legacy docs and old callers
    async m32() {
        const { mgr, model, repo } = await build(dbn('m32'));
        const k = graphKey(); const sid = 'legacy-sbx-1'; e2bState.alive.set(sid, 'running');
        await model.collection.insertOne({ _id: k, state: 'READY', leaseCount: 0, sandboxId: sid, organizationId: ORG_A, repositoryId: REPO, prNumber: 'graph', createdAt: new Date(), expiresAt: new Date(Date.now() + 7200000) } as any);
        const before = await model.findById(k).lean();
        const a = await mgr.acquire(k, 'graph-build', 7200000, cloneParams);
        await mgr.release(a.leaseId, { idleMs: 0 });
        R('legacy doc (no cleanup fields)', { fieldsBefore: Object.keys(before as any), joinedLegacy: a.sandboxId === sid, after: await doc(model, k), legacyState: e2bState.alive.get(sid) });
        const k2 = graphKey(); await model.collection.insertOne({ _id: k2, state: 'READY', leaseCount: 0, sandboxId: '/tmp/kodus-sandbox-xyz', organizationId: ORG_A, repositoryId: REPO, prNumber: 'graph', createdAt: new Date(), expiresAt: new Date(Date.now() + 1e6) } as any);
        const c3 = await repo.claimCleanup(k2, '/tmp/kodus-sandbox-xyz', true);
        const d3 = await model.findById(k2).lean() as any;
        R('three-arg claim (old callers)', { claimed: !!c3, killAt: d3.killAt ?? null, cleanupStatus: d3.cleanupStatus });
        const k3 = graphKey(); await model.collection.insertOne({ _id: k3, state: 'INVALIDATED', leaseCount: 0, sandboxId: 'inv-1', organizationId: ORG_A, repositoryId: REPO, prNumber: 'graph', createdAt: new Date(), expiresAt: new Date(Date.now() + 1e6) } as any);
        let err: any = null; try { await mgr.acquire(k3, 'graph-build', 7200000, cloneParams); } catch (e: any) { err = e.name + ': ' + e.message.slice(0, 80); }
        R('INVALIDATED key', { err, doc: await doc(model, k3) });
        const k4 = graphKey(); const n = await mgr.acquire(k4, 'graph-build', 7200000, cloneParams);
        const stale = await repo.claimCleanup(k4, 'older-sandbox', true, new Date());
        R('same key, newer sandbox vs stale id', { staleClaim: stale, doc: await doc(model, k4) });
        await mgr.release(n.leaseId, { idleMs: 0 });
    },

    // M34: one write with Date killAt + IN_PROGRESS; refused claim untouched; sentinel sibling
    async m34() {
        const { model, repo } = await build(dbn('m34'));
        const mg = require('mongoose'); const cmds: any[] = [];
        mg.set('debug', (coll: string, method: string, query: any, update: any) => { if (coll === 'sandbox_leases' || /lease/i.test(coll)) cmds.push({ method, query: String(JSON.stringify(query)).slice(0, 160), update: String(JSON.stringify(update)).slice(0, 260) }); });
        const k = graphKey(); const sentinel = graphKey();
        for (const id of [k, sentinel]) await model.collection.insertOne({ _id: id, state: 'READY', leaseCount: 0, sandboxId: 'sbx-' + id.slice(-4), organizationId: ORG_A, repositoryId: REPO, prNumber: 'graph', createdAt: new Date(), expiresAt: new Date(Date.now() + 1e6) } as any);
        const killAt = new Date('2026-11-22T12:00:00.000Z');
        cmds.length = 0;
        await repo.claimCleanup(k, 'sbx-' + k.slice(-4), true, killAt);
        const one = cmds.slice(); const d = await model.findById(k).lean() as any;
        R('claim with count 0', { writes: one, killAtIsDate: d.killAt instanceof Date, killAt: d.killAt, status: d.cleanupStatus });
        await model.updateOne({ _id: sentinel }, { $set: { leaseCount: 1 } });
        const before = await model.findById(sentinel).lean();
        const refused = await repo.claimCleanup(sentinel, 'sbx-' + sentinel.slice(-4), true, killAt);
        const after = await model.findById(sentinel).lean();
        await repo.decrementLease(sentinel);
        const won = await repo.claimCleanup(sentinel, 'sbx-' + sentinel.slice(-4), true, killAt);
        R('count 1 refused -> drain -> claim', { refused, untouched: JSON.stringify(before) === JSON.stringify(after), wonKillAt: (won as any)?.killAt, wonStatus: (won as any)?.cleanupStatus });
        mg.set('debug', false);
    },

    // M5 rerun: real kodus-graph 0.3.0 on real checkouts of claude-athena at F and I
    async m5r() {
        const { mgr } = await build(dbn('m5r'));
        const ds = await pgDs();
        const cp = require('child_process'); const os = require('os'); const path = require('path');
        const KG = process.env.KG_DIR!;
        const copy = (label: string) => {
            const d = fs.mkdtempSync(path.join(os.tmpdir(), `qa2626-${label}-`));
            cp.execSync(`cp -R ${KG}/repo-${label}/. ${d}/ && cd ${d} && git init -q && git add -A && git -c user.email=qa@example.invalid -c user.name=qa commit -qm ${label}`);
            return d;
        };
        const changed = FX.changed;
        const run = async (label: string, steps: Array<['full' | 'incr', string, any?]>) => {
            const repoId = randomUUID(); const mem = memRepos(repoId, 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            for (const [type, rev, extra] of steps) {
                providerCtl.realDir = copy(rev);
                await (type === 'full' ? g.full : g.incr).process(await newJob(mem, type, repoId, extra || {}));
                if (type === 'incr') { const raw = JSON.parse(fs.readFileSync(path.join(providerCtl.realDir, '.kodus-graph/graph.json'), 'utf8')); R(label + ' parse --files output', { nodes: raw.nodes.length, edges: raw.edges.length, edgeList: raw.edges.map((e: any) => `${e.kind} ${e.source_qualified} -> ${e.target_qualified}`) }); }
            }
            const c = await canon(ds, repoId);
            R(label, { nodes: c.nodes, edges: c.edges, nh: c.nh, eh: c.eh, status: mem.repoState.astGraphStatus, edgeList: c.rows.e.map((e: any) => `${e.kind} ${e.source_qualified} -> ${e.target_qualified}`) });
            return c;
        };
        const incr = await run('full@F then incr@I', [['full', 'F'], ['incr', 'I', { changedFiles: changed }]]);
        const full = await run('full@I', [['full', 'I']]);
        const a = new Set(incr.rows.e.map((e: any) => `${e.kind} ${e.source_qualified} -> ${e.target_qualified}`));
        const b = new Set(full.rows.e.map((e: any) => `${e.kind} ${e.source_qualified} -> ${e.target_qualified}`));
        R('diff incr vs full (edge tuples kind/source/target)', { onlyFull: [...b].filter((x) => !a.has(x)), onlyIncr: [...a].filter((x) => !b.has(x)), nodesEqual: incr.nh === full.nh });
        await run('azure paths: full@F then incr@I with /src/...', [['full', 'F'], ['incr', 'I', { changedFiles: changed.map((f: string) => '/' + f) }]]);
        await ds.destroy();
    },

    // M15 rerun: abort after readFile returned, while the graph is being persisted
    async m15b() {
        const { mgr, model } = await build(dbn('m15b'));
        const ds = await pgDs();
        const unhandled: any[] = []; process.on('unhandledRejection', (e: any) => { unhandled.push(String(e?.message || e)); });
        for (const [type, point] of [['full', 'fullRebuild'], ['incr', 'incrementalUpdate'], ['full', 'READY->markCompleted']] as any[]) {
            const repoId = randomUUID(); const mem = memRepos(repoId, type === 'incr' ? 'ready' : 'pending'); const g = await buildGraphStack(ds, mem, mgr);
            if (type === 'incr') await g.astRepo.fullRebuild(repoId, FX.F.nodes, FX.F.edges);
            const before = await canon(ds, repoId);
            providerCtl.realDir = undefined;
            providerCtl.run = cliTransport({ graph: () => (type === 'full' ? FX.F : FX.I_parse) });
            providerCtl.readFile = async () => JSON.stringify(type === 'full' ? FX.F : FX.I_parse);
            const ac = new AbortController();
            let reached: () => void = () => {}; const reachedP = new Promise<void>((r) => (reached = r));
            let open: () => void = () => {}; const gate = new Promise<void>((r) => (open = r));
            if (point === 'READY->markCompleted') {
                const orig = mem.repositoryService.updateGraphStatus;
                mem.repositoryService.updateGraphStatus = async (id: string, st: string, extra?: any) => { const r = await orig(id, st, extra); if (st === 'ready') { note('gate reached after READY'); reached(); await gate; note('gate opened'); } return r; };
            } else {
                const orig = (g.astRepo as any)[point].bind(g.astRepo);
                (g.astRepo as any)[point] = async (...a: any[]) => { note('gate reached in ' + point); reached(); await gate; note('gate opened'); return orig(...a); };
            }
            e2bState.calls.length = 0;
            const jobId = await newJob(mem, type, repoId); const key = keyOf(repoId, jobId);
            const p = (type === 'full' ? g.full : g.incr).process(jobId, ac.signal).catch((e: any) => e.message);
            await reachedP; note('ABORT', { type, point }); ac.abort(new Error('job timeout'));
            const thrown = await p;
            const atReturn = { job: mem.jobs.get(jobId).status, repo: mem.repoState.astGraphStatus, lease: await doc(model, key), kills: e2bState.calls.filter((c) => c.op === 'kill').length };
            open(); await sleep(2000);
            const after = await canon(ds, repoId);
            R(`${type} abort at ${point}`, { thrown, atReturn, final: { job: mem.jobs.get(jobId).status, jobHistory: mem.jobs.get(jobId).history.map((h: any) => `${h.t} ${h.status || ''} ${h.stage || ''}`), repo: mem.repoState.astGraphStatus, repoHistory: mem.repoState.history.map((h: any) => `${h.t} ${h.status} ${h.sha || ''}`) },
                graphWrittenByAbandonedAttempt: before.nh !== after.nh || before.eh !== after.eh, unhandled: [...unhandled] });
        }
        await ds.destroy();
    },

};

(async () => {
    const name = process.argv[2];
    await scenarios[name]();
    out.leaseLogs = leaseLogs();
    out.transcript = transcript;
    fs.writeFileSync(`${process.cwd()}/../out-${name}-${REV}.json`, JSON.stringify(out, null, 1));
    await done();
})().catch(async (e) => { console.error('SCENARIO ERROR', e); out.error = String(e?.stack || e); fs.writeFileSync(`${process.cwd()}/../out-${process.argv[2]}-${REV}.json`, JSON.stringify(out, null, 1)); await done(1); });
