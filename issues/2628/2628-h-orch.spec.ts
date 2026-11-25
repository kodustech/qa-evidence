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
        const push = (level: string) => (o: any) => (globalThis as any).__QA_LOGS.push({ t: Date.now(), level, name, message: o?.message, err: o?.error ? String(o.error?.message ?? o.error) : undefined });
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
const ev = (test: string, event: string, data: any = {}) => fs.appendFileSync(OUT, JSON.stringify({ rev: REV, test, event, ...data }) + '\n');
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
    conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_orch_${REV}?directConnection=true`);
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

    it('O1 M5/M6: real orchestrator; last sandbox read -> orchestrator return -> release -> post-processing', async () => {
        agents.generalist = loopAgent([{ tool: 'readFile', input: { path: 'policy.ts' } }, { text: 'done' }]);
        const ctx = await pipeline(1);
        const r = await (stage as any).executeStage(ctx);
        await observer().onPipelineFinish(r, {} as any);
        const usage = ctx.sandboxHandle.usage?.();
        ev('O1', 'order', { steps, usage, results: (r.validSuggestions ?? r.fileAnalysisResults ?? []).length, errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)), releaseCalls: steps.filter((s) => s === 'release-entered').length });
        const iRel = steps.indexOf('release-entered');
        const iTool = steps.lastIndexOf('tool-end:readFile');
        const iPost = steps.findIndex((s) => s.startsWith('post:'));
        expect(iTool).toBeGreaterThan(-1);
        expect(iRel).toBeGreaterThan(iTool);
        expect(iRel).toBeGreaterThan(steps.indexOf('agent-returned'));
        expect(iPost).toBeGreaterThan(-1);
        expect(iRel).toBeLessThan(iPost);
        expect(steps.filter((s) => s === 'release-entered')).toHaveLength(1);
    });

    it('O2 M28: real AI SDK retry of a 429 inside the real agent loop', async () => {
        agents.generalist = loopAgent(['429', { tool: 'readFile', input: { path: 'a.ts' } }, { text: 'done' }]);
        const ctx = await pipeline(2);
        const r = await (stage as any).executeStage(ctx);
        await observer().onPipelineFinish(r, {} as any);
        ev('O2', 'order', { steps, errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)), releaseCalls: steps.filter((s) => s === 'release-entered').length, usage: ctx.sandboxHandle.usage?.() });
        expect(steps.indexOf('llm-429')).toBeGreaterThan(-1);
        expect(steps.indexOf('tool-end:readFile')).toBeGreaterThan(steps.indexOf('llm-429'));
        expect(steps.indexOf('release-entered')).toBeGreaterThan(steps.indexOf('agent-returned'));
        expect((r.errors ?? []).length).toBe(0);
        expect(steps.filter((s) => s === 'release-entered')).toHaveLength(1);
    });

    it('O3 timeout while a sandbox command is still running (local provider)', async () => {
        agents.generalist = loopAgent([{ tool: 'slowShell', input: { cmd: 'sleep 8; cat a.ts' } }, { text: 'done' }], { hardTimeoutMs: 100 });
        const ctx = await pipeline(3);
        const dir = ctx.sandboxHandle.sandboxId;
        const t0 = Date.now();
        const r = await (stage as any).executeStage(ctx);
        const stageDoneMs = Date.now() - t0;
        const dirAfterStage = fs.existsSync(dir);
        await new Promise((res) => setTimeout(res, 300));
        const dirAfterRelease = fs.existsSync(dir);
        // let the in-flight command finish
        for (let i = 0; i < 100 && !steps.some((s) => s.startsWith('tool-end:slowShell')); i++) await new Promise((res) => setTimeout(res, 100));
        await observer().onPipelineFinish(r, {} as any);
        ev('O3', 'result', { steps, stageDoneMs, dirAfterStage, dirAfterRelease, errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)), usage: ctx.sandboxHandle.usage?.(), usedAfterReleaseWarn: LOGS.filter((l) => /used after release/.test(l.message ?? '')).length, cleaned: LOGS.filter((l) => /cleaned local sandbox/.test(l.message ?? '')).length });
        expect(steps.some((s) => s.startsWith('tool-end:slowShell'))).toBe(true);
    });

    it('O4 M29: failure before the try; the real observer releases once', async () => {
        agents.generalist = loopAgent([{ text: 'done' }]);
        const ctx = await pipeline(4);
        const dir = ctx.sandboxHandle.sandboxId;
        jest.spyOn(stage as any, 'resolveCustomAgents').mockRejectedValueOnce(new Error('config read failed'));
        const r = await (stage as any).executeStage(ctx);
        const afterStage = { releaseCalls: steps.filter((s) => s === 'release-entered').length, count: (await doc(4))?.leaseCount, dir: fs.existsSync(dir) };
        await observer().onPipelineFinish(r, {} as any);
        const afterObserver = { releaseCalls: steps.filter((s) => s === 'release-entered').length, doc: await doc(4), dir: fs.existsSync(dir) };
        ev('O4', 'result', { afterStage, afterObserver, errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)), usage: ctx.sandboxHandle.usage?.() });
        expect(afterStage.releaseCalls).toBe(0);
        expect(afterObserver.releaseCalls).toBe(1);
        expect(afterObserver.dir).toBe(false);
    });

    it('O5 M3 local: the AgentReviewStage stage log keeps prior metadata next to sandboxUsage', async () => {
        agents.generalist = loopAgent([{ tool: 'readFile', input: { path: 'a.ts' } }, { text: 'done' }]);
        const ctx = await pipeline(5);
        const r = await (stage as any).executeStage(ctx);
        const obs = observer();
        const logStage = jest.spyOn(obs as any, 'logStage');
        const r2: any = { ...r, dedupTrace: r.dedupTrace ?? { qa: 'prior-dedup-trace' }, errors: [...(r.errors ?? []), { stage: 'AgentReviewStage', substage: 'custom-agent', error: new Error('partial'), severity: 'low', metadata: {} }] };
        await obs.onStageFinish('AgentReviewStage', r2, {} as any);
        await obs.onStageFinish('CreateFileCommentsStage', r2, {} as any);
        const calls = logStage.mock.calls.map((c: any[]) => ({ stage: c[0], status: c[1], meta: c[4]?.additionalMetadata }));
        ev('O5', 'stage-logs', { calls: JSON.parse(JSON.stringify(calls)) });
        const ars = calls.find((c) => c.stage === 'AgentReviewStage');
        expect(ars?.meta?.sandboxUsage?.consumer).toBe('review');
        expect(ars?.meta?.dedupTrace).toBeDefined();
        expect(ars?.meta?.partialErrors?.length).toBe(1);
        expect(calls.find((c) => c.stage === 'CreateFileCommentsStage')?.meta?.sandboxUsage).toBeUndefined();
        await obs.onPipelineFinish(r, {} as any);
    });

    it('O6 M36: Kody Rules agent reading the checkout through repoLookup is a reader the release waits for', async () => {
        agents.generalist = loopAgent([{ text: 'done' }]);
        agents.kodyRules = async (inp: any) => {
            steps.push('kody-rules-start');
            await new Promise((r) => setTimeout(r, 400));
            const lookup = inp.repoLookup;
            const txt = await lookup.read('policy.ts', 1, 5);
            steps.push(`kody-rules-read:${String(txt).trim().slice(0, 30)}`);
            return { agentName: 'kody-rules', suggestions: [], turnsUsed: 1, durationMs: 400 };
        };
        const ctx = await pipeline(6);
        jest.spyOn(stage as any, 'prepareKodyRulesForReview').mockResolvedValue([{ uuid: 'r1', title: 'qa rule', rule: 'Respect MAX_CLASS_SIZE', status: 'active', type: 'standard', severity: 'high', path: '**' }]);
        const r = await (stage as any).executeStage(ctx);
        await observer().onPipelineFinish(r, {} as any);
        ev('O6', 'order', { steps, repoLookupKeys: Object.keys((globalThis as any).__QA_HANDLE ?? {}).length, errors: (r.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)) });
        expect(steps.findIndex((s) => s.startsWith('kody-rules-read'))).toBeGreaterThan(-1);
        expect(steps.indexOf('release-entered')).toBeGreaterThan(steps.findIndex((s) => s.startsWith('kody-rules-read')));
    });

    it('O7 M36: knowledge doc resolved and read lazily from the checkout before the release', async () => {
        agents.generalist = async (inp: any) => {
            steps.push(`knowledge-reader:${!!inp.knowledgeReader}`);
            await new Promise((r) => setTimeout(r, 300));
            const res = inp.knowledgeReader ? await inp.knowledgeReader.readFile('policy.ts') : null;
            steps.push(`knowledge-read:${JSON.stringify(res)?.slice(0, 60)}`);
            return { agentName: 'generalist', suggestions: [finding], turnsUsed: 1, durationMs: 1 };
        };
        const ctx = await pipeline(7, { config: { knowledge: [{ path: 'policy.ts', kind: 'doc', linkedTo: ['main-review'] }] } });
        const r = await (stage as any).executeStage(ctx);
        await observer().onPipelineFinish(r, {} as any);
        const usage = ctx.sandboxHandle.usage?.();
        ev('O7', 'order', { steps, usage, warns: LOGS.filter((l) => l.level !== 'info' && /knowledge|Knowledge|used after release/.test((l.message ?? '') + (l.err ?? ''))).map((l) => l.message) });
        const iRead = steps.findIndex((s) => s.startsWith('knowledge-read:'));
        expect(iRead).toBeGreaterThan(-1);
        expect(steps.indexOf('release-entered')).toBeGreaterThan(iRead);
    });
});
