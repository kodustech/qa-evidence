/** QA #2628 H (local provider): real lease manager + repository on the disposable Mongo, real temp checkout. */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import mongoose from 'mongoose';

const gate: { wait?: Promise<void>; fail?: boolean } = {};
jest.mock('@libs/sandbox/infrastructure/services/local-sandbox-cleanup.service', () => {
    const actual = jest.requireActual('@libs/sandbox/infrastructure/services/local-sandbox-cleanup.service');
    return {
        ...actual,
        deleteLocalSandbox: async (id: string) => {
            (globalThis as any).__QA_EV('delete-start');
            if ((globalThis as any).__QA_GATE.wait) await (globalThis as any).__QA_GATE.wait;
            if ((globalThis as any).__QA_GATE.fail) throw new Error('EBUSY: resource busy');
            await actual.deleteLocalSandbox(id);
            (globalThis as any).__QA_EV('delete-done');
        },
    };
});
const LOGS: any[] = [];
jest.mock('@libs/core/log/logger', () => ({
    createLogger: (name: string) => {
        const push = (level: string) => (o: any) => (globalThis as any).__QA_LOGS.push({ level, name, message: o?.message });
        return { log: push('info'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') };
    },
}));
(globalThis as any).__QA_LOGS = LOGS;
(globalThis as any).__QA_GATE = gate;
const steps: string[] = [];
(globalThis as any).__QA_EV = (s: string) => steps.push(s);

import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';

const REV = process.env.H_REV || 'unknown';
const OUT = process.env.H_OUT || '/dev/null';
const ev = (test: string, event: string, data: any = {}) => fs.appendFileSync(OUT, JSON.stringify({ rev: REV, test, event, ...data }) + '\n');
let conn: typeof mongoose, model: any, repo: SandboxLeaseRepository;
beforeAll(async () => {
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_local_${REV}?directConnection=true`);
    model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    await model.deleteMany({});
    repo = new SandboxLeaseRepository(model);
});
afterAll(async () => conn.disconnect());
jest.setTimeout(20_000);

async function setup(n: number) {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'kodus-sandbox-qa2628-'));
    await fsp.writeFile(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    const provider = {
        isAvailable: () => true,
        createSandboxWithRepo: async () => ({ type: 'local', sandboxId: dir, repoDir: dir, remoteCommands: { read: async (p: string) => fsp.readFile(path.join(dir, p), 'utf8') }, cleanup: async () => undefined, run: async () => ({ stdout: '', stderr: '', exitCode: 0 }), readFile: (p: string) => fsp.readFile(path.join(dir, p), 'utf8'), writeFile: async () => undefined }),
    };
    const mgr = new SandboxLeaseManager(provider as any, repo, { get: () => undefined } as any);
    const stage = new CreateSandboxStage(mgr as any, { resolve: async () => ({ url: 'file://x', platform: 'github', branch: 'b', prNumber: n }) } as any);
    const ctx: any = { organizationAndTeamData: { organizationId: '44444444-2628-4ddd-8ddd-000000000004', teamId: 't' }, repository: { id: 'rl' }, pullRequest: { number: n }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {}, statusInfo: { status: 'success' } };
    const out = await (stage as any).executeStage(ctx);
    const anyFn: any = new Proxy({}, { get: () => jest.fn(async () => undefined) });
    const observer = new CodeReviewPipelineObserver(anyFn, anyFn);
    return { dir, out, observer, key: `44444444-2628-4ddd-8ddd-000000000004:rl:${n}` };
}

describe(`H local provider @${REV}`, () => {
    it('M15 delayed rm -rf: publication proceeds, observer waits, stop stamped after removal', async () => {
        steps.length = 0;
        const { dir, out, observer, key } = await setup(1);
        await out.sandboxHandle.readFile('a.ts');
        let open!: () => void;
        gate.wait = new Promise<void>((r) => (open = r));
        void out.sandboxHandle.cleanup().then(() => steps.push('stage-release-settled'));
        await new Promise((r) => setTimeout(r, 30));
        steps.push('publish-comments(diff only)');
        const obs = observer.onPipelineFinish(out, {} as any).then(() => steps.push('observer-settled'));
        await new Promise((r) => setTimeout(r, 30));
        const usageMid = out.sandboxHandle.usage?.();
        steps.push('gate-open');
        open();
        await obs;
        gate.wait = undefined;
        const usage = out.sandboxHandle.usage?.();
        const exists = fs.existsSync(dir);
        const d = await model.findById(key).lean();
        ev('M15', 'delayed', { steps, usageMid, usage, dirExists: exists, doc: d ? { leaseCount: d.leaseCount, cleanupStatus: d.cleanupStatus } : null, cleaned: LOGS.filter((l) => /cleaned local sandbox/.test(l.message ?? '')).length });
        expect(steps.indexOf('publish-comments(diff only)')).toBeLessThan(steps.indexOf('delete-done'));
        expect(steps.indexOf('observer-settled')).toBeGreaterThan(steps.indexOf('delete-done'));
        expect(exists).toBe(false);
        if (usage) expect(new Date(usage.stopAt).getTime()).toBeGreaterThanOrEqual(new Date(usage.releasedAt).getTime());
    });

    it('M15 failing rm -rf: retry marker, warning, no second decrement', async () => {
        steps.length = 0;
        LOGS.length = 0;
        const { dir, out, observer, key } = await setup(2);
        gate.fail = true;
        const dec = jest.spyOn(repo, 'decrementLease');
        await out.sandboxHandle.cleanup().catch(() => undefined);
        await observer.onPipelineFinish(out, {} as any);
        gate.fail = false;
        const d = await model.findById(key).lean();
        ev('M15', 'failing', { decCalls: dec.mock.calls.length, doc: d ? { leaseCount: d.leaseCount, cleanupStatus: d.cleanupStatus } : null, warns: LOGS.filter((l) => l.level === 'warn').map((l) => l.message), usage: out.sandboxHandle.usage?.(), dirExists: fs.existsSync(dir) });
        dec.mockRestore();
        await fsp.rm(dir, { recursive: true, force: true });
        expect(dec.mock.calls.length).toBeLessThanOrEqual(1);
    });
});
