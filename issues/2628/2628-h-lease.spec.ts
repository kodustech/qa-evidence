/**
 * QA #2628 harness H (lease level). Real SandboxLeaseManager + real
 * SandboxLeaseRepository on a disposable MongoDB (localhost:57017); only the
 * E2B SDK statics and the sandbox provider are stubbed. Runs unchanged at the
 * candidate (78998e1d5) and the control (cb2d2bb46); every test appends JSONL
 * events to $H_OUT.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import mongoose from 'mongoose';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';

const LOGS: any[] = [];
jest.mock('@libs/core/log/logger', () => ({
    createLogger: (name: string) => {
        const push = (level: string) => (o: any) =>
            (globalThis as any).__QA_LOGS.push({ t: Date.now(), level, name, message: o?.message, metadata: o?.metadata });
        const w = (level: string) => (o: any) => { push(level)(o); if (o?.error) (globalThis as any).__QA_LOGS.push({ name, level, message: 'ERR ' + String(o.error?.stack ?? o.error).slice(0, 600) }); };
        return { log: w('info'), info: w('info'), warn: w('warn'), error: w('error'), debug: w('debug') };
    },
}));
(globalThis as any).__QA_LOGS = LOGS;

const e2b = {
    setTimeout: jest.fn(async (..._a: any[]) => undefined),
    kill: jest.fn(async (..._a: any[]) => true),
    connect: jest.fn(async (id: string) => fakeE2B(id)),
};
jest.mock('e2b', () => ({
    ...jest.requireActual('e2b'),
    Sandbox: {
        setTimeout: (...a: any[]) => (e2b.setTimeout as any)(...a),
        kill: (...a: any[]) => (e2b.kill as any)(...a),
        connect: (...a: any[]) => (e2b.connect as any)(...a),
    },
}));

const REV = process.env.H_REV || 'unknown';
const OUT = process.env.H_OUT || path.join(os.tmpdir(), 'h-lease.jsonl');
const ev = (test: string, event: string, data: any = {}) =>
    fs.appendFileSync(OUT, JSON.stringify({ rev: REV, test, event, at: new Date().toISOString(), ...data }) + '\n');

function fakeE2B(id: string): any {
    return {
        sandboxId: id,
        commands: { run: jest.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })) },
        files: { read: jest.fn(async (p: string) => `content of ${p}`), write: jest.fn(async () => undefined) },
    };
}

let seq = 0;
const ORG_A = '11111111-2628-4aaa-8aaa-000000000001';
const ORG_B = '22222222-2628-4bbb-8bbb-000000000002';
const key = (org = ORG_A, repo = 'r1', pr: string | number = ++seq) => `${org}:${repo}:${pr}`;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void };
const deferred = <T = void>(): Deferred<T> => {
    let resolve!: (v: T) => void, reject!: (e: any) => void;
    const promise = new Promise<T>((r, j) => ((resolve = r), (reject = j)));
    return { promise, resolve, reject };
};

function makeInstance(id: string, over: any = {}) {
    const calls: string[] = [];
    const inst: any = {
        type: 'e2b',
        sandboxId: id,
        repoDir: '/home/user/repo',
        baseBranch: 'main',
        remoteCommands: {
            grep: jest.fn(async (...a: any[]) => (calls.push('grep'), { matches: a })),
            read: jest.fn(async (p: string) => (calls.push('read'), `read ${p}`)),
            listDir: jest.fn(async () => (calls.push('listDir'), ['a'])),
            notAFunction: 42,
        },
        cleanup: jest.fn(async () => undefined),
        run: jest.fn(async (c: string) => (calls.push('run'), { stdout: c, stderr: '', exitCode: c === 'fail' ? 3 : 0 })),
        readFile: jest.fn(async (p: string) => (calls.push('readFile'), `file ${p}`)),
        writeFile: jest.fn(async () => void calls.push('writeFile')),
        ...over,
    };
    return { inst, calls };
}

let conn: typeof mongoose;
let model: any;
let repo: SandboxLeaseRepository;
const config = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;

function manager(provider?: any) {
    const p = provider ?? {
        isAvailable: () => true,
        createSandboxWithRepo: jest.fn(async () => makeInstance('sbx-' + ++seq).inst),
    };
    return new SandboxLeaseManager(p, repo, config);
}

beforeAll(async () => {
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_h_${REV}?directConnection=true`);
    model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    await model.deleteMany({});
    repo = new SandboxLeaseRepository(model);
});
afterAll(async () => {
    await conn.disconnect();
});
beforeEach(() => {
    LOGS.length = 0;
    e2b.setTimeout.mockReset().mockImplementation(async () => undefined);
    e2b.kill.mockReset().mockImplementation(async () => true);
    e2b.connect.mockReset().mockImplementation(async (id: string) => fakeE2B(id));
});

afterEach(() => jest.restoreAllMocks());
jest.setTimeout(20_000);
const logs = (re: RegExp) => LOGS.filter((l) => re.test(l.message ?? ''));
const doc = (k: string) => model.findById(k).lean();

describe(`H lease harness @${REV}`, () => {
    it('M3 slow decrement: stage snapshot before the Mongo writes, then the release completes', async () => {
        const T = 'M3';
        const mgr = manager();
        const k = key();
        const { sandbox, leaseId } = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        await sandbox.readFile('a.ts');
        const gate = deferred<void>();
        const realDec = repo.decrementLease.bind(repo);
        const spy = jest.spyOn(repo, 'decrementLease').mockImplementationOnce(async (pk: string) => {
            await gate.promise;
            return realDec(pk);
        });
        const p = mgr.release(leaseId, { idleMs: 30_000 });
        const snap1 = (sandbox as any).usage?.();
        ev(T, 'snapshot-during-release', { usage: snap1 });
        gate.resolve();
        await p;
        const snap2 = (sandbox as any).usage?.();
        const d = await doc(k);
        ev(T, 'after-release', { usage: snap2, killAt: d?.killAt, leaseCount: d?.leaseCount });
        spy.mockRestore();
        expect(snap1?.releasedAt).toBeDefined();
        expect(snap1?.stopAt).toBeUndefined();
        expect(new Date(snap2.stopAt).getTime()).toBe(new Date(d.killAt).getTime());
        expect(d.leaseCount).toBe(0);
    });

    it('M17 null provider, failed acquire, missing optional commands', async () => {
        const T = 'M17';
        const nullMgr = manager({ isAvailable: () => false, createSandboxWithRepo: jest.fn() });
        const k = key();
        const r = await nullMgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        ev(T, 'null-acquire', { type: r.sandbox.type, hasUsage: typeof (r.sandbox as any).usage });
        await r.sandbox.cleanup();
        const d = await doc(k);
        ev(T, 'null-release', { leaseCount: d?.leaseCount });
        expect(r.sandbox.type).toBe('null');
        expect((r.sandbox as any).usage).toBeUndefined();
        expect(d.leaseCount).toBe(0);

        const failMgr = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => { throw new Error('create failed'); }) });
        const k2 = key();
        let err: any;
        try { await failMgr.acquire(k2, 'review', undefined, { cloneUrl: 'x' } as any); } catch (e) { err = e; }
        ev(T, 'failed-acquire', { error: String(err?.message), useMapSize: (failMgr as any).leaseIdToUse?.size ?? null, doc: await doc(k2) });
        expect(String(err?.message)).toContain('create failed');
        expect((failMgr as any).leaseIdToUse?.size ?? 0).toBe(0);
        const { RateLimitError } = jest.requireActual('e2b');
        const rlMgr = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => { throw new RateLimitError('429 concurrent sandboxes'); }) });
        const k4 = key();
        let err4: any;
        const createCalls = () => (rlMgr as any).sandboxProvider.createSandboxWithRepo.mock.calls.length;
        try { await rlMgr.acquire(k4, 'review', undefined, { cloneUrl: 'x' } as any, { signal: AbortSignal.timeout(3000) }); } catch (e) { err4 = e; }
        ev(T, 'rate-limited-acquire', { errorName: err4?.constructor?.name, error: String(err4?.message), typeErrors: LOGS.filter((l) => /instanceof|TypeError/.test(l.message ?? '')).length, useMapSize: (rlMgr as any).leaseIdToUse?.size ?? null, createAttempts: createCalls(), doc: await doc(k4), circuit: (rlMgr as any).createCircuit?.state ?? (rlMgr as any).createCircuit?.snapshot?.() ?? null });
        expect(String(err4?.message)).not.toMatch(/instanceof/);
        expect((rlMgr as any).leaseIdToUse?.size ?? 0).toBe(0);

        const partial = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => { const { inst } = makeInstance('sbx-partial-' + ++seq); delete inst.run; delete inst.writeFile; return inst; }) });
        const k3 = key();
        const r3 = await partial.acquire(k3, 'review', undefined, { cloneUrl: 'x' } as any);
        ev(T, 'partial-capabilities', { hasRun: 'run' in r3.sandbox && !!(r3.sandbox as any).run, hasWrite: !!(r3.sandbox as any).writeFile, nonFunctionKept: (r3.sandbox.remoteCommands as any).notAFunction });
        expect((r3.sandbox as any).run).toBeUndefined();
        expect((r3.sandbox as any).writeFile).toBeUndefined();
        expect((r3.sandbox.remoteCommands as any).notAFunction).toBe(42);
        await r3.sandbox.cleanup();
    });

    it('M24 command in flight at release, late commands, rejected late command', async () => {
        const T = 'M24';
        const slow = deferred<string>();
        const prov = { isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => makeInstance('sbx-' + ++seq, { readFile: jest.fn(async (p: string) => (p === 'slow' ? slow.promise : p === 'bad' ? Promise.reject(new Error('ENOENT bad')) : `file ${p}`)) }).inst) };
        const mgr = manager(prov);
        const { sandbox, leaseId } = await mgr.acquire(key(), 'review', undefined, { cloneUrl: 'x' } as any);
        await sandbox.readFile('first');
        const inflight = sandbox.readFile('slow');
        await new Promise((r) => setTimeout(r, 15));
        await mgr.release(leaseId, { idleMs: 30_000 });
        const atRelease = (sandbox as any).usage?.();
        await new Promise((r) => setTimeout(r, 15));
        slow.resolve('slow-done');
        const v = await inflight;
        const late1 = await sandbox.readFile('late1');
        const late2 = await sandbox.run('echo late2');
        let lateErr: any;
        try { await sandbox.readFile('bad'); } catch (e) { lateErr = e; }
        const after = (sandbox as any).usage?.();
        const warns = logs(/used after release/);
        ev(T, 'result', { atRelease, after, inflight: v, late1, late2: late2.stdout, lateErr: String(lateErr?.message), warnCount: warns.length, warnLevel: warns[0]?.level });
        expect(v).toBe('slow-done');
        expect(late1).toBe('file late1');
        expect(String(lateErr?.message)).toContain('ENOENT');
        expect(after.lastUsedAt).toEqual(atRelease.lastUsedAt);
        expect(warns).toHaveLength(1);
        expect(warns[0].level).toBe('warn');
    });

    it('M25 idle policies per consumer (graph idleMs 0, conversation default, review 30s)', async () => {
        const T = 'M25';
        const mgr = manager();
        const out: any = {};
        for (const [consumer, opts] of [['graph-build', { idleMs: 0 }], ['conversation', undefined], ['review', { idleMs: 30_000 }]] as const) {
            const k = key();
            const { leaseId } = await mgr.acquire(k, consumer, undefined, { cloneUrl: 'x' } as any);
            const t0 = Date.now();
            await mgr.release(leaseId, opts as any);
            const d = await doc(k);
            out[consumer] = { killAtOffsetMs: d?.killAt ? new Date(d.killAt).getTime() - t0 : null, killCalls: e2b.kill.mock.calls.length, docGone: !d, releasedConsumer: logs(/released leaseId/).slice(-1)[0]?.metadata?.consumer };
            e2b.kill.mockClear();
        }
        ev(T, 'policies', out);
        expect(out['graph-build'].killCalls).toBe(1);
        expect(out.conversation.killAtOffsetMs).toBeGreaterThan(295_000);
        expect(out.review.killAtOffsetMs).toBeGreaterThanOrEqual(29_000);
        expect(out.review.killAtOffsetMs).toBeLessThan(31_000);
    });

    it('M27 decrement rejected / applied-but-lost / setKillAt rejected, with a co-holder', async () => {
        const T = 'M27';
        const res: any = {};
        // (a) decrement rejected before apply, through the real CreateSandboxStage closure
        {
            const mgr = manager();
            const k = key();
            const b = await mgr.acquire(k, 'conversation', undefined, { cloneUrl: 'x' } as any);
            const stage = new CreateSandboxStage(mgr as any, { resolve: jest.fn(async () => ({ url: 'https://example/repo', authToken: 't', platform: 'github', branch: 'b', prNumber: 1 })) } as any);
            const ctx: any = { organizationAndTeamData: { organizationId: k.split(':')[0], teamId: 't' }, repository: { id: k.split(':')[1] }, pullRequest: { number: Number(k.split(':')[2]) }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {} };
            const out = await (stage as any).executeStage(ctx);
            const handle = out.sandboxHandle;
            const mid = await doc(k);
            const dec = jest.spyOn(repo, 'decrementLease').mockRejectedValueOnce(new Error('mongo down'));
            const r1 = await handle.cleanup().then(() => 'ok', (e: any) => 'rejected:' + e.message);
            const r2 = await handle.cleanup().then(() => 'ok', (e: any) => 'rejected:' + e.message);
            const d = await doc(k);
            res.a = { viaRealStageClosure: true, countBefore: mid.leaseCount, r1, r2, decrementCalls: dec.mock.calls.length, leaseCount: d.leaseCount, usage: handle.usage?.(), unknownLease: logs(/unknown leaseId/).length };
            dec.mockRestore();
            await b.sandbox.cleanup();
        }
        // (b) applied, response lost
        {
            const mgr = manager();
            const k = key();
            const a = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
            const b = await mgr.acquire(k, 'conversation');
            const real = repo.decrementLease.bind(repo);
            jest.spyOn(repo, 'decrementLease').mockImplementationOnce(async (pk: string) => { await real(pk); throw new Error('socket closed after write'); });
            const r1 = await mgr.release(a.leaseId, { idleMs: 30_000 }).then(() => 'ok', (e: any) => 'rejected:' + e.message);
            const d = await doc(k);
            res.b = { r1, leaseCountAfter: d.leaseCount, coHolderIntact: d.leaseCount === 1 };
            await b.sandbox.cleanup();
            res.b.final = (await doc(k))?.leaseCount;
        }
        // (c) setKillAt rejected after a successful decrement
        {
            const mgr = manager();
            const k = key();
            const a = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
            jest.spyOn(repo, 'setKillAt').mockRejectedValueOnce(new Error('mongo blip'));
            const r1 = await mgr.release(a.leaseId, { idleMs: 30_000 }).then(() => 'ok', (e: any) => 'rejected:' + e.message);
            const d = await doc(k);
            res.c = { r1, leaseCount: d.leaseCount, killAt: d.killAt ?? null, expiresAt: d.expiresAt, usage: (a.sandbox as any).usage?.(), setTimeoutCalls: e2b.setTimeout.mock.calls.length };
        }
        ev(T, 'result', res);
        expect(res.a.r1).toMatch(/rejected/);
        expect(res.a.r2).toBe(res.a.r1);
        expect(res.a.leaseCount).toBe(2);
        expect(res.a.decrementCalls).toBe(1);
        expect(res.b.coHolderIntact).toBe(true);
        expect(res.c.r1).toMatch(/rejected/);
    });

    it('M30 stage and observer cleanup overlap: one decrement, observer waits', async () => {
        const T = 'M30';
        const mgr = manager();
        const k = key();
        const conv = await mgr.acquire(k, 'conversation', undefined, { cloneUrl: 'x' } as any);
        const resolver = { resolve: jest.fn(async () => ({ url: 'https://example/repo', authToken: 't', platform: 'github', branch: 'b', prNumber: 1 })) };
        const stage = new CreateSandboxStage(mgr as any, resolver as any);
        const ctx: any = { organizationAndTeamData: { organizationId: k.split(':')[0], teamId: 't' }, repository: { id: k.split(':')[1] }, pullRequest: { number: Number(k.split(':')[2]) }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {}, statusInfo: { status: 'success' } };
        ev(T,'dbg-before-stage');
        const out = await (stage as any).executeStage(ctx);
        ev(T,'dbg-after-stage',{hasHandle:!!out.sandboxHandle, logs: LOGS.map(l=>[l.name,l.level,l.message, String((l as any).metadata?.error ?? '')])});
        const handle = out.sandboxHandle;
        const real = repo.decrementLease.bind(repo);
        const gate = deferred<void>();
        let decCalls = 0;
        jest.spyOn(repo, 'decrementLease').mockImplementation(async (pk: string) => { decCalls++; await gate.promise; return real(pk); });
        const order: string[] = [];
        const stageRelease = handle.cleanup().then(() => order.push('stage-release-settled'));
        const anyFn: any = new Proxy({}, { get: () => jest.fn(async () => undefined) });
        const observer = new CodeReviewPipelineObserver(anyFn, anyFn);
        const obs = (observer as any).onPipelineFinish(out, {} as any).then(() => order.push('observer-settled'));
        await new Promise((r) => setTimeout(r, 30));
        order.push('gate-open');
        gate.resolve();
        await Promise.race([Promise.all([stageRelease, obs]), new Promise((r) => setTimeout(r, 3000))]);
        ev(T,'dbg-after-all',{order});
        await handle.cleanup();
        (repo.decrementLease as any).mockRestore();
        const d = await doc(k);
        ev(T, 'result', { order, decCalls, leaseCount: d.leaseCount, killAt: d.killAt ?? null });
        expect(decCalls).toBe(1);
        expect(order[0]).toBe('gate-open');
        expect(d.leaseCount).toBe(1);
        expect(d.killAt ?? null).toBeNull();
        await conv.sandbox.cleanup();
    });

    it('M32 E2B setTimeout hangs or fails: release does not wait, WARN only, durable killAt', async () => {
        const T = 'M32';
        const mgr = manager();
        const k = key();
        const a = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        e2b.setTimeout.mockImplementationOnce(() => new Promise(() => {}));
        const t0 = Date.now();
        const raced = await Promise.race([mgr.release(a.leaseId, { idleMs: 30_000 }).then(() => 'released'), new Promise((r) => setTimeout(() => r('timeout-2s'), 2000))]);
        const hangMs = Date.now() - t0;
        const d = await doc(k);
        const k2 = key();
        const b = await mgr.acquire(k2, 'review', undefined, { cloneUrl: 'x' } as any);
        e2b.setTimeout.mockImplementationOnce(async () => { throw Object.assign(new Error('503 Service Unavailable'), { status: 503 }); });
        await mgr.release(b.leaseId, { idleMs: 30_000 });
        await new Promise((r) => setTimeout(r, 20));
        const warn = logs(/failed to set E2B-side idle timeout/);
        const d2 = await doc(k2);
        ev(T, 'result', { raced, hangMs, killAt: d.killAt, warnCount: warn.length, warnLevel: warn[0]?.level, killAt503: d2.killAt, errors: LOGS.filter((l) => l.level === 'error').length });
        expect(raced).toBe('released');
        expect(d.killAt).toBeTruthy();
        expect(warn).toHaveLength(1);
        expect(warn[0].level).toBe('warn');
        expect(d2.killAt).toBeTruthy();
    });

    it('M33 wrapped commands keep their semantics; timestamps cover overlap; usage bounded', async () => {
        const T = 'M33';
        const big = 'x'.repeat(5 * 1024 * 1024);
        const d1 = deferred<string>(), d2 = deferred<string>();
        const { inst } = makeInstance('sbx-' + ++seq, {
            readFile: jest.fn(async (p: string) => (p === 'empty' ? '' : p === 'big' ? big : p === 'o1' ? d1.promise : p === 'o2' ? d2.promise : p === 'rej' ? Promise.reject(Object.assign(new Error('EACCES'), { code: 'EACCES' })) : `file ${p}`)),
        });
        const mgr = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => inst) });
        const { sandbox, leaseId } = await mgr.acquire(key(), 'review', undefined, { cloneUrl: 'x' } as any);
        const res: any = {};
        res.empty = await sandbox.readFile('empty');
        res.unicode = await sandbox.readFile('qa2628/Ginástica/ção ✓ 测试.cs');
        res.bigLen = (await sandbox.readFile('big')).length;
        res.nonzero = await sandbox.run('fail');
        try { await sandbox.readFile('rej'); } catch (e: any) { res.rejCode = e.code; }
        res.grepArgs = await (sandbox.remoteCommands as any).grep('pat', { glob: '*.ts' });
        res.optsPassed = (inst.readFile as jest.Mock).mock.calls.length;
        const before = (sandbox as any).usage();
        const p1 = sandbox.readFile('o1');
        await new Promise((r) => setTimeout(r, 10));
        const p2 = sandbox.readFile('o2');
        await new Promise((r) => setTimeout(r, 10));
        d2.resolve('two');
        await p2;
        const afterTwo = (sandbox as any).usage();
        await new Promise((r) => setTimeout(r, 10));
        d1.resolve('one');
        await p1;
        const afterOne = (sandbox as any).usage();
        const usageBytes = JSON.stringify((sandbox as any).usage()).length;
        await mgr.release(leaseId, { idleMs: 30_000 });
        const relLog = logs(/released leaseId/).slice(-1)[0];
        ev(T, 'result', { ...res, nonzero: res.nonzero.exitCode, grepArgs: JSON.stringify(res.grepArgs).slice(0, 80), before, afterTwo, afterOne, usageBytes, releaseMetaKeys: Object.keys(relLog?.metadata ?? {}) });
        expect(res.empty).toBe('');
        expect(res.unicode).toBe('file qa2628/Ginástica/ção ✓ 测试.cs');
        expect(res.bigLen).toBe(5 * 1024 * 1024);
        expect(res.nonzero.exitCode).toBe(3);
        expect(res.rejCode).toBe('EACCES');
        expect(new Date(afterOne.lastUsedAt).getTime()).toBeGreaterThan(new Date(afterTwo.lastUsedAt).getTime());
        expect(usageBytes).toBeLessThan(400);
    });

    it('M34 stale release schedule after a new holder acquires between decrement and setKillAt', async () => {
        const T = 'M34';
        const A = manager(), B = manager();
        const k = key();
        const a = await A.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        const realSet = repo.setKillAt.bind(repo);
        const gate = deferred<void>();
        const spy = jest.spyOn(repo, 'setKillAt').mockImplementationOnce(async (pk: string, at: Date) => { await gate.promise; return realSet(pk, at); });
        const relA = A.release(a.leaseId, { idleMs: 30_000 });
        await new Promise((r) => setTimeout(r, 50));
        const afterDec = await doc(k);
        const b = await B.acquire(k, 'conversation');
        const afterJoin = await doc(k);
        gate.resolve();
        await relA;
        spy.mockRestore();
        const final = await doc(k);
        const ready = await repo.findReadyToKill(new Date(Date.now() + 31_000));
        const wouldKillNewHolder = ready.some((r: any) => r._id === k);
        ev(T, 'interleaving', { afterDec: { leaseCount: afterDec.leaseCount, killAt: afterDec.killAt ?? null }, afterJoin: { leaseCount: afterJoin.leaseCount, killAt: afterJoin.killAt ?? null }, final: { leaseCount: final.leaseCount, killAt: final.killAt ?? null }, idleCronAt31sWouldKill: wouldKillNewHolder, setTimeoutCalls: e2b.setTimeout.mock.calls.map((c) => c.slice(0, 2)), connectCalls: e2b.connect.mock.calls.length });
        await b.sandbox.cleanup();
        expect(final.leaseCount).toBe(1);
        expect(wouldKillNewHolder).toBe(false);
    });

    it('M35 isolation: same repo/PR numbers across two orgs, two PRs in one org, two holders on one key', async () => {
        const T = 'M35';
        const mgr = manager();
        const kA = key(ORG_A, 'r9', 7), kB = key(ORG_B, 'r9', 7), kA2 = key(ORG_A, 'r9', 8);
        const a = await mgr.acquire(kA, 'review', undefined, { cloneUrl: 'x' } as any);
        const b = await mgr.acquire(kB, 'review', undefined, { cloneUrl: 'x' } as any);
        const c = await mgr.acquire(kA2, 'review', undefined, { cloneUrl: 'x' } as any);
        const a2 = await mgr.acquire(kA, 'conversation');
        await a.sandbox.readFile('x');
        await new Promise((r) => setTimeout(r, 5));
        await b.sandbox.readFile('y');
        await mgr.release(a.leaseId, { idleMs: 30_000 });
        const docs = { A: await doc(kA), B: await doc(kB), A2: await doc(kA2) };
        const ub = (b.sandbox as any).usage(), ua = (a.sandbox as any).usage(), ua2 = (a2.sandbox as any).usage();
        ev(T, 'result', { sandboxes: { A: docs.A.sandboxId, B: docs.B.sandboxId, A2: docs.A2.sandboxId }, counts: { A: docs.A.leaseCount, B: docs.B.leaseCount, A2: docs.A2.leaseCount }, killAt: { A: docs.A.killAt ?? null, B: docs.B.killAt ?? null }, ua, ub, ua2, releaseLog: logs(/released leaseId/).map((l) => l.metadata) });
        expect(docs.A.sandboxId).not.toBe(docs.B.sandboxId);
        expect(docs.A.leaseCount).toBe(1);
        expect(docs.B.leaseCount).toBe(1);
        expect(ub.releasedAt).toBeUndefined();
        expect(ua2.firstUsedAt).toBeUndefined();
        for (const l of logs(/released leaseId/)) expect(JSON.stringify(l.metadata)).not.toMatch(/token|password|content of|file /i);
        await b.sandbox.cleanup(); await c.sandbox.cleanup(); await a2.sandbox.cleanup();
    });

    it('M37 pre-change READY lease doc and mixed holders keep valid counts', async () => {
        const T = 'M37';
        const k = key();
        await model.create({ _id: k, sandboxId: 'sbx-legacy', state: 'READY', leaseCount: 1, createdAt: new Date(), expiresAt: new Date(Date.now() + 1800_000), organizationId: k.split(':')[0] });
        const mgr = manager();
        const n = await mgr.acquire(k, 'conversation', undefined, undefined);
        const mid = await doc(k);
        await mgr.release(n.leaseId);
        const after = await doc(k);
        ev(T, 'result', { joined: e2b.connect.mock.calls.length, mid: mid.leaseCount, after: after.leaseCount, killAt: after.killAt ?? null, usage: (n.sandbox as any).usage?.() });
        expect(mid.leaseCount).toBe(2);
        expect(after.leaseCount).toBe(1);
        expect(after.killAt ?? null).toBeNull();
    });


    it('M8 join at +3s after a review release; read past the old deadline; request order of setTimeout vs connect', async () => {
        const T = 'M8';
        const A = manager(), B = manager();
        const k = key();
        const a = await A.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        await a.sandbox.readFile('x');
        const order: string[] = [];
        let finishSetTimeout!: () => void;
        e2b.setTimeout.mockImplementationOnce((...args: any[]) => { order.push(`setTimeout-sent(${args[1]})`); return new Promise<void>((r) => (finishSetTimeout = () => { order.push('setTimeout-completed'); r(); })); });
        e2b.connect.mockImplementationOnce(async (id: string) => { order.push('connect-sent(default 300s)'); const s = fakeE2B(id); order.push('connect-completed'); return s; });
        await A.release(a.leaseId, { idleMs: 30_000 });
        const scheduled = await doc(k);
        await new Promise((r) => setTimeout(r, 30)); // stands for +3s
        const b = await B.acquire(k, 'conversation');
        const afterJoin = await doc(k);
        finishSetTimeout(); // the fire-and-forget E2B request lands after the joiner's connect
        await new Promise((r) => setTimeout(r, 10));
        const read = await b.sandbox.readFile('after-old-deadline');
        await B.release(b.leaseId);
        const afterB = await doc(k);
        ev(T, 'result', { order, scheduledKillAt: scheduled.killAt, afterJoin: { leaseCount: afterJoin.leaseCount, killAt: afterJoin.killAt ?? null }, read, afterB: { leaseCount: afterB.leaseCount, killAtOffsetMs: afterB.killAt ? new Date(afterB.killAt).getTime() - Date.now() : null } });
        expect(afterJoin.killAt ?? null).toBeNull();
        expect(afterB.killAt).toBeTruthy();
    });

    it('M12 PR close during the idle window, replacement sandbox, stale cleanup', async () => {
        const T = 'M12';
        const { SandboxLeaseReaperService } = require('@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service');
        const mgr = manager();
        const k = key();
        const a = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
        const oldId = (a.sandbox as any).sandboxId;
        await mgr.release(a.leaseId, { idleMs: 30_000 }); // review released, idle window open
        await mgr.invalidate(k); // PR closed / force-pushed during the window
        const afterInvalidate = await doc(k);
        const retired = await model.findById(`${k.split(':')[0]}:retired:${oldId}`).lean();
        const b = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any); // replacement
        const newId = (b.sandbox as any).sandboxId;
        // close before the inner finally: invalidate while B still holds, then B releases late
        await mgr.invalidate(k);
        await mgr.release(b.leaseId, { idleMs: 30_000 });
        const retiredB = await model.findById(`${k.split(':')[0]}:retired:${newId}`).lean();
        // advance: make the old retired doc due and run the real idle-kill cron
        await model.updateOne({ _id: `${k.split(':')[0]}:retired:${oldId}` }, { $set: { killAt: new Date(Date.now() - 1000) } });
        const reaper = new SandboxLeaseReaperService(repo, { acquire: async () => ({ release: async () => undefined }) } as any, config);
        await reaper.killIdleSandboxes();
        const killed = e2b.kill.mock.calls.map((c: any[]) => c[0]);
        ev(T, 'result', { oldId, newId, afterInvalidate, retiredOld: retired ? { killAt: retired.killAt } : null, retiredNew: retiredB ? { killAt: retiredB.killAt } : null, killed, releaseLogs: logs(/released leaseId/).map((l) => l.message) });
        expect(oldId).not.toBe(newId);
        expect(killed).toContain(oldId);
        expect(killed).not.toContain(newId);
    });

    it('M43 1000 acquire/release cycles drain the per-process maps', async () => {
        const T = 'M43';
        const mgr = manager();
        const k = key();
        const t0 = Date.now();
        for (let i = 0; i < 1000; i++) {
            const r = await mgr.acquire(k, 'review', undefined, { cloneUrl: 'x' } as any);
            await r.sandbox.readFile('a');
            await mgr.release(r.leaseId, { idleMs: 30_000 });
        }
        const sizes = { leaseIdToPrKey: (mgr as any).leaseIdToPrKey.size, leaseIdToUse: (mgr as any).leaseIdToUse?.size ?? null, leaseIdToSlot: (mgr as any).leaseIdToSlot.size, prKeySlots: (mgr as any).prKeySlots.size };
        ev(T, 'result', { sizes, ms: Date.now() - t0, heapMB: Math.round(process.memoryUsage().heapUsed / 1e6) });
        expect(sizes.leaseIdToPrKey).toBe(0);
        expect(sizes.leaseIdToUse ?? 0).toBe(0);
    }, 120_000);
});
