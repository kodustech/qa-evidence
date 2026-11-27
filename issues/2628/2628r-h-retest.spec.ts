/**
 * QA #2628 retest harness (lease level). Real SandboxLeaseManager, real
 * SandboxLeaseRepository and real SandboxLeaseReaperService on a disposable
 * MongoDB (localhost:57017). Releases go through the handle returned by the
 * real CreateSandboxStage.executeStage (real REVIEW_IDLE_TIMEOUT_MS); joiners
 * use the conversation's acquire arguments ('conversation', 5 min TTL, clone
 * params); prKeys come from the real buildPrKey. Only the E2B SDK statics and
 * the sandbox provider are stubbed. Runs unchanged at 3c800a052 (cand) and
 * aeb08f11f (ctrl); every test appends JSONL events to $H_OUT.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import mongoose from 'mongoose';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseReaperService } from '@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { buildPrKey } from '@libs/sandbox/domain/contracts/sandbox-lease-manager.contract';

const LOGS: any[] = [];
jest.mock('@libs/core/log/logger', () => ({
    createLogger: (name: string) => {
        const w = (level: string) => (o: any) => {
            (globalThis as any).__QA_LOGS.push({ t: Date.now(), level, name, message: o?.message, metadata: o?.metadata });
            if (o?.error) (globalThis as any).__QA_LOGS.push({ t: Date.now(), name, level, message: 'ERR ' + String(o.error?.stack ?? o.error).slice(0, 400) });
        };
        return { log: w('info'), info: w('info'), warn: w('warn'), error: w('error'), debug: w('debug'), verbose: w('debug') };
    },
}));
(globalThis as any).__QA_LOGS = LOGS;

// E2B SDK statics: every call is recorded with its start and its settle time.
const E2B: any[] = [];
const e2b = {
    setTimeout: jest.fn(async (..._a: any[]) => undefined as any),
    kill: jest.fn(async (..._a: any[]) => true as any),
    connect: jest.fn(async (id: string) => fakeE2B(id)),
    list: jest.fn((..._a: any[]) => ({ hasNext: false, nextItems: async () => [] as any[] })),
};
const rec = (op: string, impl: (...a: any[]) => any) => async (...a: any[]) => {
    const entry: any = { op, args: a.slice(0, 2).map((x) => (typeof x === 'object' ? '[opts]' : x)), startedAt: Date.now() };
    E2B.push(entry);
    try { const r = await impl(...a); entry.settledAt = Date.now(); return r; } catch (e: any) { entry.settledAt = Date.now(); entry.error = String(e?.message ?? e); throw e; }
};
jest.mock('e2b', () => {
    const actual = jest.requireActual('e2b');
    return {
        ...actual,
        Sandbox: {
            setTimeout: (...a: any[]) => rec('setTimeout', e2b.setTimeout)(...a),
            kill: (...a: any[]) => rec('kill', e2b.kill)(...a),
            connect: (...a: any[]) => rec('connect', e2b.connect)(...a),
            list: (...a: any[]) => (e2b.list as any)(...a),
        },
    };
});

const REV = process.env.H_REV || 'unknown';
const OUT = process.env.H_OUT || path.join(os.tmpdir(), 'h-retest.jsonl');
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
const ORG = '11111111-2628-4aaa-8aaa-000000000001';
const REPO = '1468014267';
const prNum = () => 1000 + ++seq;
const prKeyOf = (n: number) => buildPrKey(ORG, REPO, n);
const CLONE = { cloneUrl: 'https://example.invalid/r.git', platform: 'github', branch: 'b', prNumber: 1 } as any;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
const deferred = <T = void>(): Deferred<T> => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function instance(id: string, over: any = {}) {
    return {
        type: 'e2b', sandboxId: id, repoDir: '/home/user/repo', baseBranch: 'main',
        remoteCommands: { read: jest.fn(async (p: string) => `read ${p}`), grep: jest.fn(async () => ({ matches: [] })), listDir: jest.fn(async () => ['a']) },
        cleanup: jest.fn(async () => undefined),
        run: jest.fn(async (c: string) => ({ stdout: c, stderr: '', exitCode: 0 })),
        readFile: jest.fn(async (p: string) => `file ${p}`),
        writeFile: jest.fn(async () => undefined),
        ...over,
    };
}

let conn: typeof mongoose;
let model: any;
let repo: SandboxLeaseRepository;
const withKey = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;
const noKey = { get: (_k: string) => undefined } as any;

const providerOf = (make?: () => any) => ({
    isAvailable: () => true,
    createSandboxWithRepo: jest.fn(async () => (make ? make() : instance('sbx-' + REV + '-' + ++seq))),
});
const manager = (provider?: any, config = withKey, concurrency?: any) =>
    new SandboxLeaseManager(provider ?? providerOf(), repo, config, concurrency);
const lock = { acquire: async () => ({ release: async () => undefined }) } as any;
const reaper = (config = withKey) => new SandboxLeaseReaperService(repo, lock, config);

/** A review through the real CreateSandboxStage: returns its handle (cleanup = the stage's release closure). */
async function stageAcquire(mgr: SandboxLeaseManager, n: number) {
    const resolver = { resolve: jest.fn(async () => ({ url: 'https://example.invalid/r.git', authToken: 't', platform: 'github', branch: 'b', prNumber: n })) };
    const stage = new CreateSandboxStage(mgr as any, resolver as any);
    const ctx: any = { organizationAndTeamData: { organizationId: ORG, teamId: 't' }, repository: { id: REPO }, pullRequest: { number: n }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {} };
    const out = await (stage as any).executeStage(ctx);
    if (!out.sandboxHandle) throw new Error('stage gave no handle: ' + JSON.stringify(LOGS.slice(-5).map((l) => l.message)));
    return out.sandboxHandle;
}
const conversationAcquire = (mgr: SandboxLeaseManager, k: string) => mgr.acquire(k, 'conversation', 5 * 60 * 1000, CLONE);

