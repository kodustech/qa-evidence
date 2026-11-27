/* R18: one worker process as a Nest application context with enableShutdownHooks (as apps/worker/src/main.ts).
   The real SandboxLeaseManager is a provider; Mongo closes in onApplicationShutdown, as MongooseModule does.
   A review lease is released while its holder still has a command running, then the driver signals the process. */
import 'reflect-metadata';
import * as fs from 'fs';
import mongoose from 'mongoose';
import { Module, OnApplicationShutdown } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';

const [, , , prKey, ttlArg] = process.argv;
const out = (event: string, data: any = {}) => fs.appendFileSync(process.env.H_OUT!, JSON.stringify({ rev: process.env.H_REV, pid: process.pid, event, at: new Date().toISOString(), t: Date.now(), ...data }) + '\n');
const config = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;
let conn: typeof mongoose;
class MongoCloser implements OnApplicationShutdown {
    async onApplicationShutdown(signal?: string) { out('mongo-closing', { signal }); await conn.disconnect(); out('mongo-closed'); }
}
(async () => {
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628r_shutdown_${process.env.H_REV}?directConnection=true`);
    const model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    const repo = new SandboxLeaseRepository(model as any);
    const provider = { isAvailable: () => true, createSandboxWithRepo: async () => ({ type: 'e2b', sandboxId: 'sbx-' + process.env.H_REV + '-' + process.pid, repoDir: '/r', remoteCommands: { read: async () => 'x' }, cleanup: async () => undefined, run: () => new Promise(() => {}), readFile: async () => 'x', writeFile: async () => undefined }) };
    const mgr = new SandboxLeaseManager(provider as any, repo, config);
    @Module({ providers: [{ provide: SandboxLeaseManager, useFactory: () => mgr }, MongoCloser] })
    class WorkerModule {}
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    app.enableShutdownHooks();
    const { sandbox, leaseId } = await mgr.acquire(prKey, 'review', Number(ttlArg || 1800000), { cloneUrl: 'x' } as any);
    void (sandbox as any).run('sleep 600'); // an agent command the orchestrator abandoned
    await new Promise((r) => setTimeout(r, 50));
    await mgr.release(leaseId, { idleMs: 30_000 });
    const d: any = await model.findById(prKey).lean();
    out('release-returned', { leaseCount: d?.leaseCount, killAt: d?.killAt ?? null, background: (mgr as any).backgroundReleases?.size ?? 'n/a' });
    process.on('exit', (code) => out('exit', { code }));
})().catch((e) => { out('fatal', { e: String(e?.stack ?? e).slice(0, 400) }); process.exit(2); });
