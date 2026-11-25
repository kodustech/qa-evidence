/* QA #2626 harness: real SandboxLeaseManager / SandboxLeaseRepository / SandboxLeaseReaperService
 * on a disposable Mongo (and Postgres for the cron lock). Only the E2B HTTP surface
 * (Sandbox.kill / setTimeout / connect) and the sandbox provider's create are stubbed. */
import 'reflect-metadata';
import mongoose from 'mongoose';
import { DataSource } from 'typeorm';
import { addLogProcessor } from '@libs/core/log/logger';
import { SandboxLeaseModel, SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseReaperService } from '@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service';
import { DistributedLockService } from '@libs/core/workflow/infrastructure/distributed-lock.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const e2b = require('e2b');

export const REV = process.env.REV || 'merge';
export const t0 = Date.now();
export const ts = () => new Date().toISOString();
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const transcript: any[] = [];
export function note(kind: string, data: any = {}) {
    const e = { t: ts(), pid: process.pid, rev: REV, kind, ...data };
    transcript.push(e);
    if (process.env.ECHO !== '0') console.log('§' + JSON.stringify(e));
}
export const logs: any[] = [];
addLogProcessor((level: string, message: string, component: string, ctx?: any, err?: Error) => {
    const e = { t: ts(), pid: process.pid, level, component, message, meta: ctx?.metadata ?? ctx, err: err ? String(err?.message ?? err) : undefined };
    logs.push(e);
    if (process.env.ECHO !== '0' && /SandboxLease|AST-GRAPH|SANDBOX-/.test(message + component)) console.log('¶' + JSON.stringify({ t: e.t, pid: e.pid, level, component, message: String(message).slice(0, 260), err: e.err }));
});

