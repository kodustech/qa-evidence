/* One OS process = one worker. Reads JSON commands on stdin, answers with '§' JSON lines. */
import { build, doc, note, sleep, e2bState, providerCtl, ts } from './lib';
import * as fs from 'fs';
import * as readline from 'readline';
import { pgDs, memRepos, cliTransport, buildGraphStack } from './graph';
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures.json', 'utf8'));
const NAME = process.env.ACTOR || 'A';
const BAR = process.env.BARRIER_DIR || '/tmp';
const HOOKS = new Set((process.env.HOOKS || '').split(',').filter(Boolean));
async function barrier(point: string) {
    if (!HOOKS.has(point)) return;
    fs.writeFileSync(`${BAR}/${NAME}.${point}.reached`, ts());
    note('barrier.reached', { actor: NAME, point });
    while (!fs.existsSync(`${BAR}/${NAME}.${point}.go`)) await sleep(50);
    note('barrier.released', { actor: NAME, point });
}
(async () => {
    const { mgr, model, reaper, repo } = await build(process.env.DB!, { apiKey: process.env.NO_KEY !== '1', withLock: process.env.WITH_LOCK === '1' });
    const wrap = (m: string, before?: string, after?: string) => {
        const orig = (repo as any)[m].bind(repo);
        (repo as any)[m] = async (...a: any[]) => { if (before) await barrier(before); const r = await orig(...a); if (after) await barrier(after); return r; };
    };
    wrap('decrementLease', undefined, 'after-decrement');
    wrap('claimCleanup', 'before-claim', 'after-claim');
    wrap('findReadyToKill', undefined, 'cron-after-read');
    wrap('delete', 'cron-before-delete');
    if (process.env.MUTANT_NO_KILLAT === '1') {
        const orig = (repo as any).claimCleanup;
        (repo as any).claimCleanup = (k: string, s: string, z: boolean, _killAt?: Date) => orig(k, s, z);
        note('mutant: claimCleanup drops killAt');
    }
    const held = new Map<string, any>();
    note('ready', { actor: NAME });
    const rl = readline.createInterface({ input: process.stdin });
    for await (const line of rl) {
        const c = JSON.parse(line);
        (async () => {
            try {
                if (c.cmd === 'kill') { e2bState.kill = c.behaviors; e2bState.killDefault = c.default ?? 'ok'; note('ack', { id: c.id }); }
                else if (c.cmd === 'alive') { for (const s of c.ids) e2bState.alive.set(s, 'running'); note('ack', { id: c.id }); }
                else if (c.cmd === 'acquire') {
                    const t0 = Date.now();
                    const r = await mgr.acquire(c.key, c.consumer || 'graph-build', c.ttl || 7200000, { cloneUrl: 'x', authToken: '', branch: 'main', platform: 'github', sandboxMetadata: { stage: 'graph-build' } } as any);
                    held.set(r.leaseId, r);
                    note('acquired', { id: c.id, actor: NAME, pid: process.pid, leaseId: r.leaseId, sandboxId: r.sandboxId, waitedMs: Date.now() - t0 });
                } else if (c.cmd === 'release') {
                    await mgr.release(c.leaseId, c.idleMs === undefined ? undefined : { idleMs: c.idleMs });
                    note('released', { id: c.id, actor: NAME });
                } else if (c.cmd === 'use') {
                    const r = held.get(c.leaseId);
                    const out = await r.sandbox.run('cat README.md');
                    note('used', { id: c.id, actor: NAME, ok: true, sandboxId: r.sandboxId, out: out.stdout?.slice(0, 20) });
                } else if (c.cmd === 'process') {
                    const ds = await pgDs();
                    const mem = memRepos(c.repoId, c.status || 'pending');
                    const g = await buildGraphStack(ds, mem, mgr);
                    providerCtl.run = cliTransport({ graph: () => FX.F, ...(c.ctl || {}) });
                    providerCtl.readFile = async () => JSON.stringify(FX.F);
                    mem.jobs.set(c.jobId, { id: c.jobId, payload: { repositoryId: c.repoId, cloneUrl: 'x', defaultBranch: 'main', fullName: 'org/athena', platform: 'github', changedFiles: FX.changed, newSha: 'beef', organizationAndTeamData: { organizationId: c.org, teamId: 't' } }, correlationId: 'c', metadata: {} });
                    let thrown = null;
                    const t0 = Date.now();
                    try { await (c.type === 'incr' ? g.incr : g.full).process(c.jobId); } catch (e: any) { thrown = e.message; }
                    note('processed', { id: c.id, actor: NAME, thrown, job: mem.jobs.get(c.jobId).status, repo: mem.repoState.astGraphStatus, ms: Date.now() - t0 });
                    await ds.destroy();
                } else if (c.cmd === 'cron') { await reaper.killIdleSandboxes(); note('cron.done', { id: c.id, actor: NAME }); }
                else if (c.cmd === 'reap') { await reaper.reapExpiredLeases(); note('reap.done', { id: c.id, actor: NAME }); }
                else if (c.cmd === 'doc') { note('doc', { id: c.id, doc: await doc(model, c.key) }); }
                else if (c.cmd === 'raw') { note('raw', { id: c.id, doc: await model.findById(c.key).lean() }); }
                else if (c.cmd === 'set') { const st: any = {}; for (const [kk, vv] of Object.entries(c.set)) st[kk] = typeof vv === 'string' && /^\d{4}-\d\d-\d\dT/.test(vv as string) ? new Date(vv as string) : vv; await model.updateOne({ _id: c.key }, { $set: st }); note('ack', { id: c.id }); }
                else if (c.cmd === 'insert') { await model.collection.insertOne(c.doc); note('ack', { id: c.id }); }
                else if (c.cmd === 'calls') { note('calls', { id: c.id, calls: e2bState.calls }); }
            } catch (e: any) { note('error', { id: c.id, actor: NAME, cmd: c.cmd, err: String(e?.message || e) }); }
        })();
    }
})();
