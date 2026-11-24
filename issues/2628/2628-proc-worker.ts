/* One worker process: real SandboxLeaseManager / SandboxLeaseReaperService on the disposable Mongo. */
import 'reflect-metadata';
import * as fs from 'fs';
import mongoose from 'mongoose';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseReaperService } from '@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';

const [, , , mode, prKey, ttlArg] = process.argv;
const out = (event: string, data: any = {}) => {
    const line = JSON.stringify({ rev: process.env.H_REV, pid: process.pid, mode, event, at: new Date().toISOString(), ...data });
    fs.appendFileSync(process.env.H_OUT!, line + '\n');
    console.log(line);
};
const config = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;

(async () => {
    const conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_proc_${process.env.H_REV}?directConnection=true`);
    const model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    const repo = new SandboxLeaseRepository(model as any);
    const provider = {
        isAvailable: () => true,
        createSandboxWithRepo: async () => ({ type: 'e2b', sandboxId: 'sbx-' + process.env.H_REV + '-' + Date.now(), repoDir: '/r', remoteCommands: { read: async () => 'x' }, cleanup: async () => undefined, run: async () => ({ stdout: '', stderr: '', exitCode: 0 }), readFile: async () => 'x', writeFile: async () => undefined }),
    };
    const mgr = new SandboxLeaseManager(provider as any, repo, config);
    const ttl = Number(ttlArg || 20000);
    if (mode === 'hold') {
        const { sandbox, leaseId } = await mgr.acquire(prKey, 'review', ttl, { cloneUrl: 'x' } as any);
        await sandbox.readFile('a');
        out('acquired-holding', { leaseId, sandboxId: (sandbox as any).sandboxId });
        await new Promise(() => {}); // orchestrator still running
    }
    if (mode === 'pause-before-decrement') {
        const { sandbox, leaseId } = await mgr.acquire(prKey, 'review', ttl, { cloneUrl: 'x' } as any);
        await sandbox.readFile('a');
        (repo as any).decrementLease = async () => { out('release-decided-decrement-pending', { leaseId }); await new Promise(() => {}); };
        void mgr.release(leaseId, { idleMs: 30_000 });
        await new Promise(() => {});
    }
    if (mode === 'after-killat') {
        const { sandbox, leaseId } = await mgr.acquire(prKey, 'review', ttl, { cloneUrl: 'x' } as any);
        await sandbox.readFile('a');
        const realSet = repo.setKillAt.bind(repo);
        (repo as any).setKillAt = async (k: string, at: Date) => { await realSet(k, at); out('killat-written', { killAt: at }); };
        void mgr.release(leaseId, { idleMs: 3_000 });
        await new Promise(() => {});
    }
    if (mode === 'join-and-release') {
        const { leaseId } = await mgr.acquire(prKey, 'conversation', ttl, { cloneUrl: 'x' } as any);
        const mid = await model.findById(prKey).lean();
        out('joined', { leaseId, leaseCount: (mid as any)?.leaseCount });
        await mgr.release(leaseId);
        const after = await model.findById(prKey).lean();
        out('released', { leaseCount: (after as any)?.leaseCount, killAt: (after as any)?.killAt ?? null });
        process.exit(0);
    }
    if (mode === 'reaper') {
        const lock = { acquire: async () => ({ release: async () => undefined }) };
        const reaper = new SandboxLeaseReaperService(repo, lock as any, config);
        await reaper.reapExpiredLeases();
        await reaper.killIdleSandboxes();
        const d = await model.findById(prKey).lean();
        out('reaper-ran', { docAfter: d ? { leaseCount: (d as any).leaseCount, killAt: (d as any).killAt ?? null, expiresAt: (d as any).expiresAt } : null });
        process.exit(0);
    }
    if (mode === 'read') {
        const d = await model.findById(prKey).lean();
        out('doc', { doc: d ? { leaseCount: (d as any).leaseCount, killAt: (d as any).killAt ?? null, expiresAt: (d as any).expiresAt, state: (d as any).state, sandboxId: (d as any).sandboxId } : null });
        process.exit(0);
    }
})().catch((e) => { out('error', { error: String(e?.stack ?? e).slice(0, 500) }); process.exit(2); });