// ---------- E2B stub ----------
type KillBehavior = 'ok' | 'fail' | 'gone' | 'gone-throw' | 'hang' | { delayMs: number; then: 'ok' | 'fail' | 'gone' } | ((id: string) => Promise<any>);
import * as fsx from 'fs';
const SD = process.env.E2B_STATE_DIR;
class SharedAlive {
    private m = new Map<string, string>();
    get(id: string) { if (SD) { try { return fsx.readFileSync(`${SD}/${id}`, 'utf8'); } catch { return undefined; } } return this.m.get(id); }
    set(id: string, v: string) { if (SD) { fsx.writeFileSync(`${SD}/${id}`, v); } else this.m.set(id, v); return this; }
}
export const e2bState: { kill: KillBehavior[]; killDefault: KillBehavior; alive: SharedAlive; calls: any[] } = {
    kill: [], killDefault: 'ok', alive: new SharedAlive(), calls: [],
};
function goneErr(id: string) { const e: any = new Error(`Sandbox ${id} not found`); e.name = 'NotFoundError'; e.status = 404; return e; }
e2b.Sandbox.kill = async (id: string, opts: any) => {
    const b = e2bState.kill.length ? e2bState.kill.shift()! : e2bState.killDefault;
    note('e2b.kill.call', { id, stack: (new Error().stack || '').split('\n').slice(2, 7).map((x) => x.trim().replace(/\(.*\/(libs|harness)\//, '($1/')).join(' < '), hasKey: !!opts?.apiKey, behavior: typeof b === 'object' || typeof b === 'function' ? 'custom' : b });
    e2bState.calls.push({ t: ts(), op: 'kill', id });
    const run = async (x: any): Promise<boolean> => {
        if (x === 'ok') { const was = e2bState.alive.get(id); e2bState.alive.set(id, 'killed'); note('e2b.kill.ok', { id, was }); return true; }
        if (x === 'gone') { note('e2b.kill.gone(false)', { id }); return false; }
        if (x === 'gone-throw') { note('e2b.kill.gone-throw', { id }); throw goneErr(id); }
        if (x === 'hang') { note('e2b.kill.hang', { id }); return new Promise<boolean>(() => {}); }
        if (x === 'fail') { const e: any = new Error(process.env.CANARY_ERR || 'upstream 502 Bad Gateway'); e.status = 502; note('e2b.kill.fail', { id }); throw e; }
        if (typeof x === 'function') return x(id);
        await sleep(x.delayMs); return run(x.then);
    };
    return run(b);
};
e2b.Sandbox.setTimeout = async (id: string, ms: number) => { note('e2b.setTimeout', { id, ms }); e2bState.calls.push({ t: ts(), op: 'setTimeout', id, ms }); };
e2b.Sandbox.connect = async (id: string) => {
    note('e2b.connect', { id, state: e2bState.alive.get(id) });
    e2bState.calls.push({ t: ts(), op: 'connect', id });
    if (e2bState.alive.get(id) !== 'running') throw goneErr(id);
    return { sandboxId: id, commands: { run: async (cmd: string) => { const st = e2bState.alive.get(id); note('e2b.run', { id, state: st, cmd: String(cmd).slice(0, 50) }); if (st !== 'running') throw goneErr(id); return { stdout: 'ok', stderr: '', exitCode: 0 }; } } };
};

// ---------- fake provider ----------
export const providerCtl: { createDelayMs: number; createGate?: Promise<void>; seq: number; run?: (cmd: string, id: string) => Promise<any>; readFile?: (p: string, id: string) => Promise<string>; createFail?: string; realDir?: string; afterRun?: (cmd: string) => Promise<void> } = { createDelayMs: 0, seq: 0 };
export const fakeProvider: any = {
    isAvailable: () => true,
    async createSandboxWithRepo(params: any) {
        const id = `fake-${process.pid}-${++providerCtl.seq}-${Math.random().toString(36).slice(2, 7)}`;
        note('provider.create.start', { id });
        if (providerCtl.createGate) await providerCtl.createGate;
        if (providerCtl.createDelayMs) await sleep(providerCtl.createDelayMs);
        if (providerCtl.createFail) { note('provider.create.fail', { id }); throw new Error(providerCtl.createFail); }
        e2bState.alive.set(id, 'running');
        note('provider.create.done', { id });
        return {
            sandboxId: id, type: 'e2b', repoDir: providerCtl.realDir || '/home/user/repo', baseBranch: params?.branch,
            run: async (cmd: string, o?: any) => {
                if (e2bState.alive.get(id) !== 'running') { note('sandbox.run.on-dead', { id, cmd: cmd.slice(0, 60) }); throw new Error(`sandbox ${id} is not running (killed)`); }
                if (providerCtl.realDir) {
                    const cp = require('child_process');
                    const env = { ...process.env, PATH: `${process.env.KG_BIN}:${process.env.PATH}` };
                    const r = cp.spawnSync('bash', ['-c', cmd], { cwd: providerCtl.realDir, env, encoding: 'utf8', timeout: 120000 });
                    note('real.exec', { id, cmd: cmd.replace(/^export PATH[^&]*&& /, '').slice(0, 160), exit: r.status, stderr: (r.stderr || '').slice(0, 200) });
                    if (providerCtl.afterRun) await providerCtl.afterRun(cmd);
                    return { stdout: r.stdout || '', stderr: r.stderr || '', exitCode: r.status ?? 1 };
                }
                if (providerCtl.run) return providerCtl.run(cmd, id);
                return { stdout: 'abc123def456\n', stderr: '', exitCode: 0 };
            },
            readFile: async (p: string) => {
                if (e2bState.alive.get(id) !== 'running') { note('sandbox.readFile.on-dead', { id }); throw new Error(`sandbox ${id} is not running (killed)`); }
                if (providerCtl.realDir) return fsx.readFileSync(p, 'utf8');
                return providerCtl.readFile ? providerCtl.readFile(p, id) : '';
            },
            cleanup: async () => {},
        };
    },
    async createSandbox() { throw new Error('not used'); },
};

// ---------- wiring ----------
export async function connectMongo(db: string) {
    await mongoose.connect(`mongodb://localhost:57126/${db}?directConnection=true`);
    const model = mongoose.models[SandboxLeaseModel.name] || mongoose.model(SandboxLeaseModel.name, SandboxLeaseSchema);
    return model as any;
}
export function config(env: Record<string, any>) {
    return { get: (k: string) => env[k] } as any;
}
export async function build(db: string, opts: { apiKey?: boolean; withLock?: boolean } = {}) {
    const model = await connectMongo(db);
    const repo = new SandboxLeaseRepository(model);
    const env: Record<string, any> = { API_E2B_KEY: opts.apiKey === false ? undefined : 'fake-e2b-key-not-real' };
    const cfg = config(env);
    const mgr = new SandboxLeaseManager(fakeProvider, repo, cfg);
    let lockSvc: any;
    if (opts.withLock) {
        const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 57127, username: 'postgres', password: 'qa2626', database: 'postgres' });
        await ds.initialize();
        lockSvc = new DistributedLockService(ds);
    } else {
        lockSvc = { acquire: async () => ({ release: async () => {} }) };
    }
    const reaper = new SandboxLeaseReaperService(repo, lockSvc, cfg);
    return { model, repo, mgr, reaper, env };
}
export async function doc(model: any, key: string) {
    const d = await model.findById(key).lean();
    if (!d) return null;
    const { _id, leaseCount, sandboxId, state, killAt, cleanupStatus, cleanupAttempts, cleanupStartedAt, killRetryCount, expiresAt, cleanupError } = d as any;
    return { _id, leaseCount, sandboxId, state, killAt, cleanupStatus, cleanupAttempts, cleanupStartedAt, killRetryCount, expiresAt, cleanupError };
}
export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';
export const REPO = '33333333-3333-4333-8333-333333333333';
export const graphKey = (org = ORG_A, job = '44444444-4444-4444-8444-' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0')) => `${org}:${REPO}:graph:${job}`;
export const cloneParams = { cloneUrl: 'https://example.invalid/r.git', authToken: '', branch: 'main', platform: 'github', sandboxMetadata: { stage: 'graph-build' } } as any;
export async function done(code = 0) { await mongoose.disconnect().catch(() => {}); process.exit(code); }
