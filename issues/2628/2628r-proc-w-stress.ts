/* One OS process per role. A and B are two workers (real SandboxLeaseManager each) sharing a prKey per
   iteration; R1/R2 are two real SandboxLeaseReaperService loops. All on the disposable Mongo; E2B is a
   recording stub. Iteration i starts at H_T0 + i*H_STEP on the wall clock, so the processes race for real. */
import 'reflect-metadata';
import * as fs from 'fs';
import mongoose from 'mongoose';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseReaperService } from '@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { buildPrKey } from '@libs/sandbox/domain/contracts/sandbox-lease-manager.contract';

const role = process.argv[3];
const REV = process.env.H_REV!;
const T0 = Number(process.env.H_T0), STEP = Number(process.env.H_STEP), N = Number(process.env.H_N);
const ORG = '33333333-2628-4ccc-8ccc-000000000003';
const out = (event: string, data: any = {}) => fs.appendFileSync(process.env.H_OUT!, JSON.stringify({ rev: REV, pid: process.pid, role, event, t: Date.now(), ...data }) + '\n');
const config = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// deterministic per-iteration randomness shared by every process (mulberry32)
const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const plan = (i: number) => {
    const r = rnd(2628 * 1000 + i);
    const aHold = 50 + Math.floor(r() * 300);
    const busy = r() < 0.5;
    const cmdMs = busy ? 100 + Math.floor(r() * 400) : 0;
    const aRelease = 50 + aHold;                      // A calls release at this offset
    const giveBack = busy ? aRelease + cmdMs + 1000 : aRelease; // expected give-back offset
    const align = r();
    const jitter = Math.floor(r() * 12) - 3;
    if (process.env.H_M34 === '1') { const bAt = aRelease + 30 + Math.floor(r() * 90); return { aHold, busy: false, cmdMs: 0, aRelease, giveBack: aRelease, bAt, bHold: 400 + Math.floor(r() * 300) }; }
    const bAt = align < 0.45 ? giveBack + jitter : align < 0.8 ? giveBack + 300 + jitter : giveBack + Math.floor(r() * 500); // around the decrement, around killAt, random
    const bHold = 50 + Math.floor(r() * 250);
    return { aHold, busy, cmdMs, aRelease, giveBack, bAt, bHold };
};

(async () => {
    const conn = await mongoose.connect(`mongodb://localhost:57017/qa2628r_stress_${REV}?directConnection=true`);
    const model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    const repo = new SandboxLeaseRepository(model as any);
    let n = 0;
    const provider = {
        isAvailable: () => true,
        createSandboxWithRepo: async () => ({ type: 'e2b', sandboxId: `sbx-${REV}-${role}-${process.pid}-${++n}`, repoDir: '/r', remoteCommands: { read: async () => 'x' }, cleanup: async () => undefined,
            run: async (c: string) => { const ms = Number(c.split(' ')[1] || 0); await sleep(ms); return { stdout: '', stderr: '', exitCode: 0 }; }, readFile: async () => 'x', writeFile: async () => undefined }),
    };
    out('ready');
    if (role === 'R1' || role === 'R2') {
        const locks = conn.connection.db!.collection('qa_locks');
        const lock = process.env.H_LOCK === 'mongo'
            ? { acquire: async (key: string, o: { ttl: number }) => {
                  const now = Date.now(); const owner = `${process.pid}-${now}-${Math.random()}`;
                  try {
                      const r = await locks.findOneAndUpdate({ _id: key as any, $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }] }, { $set: { owner, expiresAt: now + o.ttl } }, { upsert: true, returnDocument: 'after' });
                      if ((r as any)?.owner !== owner && (r as any)?.value?.owner !== owner) return null;
                  } catch (e: any) { if (e?.code === 11000) return null; throw e; }
                  out('lock-acquired', { key });
                  return { release: async () => { await locks.deleteOne({ _id: key as any, owner }); } };
              } }
            : { acquire: async () => ({ release: async () => undefined }) };
        const reaper = new SandboxLeaseReaperService(repo, lock as any, config);
        const end = T0 + N * STEP + 4000;
        const period = role === 'R1' ? 37 : 53;
        while (Date.now() < end) {
            await reaper.killIdleSandboxes().catch((e) => out('reaper-error', { e: String(e).slice(0, 200) }));
            if (role === 'R1') {
                const bad = await model.find({ leaseCount: { $gt: 0 }, killAt: { $ne: null } }).select('_id killAt leaseCount').lean();
                if (bad.length) out('sample-held-with-killAt', { ids: bad.map((d: any) => d._id) });
            }
            await sleep(period);
        }
        out('done'); await conn.disconnect(); process.exit(0);
    }
    if (process.env.H_M34 === '1' && role === 'A') {
        const real = repo.setKillAt.bind(repo);
        (repo as any).setKillAt = async (k: string, at: Date) => { out('setKillAt-delayed', { k }); await sleep(150); return real(k, at); };
    }
    const mgr = new SandboxLeaseManager(provider as any, repo, config);
    for (let i = 0; i < N; i++) {
        const base = T0 + i * STEP;
        const p = plan(i);
        const k = buildPrKey(ORG, 'r7', i + 1);
        try {
            if (role === 'A') {
                await sleep(base + 50 - Date.now());
                const a = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
                out('acquired', { i, sandboxId: a.sandboxId, created: a.wasCreated });
                let cmd: Promise<any> | undefined;
                if (p.busy) { cmd = (a.sandbox as any).run(`sleep ${p.cmdMs}`).then(() => out('cmd-end', { i, sandboxId: a.sandboxId })); }
                await sleep(base + p.aRelease - Date.now());
                out('release-called', { i, sandboxId: a.sandboxId, busy: p.busy });
                await mgr.release(a.leaseId, { idleMs: 300 });
                out('release-returned', { i });
                if (cmd) await cmd;
            } else {
                await sleep(base + p.bAt - Date.now());
                out('acquire-called', { i });
                const b = await mgr.acquire(k, 'conversation', 5 * 60 * 1000, { cloneUrl: 'x' } as any);
                out('acquired', { i, sandboxId: b.sandboxId, created: b.wasCreated });
                await (b.sandbox as any).readFile('a');
                await sleep(p.bHold);
                out('release-called', { i, sandboxId: b.sandboxId });
                await mgr.release(b.leaseId, { idleMs: 300 });
            }
        } catch (e: any) { out('error', { i, e: String(e?.message ?? e).slice(0, 200) }); }
    }
    await sleep(3000);
    out('done'); await conn.disconnect(); process.exit(0);
})().catch((e) => { out('fatal', { e: String(e?.stack ?? e).slice(0, 500) }); process.exit(2); });
