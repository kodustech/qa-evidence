/**
 * QA #2628 harness H-orch: real AgentReviewStage + REAL ReviewOrchestratorService
 * (agent providers stubbed, each running the real runAgentLoopCall on an AI SDK
 * MockLanguageModelV3) + real CreateSandboxStage + real SandboxLeaseManager and
 * repository on the disposable Mongo + real LocalSandboxService (git fetch from a
 * local bare repo, real temp checkout, real rm -rf) + real pipeline observer.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MockLanguageModelV3 } from 'ai/test';
import { APICallError } from '@ai-sdk/provider';
import { tool } from 'ai';
import { z } from 'zod';

const LOGS: any[] = [];
(globalThis as any).__QA_LOGS = LOGS;
jest.mock('@libs/core/log/logger', () => ({
    createLogger: (name: string) => {
        const push = (level: string) => (o: any) => (globalThis as any).__QA_LOGS.push({ t: Date.now(), level, name, message: o?.message, metadata: o?.metadata, err: o?.error ? String(o.error?.message ?? o.error) : undefined });
        return { log: push('info'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') };
    },
}));
(globalThis as any).__QA_MODEL = undefined;
jest.mock('@libs/llm/agent-model', () => ({
    ...jest.requireActual('@libs/llm/agent-model'),
    resolveAgentModel: () => (globalThis as any).__QA_MODEL,
}));
jest.mock('@libs/llm/byok-to-vercel', () => ({
    ...jest.requireActual('@libs/llm/byok-to-vercel'),
    buildModelFromSlot: () => (globalThis as any).__QA_MODEL,
    buildPlatformModel: () => (globalThis as any).__QA_MODEL,
    trialDefaultModel: () => undefined,
}));
jest.mock('@libs/llm/managed-slot', () => ({
    ...jest.requireActual('@libs/llm/managed-slot'),
    hasManagedModelKey: () => true,
}));

import { AgentReviewStage } from '@/code-review/pipeline/stages/agent-review.stage';
import { ReviewOrchestratorService } from '@/code-review/infrastructure/agents/review-orchestrator.service';
import { ObservabilityService } from '@/core/log/observability.service';
import { AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@/automation/domain/automationExecution/contracts/automation-execution.service';
import { GraphContextService } from '@/code-review/infrastructure/adapters/services/graph/graph-context.service';
import { FeatureGateService } from '@libs/feature-gate';
import { ORGANIZATION_SERVICE_TOKEN } from '@libs/organization/domain/organization/contracts/organization.service.contract';
import { REPOSITORY_SERVICE_TOKEN } from '@/code-review/domain/contracts/RepositoryService.contract';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { PlatformType } from '@/core/domain/enums';
import { CodeReviewVersion } from '@/core/domain/enums/code-review.enum';
import { runAgentLoopCall } from '@libs/llm/agent-loop-call';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { LocalSandboxService } from '@libs/sandbox/infrastructure/providers/local-sandbox.service';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';

const REV = process.env.H_REV || 'unknown';
const OUT = process.env.H_OUT || '/dev/null';
const ev = (test: string, event: string, data: any = {}) => fs.appendFileSync(OUT, JSON.stringify({ rev: REV, test, event, at: new Date().toISOString(), ...data }) + "\n");
jest.setTimeout(60_000);

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
type Script = Array<'429' | { tool: string; input: any } | { text: string }>;
function scriptedModel(script: Script, steps: string[]) {
    let i = 0;
    return new MockLanguageModelV3({
        doGenerate: async (opts: any) => {
            const agentCall = (opts.tools ?? []).length > 0;
            if (!agentCall) return { content: [{ type: 'text', text: '{}' }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } as any;
            const step = script[Math.min(i++, script.length - 1)];
            if (step === '429') {
                steps.push('llm-429');
                throw new APICallError({ message: 'Too Many Requests', url: 'https://llm.invalid/v1/chat', requestBodyValues: {}, statusCode: 429, isRetryable: true, responseHeaders: { 'retry-after-ms': '50' } });
            }
            if ('tool' in step) {
                steps.push(`llm-calls-${step.tool}`);
                return { content: [{ type: 'tool-call', toolCallId: 'c' + i, toolName: step.tool, input: JSON.stringify(step.input) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] } as any;
            }
            steps.push('llm-final');
            return { content: [{ type: 'text', text: step.text }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] } as any;
        },
    });
}

let conn: typeof mongoose, model: any, repo: SandboxLeaseRepository, bare: string;
const ORG = '55555555-2628-4eee-8eee-000000000005';
beforeAll(async () => {
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628r_orch_${REV}_${process.pid}?directConnection=true`);
    model = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    await model.deleteMany({});
    repo = new SandboxLeaseRepository(model);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2628-src-'));
    bare = fs.mkdtempSync(path.join(os.tmpdir(), 'qa2628-bare-'));
    const g = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'pipe' });
    g(work, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(work, 'a.ts'), 'export const capacity = (c: number, e: number) => Math.max(0, c + e);\n');
    fs.writeFileSync(path.join(work, 'policy.ts'), 'export const MAX_CLASS_SIZE = 30;\n');
    g(work, '-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', 'add', '-A');
    g(work, '-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', 'commit', '-q', '-m', 'f');
    g(bare, 'init', '-q', '--bare');
    for (let pr = 1; pr <= 9; pr++) g(work, 'push', '-q', bare, `HEAD:refs/pull/${pr}/head`);
    g(work, 'push', '-q', bare, 'HEAD:refs/heads/main');
});
afterAll(async () => conn.disconnect());

describe(`H orch @${REV}`, () => {
    let stage: AgentReviewStage;
    let orchestrator: ReviewOrchestratorService;
    let mgr: SandboxLeaseManager;
    const agents: Record<string, any> = {};
    const steps: string[] = [];
    const agent = (name: string) => ({ execute: (inp: any) => agents[name](inp) });

    beforeEach(async () => {
        steps.length = 0;
        LOGS.length = 0;
        for (const n of ['bug', 'security', 'performance', 'generalist', 'kodyRules']) agents[n] = async () => ({ agentName: n, suggestions: [], turnsUsed: 0, durationMs: 0 });
        orchestrator = new ReviewOrchestratorService(agent('bug') as any, agent('security') as any, agent('performance') as any, agent('generalist') as any, agent('kodyRules') as any);
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AgentReviewStage,
                {
                    provide: ReviewOrchestratorService,
                    useValue: orchestrator,
                },
                {
                    provide: ObservabilityService,
                    useValue: {
                        runInSpan: jest.fn((_name: string, fn: any) => fn()),
                        recordAgentRunUsage: jest.fn(),
                    },
                },
                {
                    provide: AUTOMATION_EXECUTION_SERVICE_TOKEN,
                    useValue: {
                        updateCodeReview: jest.fn(),
                        findLatestStageLog: jest.fn(),
                        updateStageLog: jest.fn(),
                    },
                },
                {
                    provide: GraphContextService,
                    useValue: {
                        generateContext: jest.fn().mockResolvedValue(''),
                        generateContextLegacy: jest.fn().mockResolvedValue(''),
                    },
                },
                {
                    provide: REPOSITORY_SERVICE_TOKEN,
                    useValue: {
                        findOrCreate: jest.fn(),
                        findByExternalId: jest.fn(),
                        updateStatus: jest.fn(),
                    },
                },
                {
                    // HEAVY is an alpha-gated opt-in; default the gate to OFF so
                    // these tests exercise the normal review path.
                    provide: FeatureGateService,
                    useValue: {
                        isEnabled: jest.fn().mockResolvedValue(false),
                    },
                },
                {
                    provide: ORGANIZATION_SERVICE_TOKEN,
                    useValue: {
                        getReleaseTrack: jest.fn().mockResolvedValue('beta'),
                    },
                },
                {
                    // Cross-repo context (#1576): linkedRepositories resolution.
                    // Default empty list → feature stays off for these unit tests.
                    provide: CodeManagementService,
                    useValue: {
                        getRepositories: jest.fn().mockResolvedValue([]),
                        getCloneParams: jest.fn().mockResolvedValue(null),
                    },
                },
            ],

        }).compile();
        stage = module.get<AgentReviewStage>(AgentReviewStage);
        mgr = new SandboxLeaseManager(new LocalSandboxService({ get: () => undefined } as any) as any, repo, { get: () => undefined } as any);
        const origRelease = mgr.release.bind(mgr);
        jest.spyOn(mgr, 'release').mockImplementation(async (...a: any[]) => { steps.push('release-entered'); try { return await (origRelease as any)(...a); } finally { steps.push('release-settled'); } });
        for (const m of ['dropRepeatsOnCitedCode', 'dedupSuggestionStreams', 'reclassifyAndFilterSeverity', 'enrichFinderSuggestions']) {
            if (typeof (stage as any)[m] !== 'function') continue;
            const orig = (stage as any)[m].bind(stage);
            jest.spyOn(stage as any, m).mockImplementation(async (...a: any[]) => { steps.push(`post:${m}`); return orig(...a); });
        }
    });
    afterEach(() => jest.restoreAllMocks());

    async function pipeline(pr: number, over: any = {}) {
        const resolver = { resolve: async () => ({ url: bare, platform: 'github', branch: 'feature', prNumber: pr, baseBranch: 'main' }) };
        const create = new CreateSandboxStage(mgr as any, resolver as any);
        const ctx: any = {
            organizationAndTeamData: { organizationId: ORG, teamId: 'team' },
            repository: { id: 'rq', name: 'r', fullName: 'o/r' },
            branch: 'feature',
            pullRequest: { number: pr, title: 'qa', base: { repo: { fullName: 'o/r' }, ref: 'main' }, repository: {}, isDraft: false, stats: { total_additions: 1, total_deletions: 0, total_files: 1, total_lines_changed: 1 } },
            teamAutomationId: 'ta', origin: 'github', action: 'opened', platformType: PlatformType.GITHUB,
            codeReviewConfig: { codeReviewVersion: CodeReviewVersion.V3_AGENT, reviewOptions: { bug: true, security: true, performance: true }, ...(over.config ?? {}) },
            changedFiles: [{ filename: 'a.ts', patch: '@@ -1 +1 @@\n-x\n+export const capacity = (c: number, e: number) => Math.max(0, c + e);', status: 'modified' }],
            preparedFileContexts: [], validSuggestions: [], discardedSuggestions: [], correlationId: 'qa2628', statusInfo: { status: 'success' },
            ...(over.ctx ?? {}),
        };
        const created = await (create as any).executeStage(ctx);
        (globalThis as any).__QA_HANDLE = created.sandboxHandle;
        return created;
    }
    const prKey = (pr: number) => `${ORG}:rq:${pr}`;
    const doc = (pr: number) => model.findById(prKey(pr)).lean();
    const observer = () => {
        const anyFn: any = new Proxy({}, { get: () => jest.fn(async () => undefined) });
        return new CodeReviewPipelineObserver(anyFn, anyFn);
    };
    const finding = { relevantFile: 'a.ts', suggestionContent: 'capacity adds enrolled instead of subtracting', label: 'bug', severity: 'high', relevantLinesStart: 1, relevantLinesEnd: 1, oneSentenceSummary: 'adds instead of subtracts' };
    const loopAgent = (script: Script, extra: any = {}) => async (inp: any) => {
        (globalThis as any).__QA_MODEL = scriptedModel(script, steps);
        const tools: any = {
            readFile: tool({ description: 'read', inputSchema: z.object({ path: z.string() }), execute: async ({ path: p }: any) => { steps.push(`tool-start:readFile`); const r = await inp.remoteCommands.read(p, 1, 5); steps.push(`tool-end:readFile`); return String(r).slice(0, 200); } }),
            slowShell: tool({ description: 'slow', inputSchema: z.object({ cmd: z.string() }), execute: async ({ cmd }: any) => { steps.push('tool-start:slowShell'); const h = (globalThis as any).__QA_HANDLE; const r = await h.run(cmd); steps.push(`tool-end:slowShell exit=${r.exitCode} out=${String(r.stdout).trim().slice(0, 60)} err=${String(r.stderr).trim().slice(0, 80)}`); return r.stdout; } }),
        };
        await runAgentLoopCall({ messages: [{ role: 'user', content: 'review a.ts' }], loop: { tools, maxSteps: 5 }, runName: 'qa2628-agent', hardTimeoutMs: extra.hardTimeoutMs, signal: extra.signal });
        steps.push('agent-returned');
        return { agentName: 'generalist', suggestions: [finding], turnsUsed: 2, durationMs: 1 };
    };


    const T0: any[] = [];
    const tsteps = () => { const out: any[] = []; for (const x of T0) out.push(x); return out; };
    beforeEach(() => {
        T0.length = 0;
        const orig = steps.push.bind(steps);
        (steps as any).push = (...a: any[]) => { for (const s of a) T0.push({ s, t: Date.now() }); return orig(...a); };
    });
    const pollDir = (dir: string) => {
        const st: any = { goneAt: null as number | null };
        const iv = setInterval(() => { if (st.goneAt === null && !fs.existsSync(dir)) st.goneAt = Date.now(); }, 10);
        st.stop = () => clearInterval(iv);
        return st;
    };
    const L = (re: RegExp) => LOGS.filter((l) => re.test(l.message ?? ''));

    it('R10 X5: hard timeout while `sleep 8; cat a.ts` runs (real stage, orchestrator, local provider); R16 observer + pipeline timing; R29 usage', async () => {
        agents.generalist = loopAgent([{ tool: 'slowShell', input: { cmd: 'sleep 8; cat a.ts' } }, { text: 'done' }], { hardTimeoutMs: 100 });
        const ctx = await pipeline(3);
        const dir = ctx.sandboxHandle.sandboxId;
        const poll = pollDir(dir);
        const t0 = Date.now();
        const r = await (stage as any).executeStage(ctx);
        const stageEnd = Date.now();
        const dirAtStageEnd = fs.existsSync(dir);
        const o0 = Date.now();
        await observer().onPipelineFinish(r, {} as any);
        const observerMs = Date.now() - o0;
        const pipelineEnd = Date.now();
        for (let i = 0; i < 150 && !steps.some((s) => s.startsWith('tool-end:slowShell')); i++) await new Promise((res) => setTimeout(res, 100));
        for (let i = 0; i < 60 && poll.goneAt === null; i++) await new Promise((res) => setTimeout(res, 100));
        poll.stop();
        const cmdEnd = T0.find((x) => String(x.s).startsWith('tool-end:slowShell'))?.t ?? null;
        const waited = L(/release waited for the holder/)[0];
        const cleaned = L(/cleaned local sandbox/)[0];
        const released = L(/released leaseId/)[0];
        const out = {
            toolEnd: T0.find((x) => String(x.s).startsWith('tool-end:slowShell'))?.s ?? null,
            stageMs: stageEnd - t0, dirAtStageEnd, observerMs, pipelineEndMinusStageEndMs: pipelineEnd - stageEnd,
            cmdEndMs: cmdEnd && cmdEnd - t0, dirGoneMs: poll.goneAt && poll.goneAt - t0,
            dirGoneAfterCmdEndMs: poll.goneAt && cmdEnd ? poll.goneAt - cmdEnd : null,
            waited: waited ? { atMs: waited.t - t0, md: waited.metadata } : null,
            releasedAtMs: released ? released.t - t0 : null, cleanedAtMs: cleaned ? cleaned.t - t0 : null,
            releaseCalls: steps.filter((s) => s === 'release-entered').length,
            decrementLines: L(/released leaseId/).length,
            errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error).slice(0, 120)),
            usage: ctx.sandboxHandle.usage?.(),
            steps: tsteps().map((x) => ({ s: String(x.s).slice(0, 110), ms: x.t - t0 })),
        };
        ev('R10', 'result', out);
        expect(out.toolEnd).toMatch(/exit=0/);
        expect(out.observerMs).toBeLessThan(100);
    }, 60_000);

    it('R12 X5: outline-first readFile runs two sandbox reads back to back; the release lands during the first', async () => {
        const { buildFinderToolRegistry } = require('@libs/code-review/infrastructure/agents/adapters/finder-tools.adapter');
        const local = new LocalSandboxService({ get: () => undefined } as any) as any;
        const reads: any[] = [];
        const prov = {
            isAvailable: () => true,
            createSandboxWithRepo: async (p: any) => {
                const inst = await local.createSandboxWithRepo(p);
                const realRead = inst.remoteCommands.read.bind(inst.remoteCommands);
                inst.remoteCommands = { ...inst.remoteCommands, read: async (...a: any[]) => { const s = Date.now(); try { const v = await realRead(...a); await new Promise((r) => setTimeout(r, 300)); reads.push({ ok: true, startedAt: s, settledAt: Date.now() }); return v; } catch (e: any) { reads.push({ ok: false, err: String(e?.message).slice(0, 80), startedAt: s, settledAt: Date.now() }); throw e; } } };
                return inst;
            },
        };
        const m2 = new SandboxLeaseManager(prov as any, repo, { get: () => undefined } as any);
        const resolver = { resolve: async () => ({ url: bare, platform: 'github', branch: 'feature', prNumber: 7, baseBranch: 'main' }) };
        const create = new CreateSandboxStage(m2 as any, resolver as any);
        const ctx: any = { organizationAndTeamData: { organizationId: ORG, teamId: 'team' }, repository: { id: 'rq12', name: 'r', fullName: 'o/r' }, pullRequest: { number: 7 }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {} };
        const handle = (await (create as any).executeStage(ctx)).sandboxHandle;
        const dir = handle.sandboxId;
        const poll = pollDir(dir);
        await new Promise((r) => setTimeout(r, 1100));
        const { registry } = buildFinderToolRegistry({ remoteCommands: handle.remoteCommands, outlineFirst: true });
        const t0 = Date.now();
        const p = registry.get('readFile').execute({ path: 'a.ts' }, { runId: 'r12' });
        await new Promise((r) => setTimeout(r, 100));
        await handle.cleanup();
        const releaseReturnedMs = Date.now() - t0;
        const res = await p;
        for (let i = 0; i < 40 && poll.goneAt === null; i++) await new Promise((r) => setTimeout(r, 100));
        poll.stop();
        const out = { releaseReturnedMs, result: { isError: !!res.isError, output: String(res.output).slice(0, 100) }, reads: reads.map((x) => ({ ...x, startedAt: x.startedAt - t0, settledAt: x.settledAt - t0 })), dirGoneMs: poll.goneAt && poll.goneAt - t0, released: L(/released leaseId/).length };
        ev('R12', 'result', out);
        expect(out.reads).toHaveLength(2);
        expect(out.reads.every((x: any) => x.ok)).toBe(true);
        expect(out.result.isError).toBe(false);
    }, 30_000);

    it('R12b X5: two sandbox reads 50 ms apart (a tool with a short non-sandbox await between them); the release lands during the first', async () => {
        const { buildFinderToolRegistry } = require('@libs/code-review/infrastructure/agents/adapters/finder-tools.adapter');
        const local = new LocalSandboxService({ get: () => undefined } as any) as any;
        const reads: any[] = [];
        const prov = {
            isAvailable: () => true,
            createSandboxWithRepo: async (p: any) => {
                const inst = await local.createSandboxWithRepo(p);
                const realRead = inst.remoteCommands.read.bind(inst.remoteCommands);
                inst.remoteCommands = { ...inst.remoteCommands, read: async (...a: any[]) => { const s = Date.now(); try { const v = await realRead(...a); await new Promise((r) => setTimeout(r, 300)); reads.push({ ok: true, startedAt: s, settledAt: Date.now() }); return v; } catch (e: any) { reads.push({ ok: false, err: String(e?.message).slice(0, 80), startedAt: s, settledAt: Date.now() }); throw e; } } };
                return inst;
            },
        };
        const m2 = new SandboxLeaseManager(prov as any, repo, { get: () => undefined } as any);
        const resolver = { resolve: async () => ({ url: bare, platform: 'github', branch: 'feature', prNumber: 8, baseBranch: 'main' }) };
        const create = new CreateSandboxStage(m2 as any, resolver as any);
        const ctx: any = { organizationAndTeamData: { organizationId: ORG, teamId: 'team' }, repository: { id: 'rq12b', name: 'r', fullName: 'o/r' }, pullRequest: { number: 8 }, changedFiles: [{ filename: 'a.ts' }], codeReviewConfig: {} };
        const handle = (await (create as any).executeStage(ctx)).sandboxHandle;
        const dir = handle.sandboxId;
        const poll = pollDir(dir);
        await new Promise((r) => setTimeout(r, 1100));
        const { registry } = buildFinderToolRegistry({ remoteCommands: handle.remoteCommands, outlineFirst: true });
        const t0 = Date.now();
        void registry; const p = (async () => { await handle.remoteCommands.read('a.ts', 0, 0); await new Promise((r) => setTimeout(r, 50)); try { return { output: await handle.remoteCommands.read('a.ts', 0, 0) }; } catch (e: any) { return { isError: true, output: String(e?.message) }; } })();
        await new Promise((r) => setTimeout(r, 100));
        await handle.cleanup();
        const releaseReturnedMs = Date.now() - t0;
        const res = await p;
        for (let i = 0; i < 40 && poll.goneAt === null; i++) await new Promise((r) => setTimeout(r, 100));
        poll.stop();
        const out = { releaseReturnedMs, result: { isError: !!res.isError, output: String(res.output).slice(0, 100) }, reads: reads.map((x) => ({ ...x, startedAt: x.startedAt - t0, settledAt: x.settledAt - t0 })), dirGoneMs: poll.goneAt && poll.goneAt - t0, released: L(/released leaseId/).length };
        ev('R12b', 'result', out);
        expect(out.reads).toHaveLength(2);
        expect(out.reads.every((x: any) => x.ok)).toBe(true);
        expect(out.result.isError).toBe(false);
    }, 30_000);
});