beforeAll(async () => {
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628r_${REV}_${process.pid}?directConnection=true`);
    model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    await model.deleteMany({});
    repo = new SandboxLeaseRepository(model);
});
afterAll(async () => {
    await conn.connection.db?.dropDatabase().catch(() => undefined);
    await conn.disconnect();
});
beforeEach(() => {
    LOGS.length = 0;
    E2B.length = 0;
    e2b.setTimeout.mockReset().mockImplementation(async () => undefined);
    e2b.kill.mockReset().mockImplementation(async () => true);
    e2b.connect.mockReset().mockImplementation(async (id: string) => fakeE2B(id));
    e2b.list.mockReset().mockImplementation(() => ({ hasNext: false, nextItems: async () => [] }));
});
afterEach(() => jest.restoreAllMocks());
jest.setTimeout(60_000);
const logs = (re: RegExp) => LOGS.filter((l) => re.test(l.message ?? ''));
const doc = (k: string) => model.findById(k).lean();
const slim = (d: any) => (d ? { leaseCount: d.leaseCount, killAt: d.killAt ?? null, sandboxId: d.sandboxId, state: d.state, killRetryCount: d.killRetryCount } : null);
const waitFor = async (cond: () => Promise<boolean> | boolean, ms = 10_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await cond()) return true; await sleep(20); }
    return false;
};
const e2bCalls = (id?: string) => E2B.filter((c) => !id || c.args[0] === id);

describe(`retest lease harness @${REV}`, () => {
    it('R1 M34 form 1: setKillAt lands after a joiner', async () => {
        const T = 'R1';
        const A = manager(), B = manager();
        const n = prNum(); const k = prKeyOf(n);
        const handle = await stageAcquire(A, n);
        await handle.readFile('a.ts');
        const sbx = (await doc(k)).sandboxId;
        const realSet = repo.setKillAt.bind(repo);
        const gate = deferred<void>();
        let setKillAtReturned: any = 'not-called';
        jest.spyOn(repo, 'setKillAt').mockImplementationOnce(async (pk: string, at: Date) => {
            await gate.promise;
            const r = await realSet(pk, at);
            setKillAtReturned = r === undefined ? 'void' : r;
            return r as any;
        });
        await sleep(1100); // outside the in-flight quiet window: the release gives back at once
        const rel = handle.cleanup();
        await waitFor(async () => (await doc(k))?.leaseCount === 0);
        const afterDec = slim(await doc(k));
        const b = await conversationAcquire(B, k);
        const afterJoin = slim(await doc(k));
        gate.resolve();
        await rel;
        await sleep(200);
        const final = slim(await doc(k));
        const ready = await repo.findReadyToKill(new Date(Date.now() + 31_000));
        const idleCronAt31sWouldKill = ready.some((r: any) => r._id === k);
        const out = {
            afterDec, afterJoin, final, setKillAtReturned, idleCronAt31sWouldKill,
            bConnected: e2bCalls(sbx).some((c) => c.op === 'connect'), bWasCreated: b.wasCreated,
            e2bCalls: e2bCalls(sbx).map((c) => ({ op: c.op, ms: c.args[1], startedAt: c.startedAt })),
            joinedLog: logs(/a holder joined before the idle-kill was scheduled/).length,
        };
        ev(T, 'interleaving', out);
        await b.sandbox.cleanup();
        expect(afterDec.leaseCount).toBe(0);
        expect(afterJoin.leaseCount).toBe(1);
        expect(final.leaseCount).toBe(1);
        expect(final.killAt).toBeNull();
        expect(e2bCalls(sbx).filter((c) => c.op === 'setTimeout' && c.args[1] === 30_000)).toHaveLength(0);
        expect(idleCronAt31sWouldKill).toBe(false);
    });

    it('R3 M34 form 2: the release idle timeout lands after the joiner connected', async () => {
        const T = 'R3';
        const A = manager(), B = manager();
        const n = prNum(); const k = prKeyOf(n);
        const handle = await stageAcquire(A, n);
        await handle.readFile('a.ts');
        const sbx = (await doc(k)).sandboxId;
        const gate = deferred<void>();
        const landed: any[] = [];
        let first = true;
        e2b.setTimeout.mockImplementation(async (id: string, ms: number) => {
            if (first) { first = false; await gate.promise; }
            landed.push({ op: 'setTimeout', ms, at: Date.now() });
        });
        e2b.connect.mockImplementation(async (id: string) => { landed.push({ op: 'connect', at: Date.now() }); return fakeE2B(id); });
        await sleep(1100);
        await handle.cleanup();
        const afterRelease = slim(await doc(k));
        const b = await conversationAcquire(B, k);
        const afterJoin = slim(await doc(k));
        gate.resolve();
        await waitFor(() => landed.filter((l) => l.op === 'setTimeout').length >= 2, 3000);
        await sleep(300);
        const restored = logs(/restored the sandbox timeout/);
        const out = { afterRelease, afterJoin, landedOrder: landed, lastLanded: landed.filter((l) => l.op === 'setTimeout').slice(-1)[0] ?? null, restored: restored.map((r) => r.metadata) };
        ev(T, 'order', out);
        await b.sandbox.cleanup();
        expect(afterRelease.killAt).not.toBeNull();
        expect(afterJoin.killAt).toBeNull();
        expect(landed[0].op).toBe('connect');
        expect(out.lastLanded.ms).toBeGreaterThanOrEqual(300_000);
        expect(restored).toHaveLength(1);
    });

    it('R5 M34 form 3: the cron read the lease as idle, then a holder joined', async () => {
        const T = 'R5';
        const A = manager(), B = manager();
        const n = prNum(); const k = prKeyOf(n);
        const a = await A.acquire(k, 'review', undefined, CLONE);
        const sbx = a.sandboxId;
        await A.release(a.leaseId, { idleMs: 50 });
        await sleep(120);
        const before = slim(await doc(k));
        const realFind = repo.findReadyToKill.bind(repo);
        const read = deferred<void>(), go = deferred<void>();
        jest.spyOn(repo, 'findReadyToKill').mockImplementationOnce(async (now: Date) => { const r = await realFind(now); read.resolve(); await go.promise; return r; });
        const tick = reaper().killIdleSandboxes();
        await read.promise;
        const b = await conversationAcquire(B, k);
        const afterJoin = slim(await doc(k));
        go.resolve();
        await tick;
        const final = slim(await doc(k));
        const out = { before, afterJoin, final, bSandbox: b.sandboxId, killCalls: e2bCalls().filter((c) => c.op === 'kill').map((c) => c.args[0]), killedHolder: e2bCalls(sbx).some((c) => c.op === 'kill'), holderJoinedLog: logs(/A holder joined before the kill/).length };
        ev(T, 'result', out);
        await b.sandbox.cleanup();
        expect(b.sandboxId).toBe(sbx);
        expect(out.killedHolder).toBe(false);
        expect(final?.leaseCount).toBe(1);
    });

    it('R5b M34 form 3: the cron resumes after the joiner incremented, before it cleared killAt', async () => {
        const T = 'R5b';
        const A = manager(), B = manager();
        const n = prNum(); const k = prKeyOf(n);
        const a = await A.acquire(k, 'review', undefined, CLONE);
        const sbx = a.sandboxId;
        await A.release(a.leaseId, { idleMs: 50 });
        await sleep(120);
        const realFind = repo.findReadyToKill.bind(repo);
        const read = deferred<void>(), go = deferred<void>();
        jest.spyOn(repo, 'findReadyToKill').mockImplementationOnce(async (now: Date) => { const r = await realFind(now); read.resolve(); await go.promise; return r; });
        const realClear = repo.clearKillAt.bind(repo);
        const clearGate = deferred<void>();
        jest.spyOn(repo, 'clearKillAt').mockImplementationOnce(async (pk: string) => { await clearGate.promise; return realClear(pk); });
        const tick = reaper().killIdleSandboxes();
        await read.promise;
        const bP = conversationAcquire(B, k);
        await waitFor(async () => (await doc(k))?.leaseCount === 1);
        const incrementedNotCleared = slim(await doc(k));
        go.resolve();
        await tick;
        clearGate.resolve();
        const b = await bP.catch((e: any) => ({ error: String(e?.message ?? e) } as any));
        const out = { incrementedNotCleared, bResult: b.error ? b : { sandboxId: b.sandboxId === sbx ? 'same' : 'other', wasCreated: b.wasCreated }, killedHolder: e2bCalls(sbx).some((c) => c.op === 'kill'), final: slim(await doc(k)), holderJoinedLog: logs(/A holder joined before the kill/).length };
        ev(T, 'result', out);
        if (!b.error) await b.sandbox.cleanup();
        expect(incrementedNotCleared.killAt).not.toBeNull();
        expect(out.killedHolder).toBe(false);
    });

    it('R6 detach wins, then a holder joins: it creates a new sandbox', async () => {
        const T = 'R6';
        if (typeof (repo as any).detachIdle !== 'function') { ev(T, 'n/a', { reason: 'no detachIdle at this revision' }); return; }
        const A = manager(), B = manager();
        const n = prNum(); const k = prKeyOf(n);
        const a = await A.acquire(k, 'review', undefined, CLONE);
        const old = a.sandboxId;
        await A.release(a.leaseId, { idleMs: 50 });
        await sleep(120);
        const realDetach = (repo as any).detachIdle.bind(repo);
        const detached = deferred<void>(), go = deferred<void>();
        jest.spyOn(repo as any, 'detachIdle').mockImplementationOnce(async (...args: any[]) => { const r = await realDetach(...args); detached.resolve(); await go.promise; return r; });
        const tick = reaper().killIdleSandboxes();
        await detached.promise;
        const retiredId = `${ORG}:retired:${old}`;
        const midRetired = slim(await doc(retiredId));
        const midPr = slim(await doc(k));
        const b = await conversationAcquire(B, k);
        const afterJoin = slim(await doc(k));
        go.resolve();
        await tick;
        const out = { midRetired, midPrDoc: midPr, bSandbox: b.sandboxId, bWasCreated: b.wasCreated, newDiffers: b.sandboxId !== old, connectToOld: e2bCalls(old).some((c) => c.op === 'connect'), afterJoin, retiredAfterKill: slim(await doc(retiredId)), killCalls: e2bCalls().filter((c) => c.op === 'kill').map((c) => c.args[0] === old ? 'old' : 'other'), creatorLog: logs(/creator path/).length };
        ev(T, 'result', out);
        await b.sandbox.cleanup();
        expect(midRetired).not.toBeNull();
        expect(midPr).toBeNull();
        expect(b.wasCreated).toBe(true);
        expect(out.connectToOld).toBe(false);
        expect(afterJoin.leaseCount).toBe(1);
        expect(afterJoin.killAt).toBeNull();
        expect(out.retiredAfterKill).toBeNull();
    });

    it('R8 retire and re-create: the old holder release does not take the new count', async () => {
        const T = 'R8';
        const res: any = {};
        // (a) joiner's connect fails, it retires and cold-creates
        {
            const A = manager(), B = manager();
            const n = prNum(); const k = prKeyOf(n);
            const a = await A.acquire(k, 'review', undefined, CLONE);
            e2b.connect.mockImplementationOnce(async () => { throw new Error('sandbox not found'); });
            const b = await conversationAcquire(B, k);
            const afterB = slim(await doc(k));
            await A.release(a.leaseId, { idleMs: 30_000 });
            const final = slim(await doc(k));
            res.a = { old: 'A', newIsDifferent: b.sandboxId !== a.sandboxId, afterB, final, releasedLine: logs(/released leaseId/).map((l) => l.message.replace(/.*leaseCount=/, 'leaseCount=')), readyAt31s: (await repo.findReadyToKill(new Date(Date.now() + 31_000))).some((r: any) => r._id === k) };
            await b.sandbox.cleanup();
        }
        // (b) old lease expired and reaped by TTL, a new acquire, then the late release
        {
            const A = manager(), B = manager();
            const n = prNum(); const k = prKeyOf(n);
            const a = await A.acquire(k, 'review', 200, CLONE);
            await sleep(300);
            await reaper().reapExpiredLeases();
            const gone = await doc(k);
            const b = await conversationAcquire(B, k);
            await A.release(a.leaseId, { idleMs: 30_000 });
            const final = slim(await doc(k));
            res.b = { reapedOld: !gone, final, newIsDifferent: b.sandboxId !== a.sandboxId, releasedLine: logs(/released leaseId/).slice(-1).map((l) => l.message.replace(/.*leaseCount=/, 'leaseCount=')) };
            await b.sandbox.cleanup();
        }
        ev(T, 'result', res);
        expect(res.a.newIsDifferent).toBe(true);
        expect(res.a.final.leaseCount).toBe(1);
        expect(res.a.final.killAt).toBeNull();
        expect(res.a.readyAt31s).toBe(false);
        expect(res.b.final.leaseCount).toBe(1);
        expect(res.b.final.killAt).toBeNull();
    });

    it('R9 every acquire path releases its own lease', async () => {
        const T = 'R9';
        const out: any = {};
        const check = async (name: string, k: string, release: () => Promise<void>) => {
            LOGS.length = 0;
            await release();
            await sleep(50);
            const line = logs(/released leaseId/).slice(-1)[0]?.message ?? '(no released line)';
            out[name] = { released: line.replace(/.*leaseCount=/, 'leaseCount='), doc: slim(await doc(k)), killScheduledOrDone: !!(await doc(k))?.killAt || e2bCalls().some((c) => c.op === 'kill') || !(await doc(k)) };
        };
        { // E2B creator
            const m = manager(); const k = prKeyOf(prNum());
            const r = await m.acquire(k, 'review', undefined, CLONE);
            await check('e2bCreator', k, () => m.release(r.leaseId, { idleMs: 30_000 }));
        }
        { // creator after a createWithRetry retry
            let calls = 0;
            const p = { isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => { if (calls++ === 0) throw new Error('transient 502'); return instance('sbx-retry-' + ++seq); }) };
            const m = manager(p); const k = prKeyOf(prNum());
            const r = await m.acquire(k, 'review', undefined, CLONE);
            out.retryCreates = calls;
            await check('creatorAfterRetry', k, () => m.release(r.leaseId, { idleMs: 30_000 }));
        }
        { // E2B joiner
            const A = manager(), B = manager(); const k = prKeyOf(prNum());
            const a = await A.acquire(k, 'review', undefined, CLONE);
            const b = await conversationAcquire(B, k);
            await check('e2bJoiner', k, () => B.release(b.leaseId));
            await A.release(a.leaseId, { idleMs: 30_000 });
        }
        { // joiner without an E2B key
            const A = manager(), B = manager(undefined, noKey); const k = prKeyOf(prNum());
            const a = await A.acquire(k, 'review', undefined, CLONE);
            const b = await conversationAcquire(B, k);
            await check('joinerNoKey', k, () => B.release(b.leaseId));
            await A.release(a.leaseId, { idleMs: 30_000 });
        }
        { // null sandbox: provider unavailable
            const m = manager({ isAvailable: () => false, createSandboxWithRepo: jest.fn() }); const k = prKeyOf(prNum());
            const r = await m.acquire(k, 'review', undefined, CLONE);
            await check('nullNoProvider', k, () => m.release(r.leaseId, { idleMs: 30_000 }));
        }
        { // null sandbox: no clone params
            const m = manager(); const k = prKeyOf(prNum());
            const r = await m.acquire(k, 'review');
            await check('nullNoCloneParams', k, () => m.release(r.leaseId, { idleMs: 30_000 }));
        }
        { // local provider
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kodus-sandbox-qa2628r-'));
            fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
            const m = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => ({ ...instance(dir), type: 'local', repoDir: dir })) });
            const k = prKeyOf(prNum());
            const r = await m.acquire(k, 'review', undefined, CLONE);
            await check('local', k, () => m.release(r.leaseId, { idleMs: 30_000 }));
            out.local.dirDeleted = !fs.existsSync(dir);
        }
        { // lease doc written by the old code, joined by the new manager
            const k = prKeyOf(prNum());
            await model.create({ _id: k, sandboxId: 'sbx-legacy-' + seq, state: 'READY', leaseCount: 1, createdAt: new Date(), expiresAt: new Date(Date.now() + 1800_000), organizationId: ORG });
            const m = manager();
            const b = await conversationAcquire(m, k);
            await check('legacyDocJoiner', k, () => m.release(b.leaseId));
        }
        ev(T, 'paths', out);
        for (const [name, v] of Object.entries<any>(out)) {
            if (typeof v !== 'object') continue;
            expect([name, v.released]).not.toEqual([name, 'leaseCount=unknown']);
        }
        expect(out.e2bCreator.doc.leaseCount).toBe(0);
        expect(out.local.dirDeleted).toBe(true);
        expect(out.legacyDocJoiner.doc.leaseCount).toBe(1);
    });

    it('R13 X5 on E2B (stub): the abandoned command runs past the release; kill and E2B timeout wait for it', async () => {
        const T = 'R13';
        let cmdEnd = 0;
        const p = { isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => instance('sbx-r13-' + REV + '-' + ++seq, { run: jest.fn((c: string) => (c === 'sleep 4; cat a.ts' ? new Promise((r) => setTimeout(() => { cmdEnd = Date.now(); r({ stdout: 'file body', stderr: '', exitCode: 0 }); }, 4000)) : Promise.resolve({ stdout: c, stderr: '', exitCode: 0 }))) })) };
        const m = manager(p);
        const n = prNum(); const k = prKeyOf(n);
        const handle = await stageAcquire(m, n);
        const sbx = handle.sandboxId;
        const setKillAtCalls: number[] = [];
        const realSet = repo.setKillAt.bind(repo);
        jest.spyOn(repo, 'setKillAt').mockImplementation(async (pk: string, at: Date) => { setKillAtCalls.push(Date.now()); return realSet(pk, at) as any; });
        const cmd = handle.run('sleep 4; cat a.ts');
        await sleep(100);
        const releaseAt = Date.now();
        await handle.cleanup();
        const releaseReturnedMs = Date.now() - releaseAt;
        const docAtRelease = slim(await doc(k));
        const result = await cmd;
        await waitFor(() => e2bCalls(sbx).some((c) => c.op === 'setTimeout'), 4000);
        const d = await doc(k);
        const st = e2bCalls(sbx).find((c) => c.op === 'setTimeout');
        const out = { releaseReturnedMs, docAtRelease, cmdExit: result.exitCode, cmdEndAfterReleaseMs: cmdEnd - releaseAt, setKillAtAfterCmdEndMs: setKillAtCalls[0] ? setKillAtCalls[0] - cmdEnd : null, killAtMinusCmdEndMs: d?.killAt ? new Date(d.killAt).getTime() - cmdEnd : null, e2bSetTimeoutAfterCmdEndMs: st ? st.startedAt - cmdEnd : null, e2bSetTimeoutMs: st?.args[1] ?? null };
        ev(T, 'result', out);
        expect(out.cmdExit).toBe(0);
        expect(out.setKillAtAfterCmdEndMs).toBeGreaterThanOrEqual(1000);
        expect(out.e2bSetTimeoutAfterCmdEndMs).toBeGreaterThanOrEqual(1000);
    });

    it('R14 drain cap: a command that never ends and one that never goes quiet', async () => {
        const T = 'R14';
        if (process.env.H_R14 !== '1') { ev(T, 'skipped', { reason: 'H_R14 not set (6 min run)' }); return; }
        const hang = deferred<any>();
        const m = manager({ isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => instance('sbx-cap14-' + ++seq, { run: jest.fn((c: string) => (c === 'sleep forever' ? hang.promise : Promise.resolve({ stdout: c, stderr: '', exitCode: 0 }))) })) });
        const ka = prKeyOf(prNum()), kb = prKeyOf(prNum());
        const p = m as any;
        const a = await m.acquire(ka, 'review', undefined, CLONE);
        const b = await m.acquire(kb, 'review', undefined, CLONE);
        const t0 = Date.now();
        void (a.sandbox as any).run('sleep forever');
        const ticker = setInterval(() => { void (b.sandbox as any).readFile('tick'); }, 500);
        await sleep(600); // the ticker has run a command: the release finds the holder busy
        await p.release(a.leaseId, { idleMs: 30_000 });
        await p.release(b.leaseId, { idleMs: 30_000 });
        const slotsDuring = p.leaseIdToSlot.size;
        await waitFor(() => p.backgroundReleases.size === 0, 7.5 * 60 * 1000);
        clearInterval(ticker);
        hang.resolve({ stdout: '', stderr: '', exitCode: 0 });
        const out = { tookMs: Date.now() - t0, slotsDuring, slotsAfter: p.leaseIdToSlot.size, prKeySlots: p.prKeySlots.size, background: p.backgroundReleases.size, gaveUp: logs(/gave up waiting/).map((l) => ({ at: l.t - t0, md: l.metadata })), docs: [slim(await doc(ka)), slim(await doc(kb))] };
        ev(T, 'result', out);
        expect(out.gaveUp).toHaveLength(2);
        expect(out.slotsAfter).toBe(0);
        expect(out.background).toBe(0);
    }, 9 * 60 * 1000);

    it('R15 worker cap 1: a second review waits for the first one drain', async () => {
        const T = 'R15';
        const cap = { getLimits: async () => ({ maxPerWorker: 1 }) };
        let release20: () => void = () => undefined;
        const p = { isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => instance('sbx-cap-' + ++seq, { run: jest.fn((c: string) => c === 'sleep 8' ? new Promise((r) => { const t = setTimeout(() => r({ stdout: '', stderr: '', exitCode: 0 }), 8000); release20 = () => clearTimeout(t); }) : Promise.resolve({ stdout: c, stderr: '', exitCode: 0 })) })) };
        const m = manager(p, withKey, cap);
        const n1 = prNum(), n2 = prNum();
        const h1 = await stageAcquire(m, n1);
        const cmdStart = Date.now();
        const cmd = h1.run('sleep 8').then(() => Date.now());
        await sleep(50);
        const stageReturn = Date.now();
        await h1.cleanup();
        const acquired2 = stageAcquire(m, n2).then((h: any) => ({ h, at: Date.now() }));
        const cmdEnd = await cmd;
        const { h: h2, at: acq2 } = await acquired2;
        const out = { cmdStart, stageReturn, cmdEnd, review2AcquiredAt: acq2, review2WaitMs: acq2 - stageReturn, afterCmdEndMs: acq2 - cmdEnd, slotLogs: logs(/slot/).map((l) => ({ at: l.t - stageReturn, m: l.message.slice(0, 120) })) };
        ev(T, 'result', out);
        await h2.cleanup();
        release20();
        expect(out.review2WaitMs).toBeGreaterThan(0);
    }, 60_000);

    it('R17 double release in the same tick, idle and busy', async () => {
        const T = 'R17';
        const res: any = {};
        for (const busy of [false, true]) {
            const A = manager(), B = manager();
            const k = prKeyOf(prNum());
            const slow = deferred<string>();
            const p = { isAvailable: () => true, createSandboxWithRepo: jest.fn(async () => instance('sbx-dbl-' + ++seq, { readFile: jest.fn(async (f: string) => (f === 'slow' ? slow.promise : `file ${f}`)) })) };
            const A2 = manager(p);
            const a = await A2.acquire(k, 'review', undefined, CLONE);
            const b = await conversationAcquire(B, k);
            const decSpy = jest.spyOn(repo, 'decrementLease');
            let inflight: Promise<any> | undefined;
            if (busy) { inflight = a.sandbox.readFile('slow'); await sleep(10); }
            LOGS.length = 0;
            const p1 = a.sandbox.cleanup();
            const p2 = A2.release(a.leaseId);
            if (busy) { setTimeout(() => slow.resolve('done'), 200); }
            await Promise.all([p1, p2, inflight]);
            await waitFor(() => (A2 as any).backgroundReleases ? (A2 as any).backgroundReleases.size === 0 : true, 5000);
            await sleep(100);
            res[busy ? 'busy' : 'idle'] = { decrements: decSpy.mock.calls.length, coHolderCount: (await doc(k)).leaseCount, unknownWarn: logs(/unknown leaseId/).map((l) => l.level) };
            decSpy.mockRestore();
            await B.release(b.leaseId);
            void A;
        }
        ev(T, 'result', res);
        expect(res.idle.decrements).toBe(1);
        expect(res.idle.coHolderCount).toBe(1);
        expect(res.busy.decrements).toBe(1);
        expect(res.busy.coHolderCount).toBe(1);
        expect(res.idle.unknownWarn).toEqual(['warn']);
    });

    it('R20 kill fails after detach: retries go to the retired doc', async () => {
        const T = 'R20';
        const res: any = {};
        for (const mode of ['fail-twice', 'not-found']) {
            const A = manager();
            const k = prKeyOf(prNum());
            const a = await A.acquire(k, 'review', undefined, CLONE);
            const sbx = a.sandboxId;
            await A.release(a.leaseId, { idleMs: 50 });
            await sleep(120);
            let n = 0;
            const { NotFoundError } = jest.requireActual('e2b');
            e2b.kill.mockImplementation(async () => {
                n++;
                if (mode === 'not-found') throw new Error('404: sandbox ' + sbx + ' not found'); void NotFoundError;
                if (n <= 2) throw new Error('e2b 503');
                return true;
            });
            const retiredId = `${ORG}:retired:${sbx}`;
            const ticks: any[] = [];
            for (let i = 0; i < 4; i++) {
                await reaper().killIdleSandboxes();
                ticks.push({ tick: i + 1, killCalls: n, prDoc: slim(await doc(k)), retired: slim(await doc(retiredId)) });
            }
            const B = manager();
            const b = await conversationAcquire(B, k);
            res[mode] = { ticks, newAcquireCreated: b.wasCreated, newSandboxDiffers: b.sandboxId !== sbx };
            await B.release(b.leaseId);
        }
        ev(T, 'result', res);
        const ft = res['fail-twice'].ticks;
        expect(ft[0].retired?.killRetryCount).toBe(1);
        expect(ft[1].retired?.killRetryCount).toBe(2);
        expect(ft[2].retired).toBeNull();
        expect(ft.every((t: any) => t.prDoc === null)).toBe(true);
        expect(res['not-found'].ticks[0].retired).toBeNull();
    });

    it('R21 detachIdle deletes the lease, then the retired upsert throws', async () => {
        const T = 'R21';
        if (typeof (repo as any).detachIdle !== 'function') { ev(T, 'n/a', { reason: 'no detachIdle at this revision' }); return; }
        const A = manager();
        const k = prKeyOf(prNum());
        const a = await A.acquire(k, 'review', undefined, CLONE);
        const sbx = a.sandboxId;
        await A.release(a.leaseId, { idleMs: 50 });
        const setTimeoutAtRelease = e2bCalls(sbx).filter((c) => c.op === 'setTimeout').map((c) => c.args[1]);
        await sleep(120);
        const realUpdateOne = model.updateOne.bind(model);
        const spy = jest.spyOn(model, 'updateOne').mockImplementationOnce(() => { throw new Error('mongo stepdown during upsert'); });
        let tickErr: any = null;
        await reaper().killIdleSandboxes().catch((e: any) => (tickErr = String(e?.message)));
        spy.mockRestore(); void realUpdateOne;
        const afterTick = { prDoc: slim(await doc(k)), retired: slim(await doc(`${ORG}:retired:${sbx}`)), killCalls: e2bCalls(sbx).filter((c) => c.op === 'kill').length };
        await reaper().killIdleSandboxes();
        await reaper().reapExpiredLeases();
        const afterNextTicks = { prDoc: slim(await doc(k)), killCalls: e2bCalls(sbx).filter((c) => c.op === 'kill').length };
        // orphan sweep: E2B lists the sandbox as paused, older than the age floor
        e2b.list.mockImplementation(() => { let done = false; return { get hasNext() { return !done; }, nextItems: async () => { done = true; return [{ sandboxId: sbx, metadata: { stage: 'review' }, startedAt: new Date(Date.now() - 48 * 3600_000).toISOString() }]; } }; });
        await reaper().sweepOrphanedSandboxes();
        const swept = e2bCalls(sbx).filter((c) => c.op === 'kill').length > afterNextTicks.killCalls;
        const out = { setTimeoutAtRelease, tickErr, afterTick, afterNextTicks, orphanSweepKilled: swept, reaperLogs: LOGS.filter((l) => l.name === 'SandboxLeaseReaperService').map((l) => ({ level: l.level, m: String(l.message).slice(0, 140) })) };
        ev(T, 'result', out);
        expect(out.orphanSweepKilled).toBe(true);
    });

    it('R22 legacy held doc with a past killAt: skipped by the idle cron, freed by the TTL reaper', async () => {
        const T = 'R22';
        const k = prKeyOf(prNum());
        await model.create({ _id: k, sandboxId: 'sbx-legacy-held-' + seq, state: 'READY', leaseCount: 1, createdAt: new Date(Date.now() - 600_000), expiresAt: new Date(Date.now() + 400), killAt: new Date(Date.now() - 1000), organizationId: ORG });
        await reaper().killIdleSandboxes();
        const afterIdle = { doc: slim(await doc(k)), kills: e2bCalls().filter((c) => c.op === 'kill').length };
        await sleep(600);
        await reaper().reapExpiredLeases();
        const afterTtl = { doc: slim(await doc(k)), kills: e2bCalls().filter((c) => c.op === 'kill').length };
        ev(T, 'result', { afterIdle, afterTtl });
        expect(afterTtl.doc).toBeNull();
        expect(afterTtl.kills).toBe(1);
    });

    it('R23 single-use graph release 200 ms after a command', async () => {
        const T = 'R23';
        const m = manager();
        const k = prKeyOf(prNum());
        const r = await m.acquire(k, 'graph-build', undefined, CLONE);
        await r.sandbox.readFile('a.ts');
        await sleep(200);
        const t0 = Date.now();
        await m.release(r.leaseId, { idleMs: 0 });
        const returnedMs = Date.now() - t0;
        const docRightAfter = slim(await doc(k));
        await waitFor(async () => !(await doc(k)), 3000);
        const out = { returnedMs, docRightAfter, docAfter: slim(await doc(k)), kills: e2bCalls(r.sandboxId).filter((c) => c.op === 'kill').map((c) => c.startedAt - t0), order: LOGS.filter((l) => l.name === 'SandboxLeaseManager').map((l) => ({ at: l.t - t0, m: String(l.message).slice(0, 90) })).filter((l) => l.at >= 0) };
        ev(T, 'result', out);
        expect(out.docAfter).toBeNull();
        expect(out.kills).toHaveLength(1);
    });

    it('R24 1000 acquire/release cycles, half busy, drain the per-process maps', async () => {
        const T = 'R24';
        const m = manager();
        const p = m as any;
        const keys: string[] = [];
        for (let batch = 0; batch < 10; batch++) {
            await Promise.all(Array.from({ length: 100 }, async (_, i) => {
                const k = prKeyOf(prNum()); keys.push(k);
                const r = await m.acquire(k, i % 3 === 0 ? 'conversation' : 'review', undefined, CLONE);
                await r.sandbox.readFile('a');
                if (i % 2 === 0) { const c = r.sandbox.readFile('b'); await m.release(r.leaseId, { idleMs: 30_000 }); await c; }
                else { await sleep(1); await m.release(r.leaseId, { idleMs: 30_000 }); }
            }));
        }
        await waitFor(() => !p.backgroundReleases || p.backgroundReleases.size === 0, 20_000);
        const sizes: any = {};
        for (const f of ['leaseIdToPrKey', 'leaseIdToUse', 'leaseIdToInFlight', 'leaseIdToSandboxId', 'leaseIdToSlot', 'prKeySlots', 'backgroundReleases']) sizes[f] = p[f]?.size ?? 'absent';
        const held = await model.countDocuments({ _id: { $in: keys }, leaseCount: { $gt: 0 } });
        ev(T, 'sizes', { sizes, heldDocs: held, waitedLines: logs(/release waited/).length });
        for (const v of Object.values(sizes)) if (v !== 'absent') expect(v).toBe(0);
        expect(held).toBe(0);
    }, 120_000);
});
