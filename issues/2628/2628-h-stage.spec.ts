import { Test, TestingModule } from '@nestjs/testing';
import { AgentReviewStage } from '@/code-review/pipeline/stages/agent-review.stage';
import { ReviewOrchestratorService } from '@/code-review/infrastructure/agents/review-orchestrator.service';
import { ObservabilityService } from '@/core/log/observability.service';
import { AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@/automation/domain/automationExecution/contracts/automation-execution.service';
import { GraphContextService } from '@/code-review/infrastructure/adapters/services/graph/graph-context.service';
import { FeatureGateService } from '@libs/feature-gate';
import { ORGANIZATION_SERVICE_TOKEN } from '@libs/organization/domain/organization/contracts/organization.service.contract';
import { REPOSITORY_SERVICE_TOKEN } from '@/code-review/domain/contracts/RepositoryService.contract';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { CodeReviewPipelineContext } from '@/code-review/pipeline/context/code-review-pipeline.context';
import { PlatformType } from '@/core/domain/enums';
import { CodeReviewVersion } from '@/core/domain/enums/code-review.enum';

const mockTracedGenerateText = jest.fn();
// Default: run the caller's `exec(model)` so dedup still hits mockTracedGenerateText.
const mockWithStructuredOutputFallback = jest.fn(
    async (_params: any, exec: (model: any) => Promise<any>) =>
        exec({ __mockModel: true }),
) as jest.Mock;
// Dedup + tiebreak now run through the ONE primitive (LLM.run). Mock it to reuse
// the same `mockTracedGenerateText` resolved value the existing tests set — LLM.run
// returns the PARSED object (executor extracts experimental_output/output/object),
// so unwrap it here. A rejection propagates (dedup fail-soft keeps all).
const mockLlmRun = jest.fn(async (..._args: any[]) => {
    const r: any = await mockTracedGenerateText();
    return r?.experimental_output ?? r?.output ?? r?.object;
});

// tracedGenerateText was relocated from the legacy agent-loop to @libs/llm/llm-call
// during the llm migration; mock it there so the stage's dedup LLM call is
// intercepted (preserve the module's other exports, e.g. AGENT_TIMEOUT_MS).
jest.mock('@libs/llm/llm-call', () => ({
    ...jest.requireActual('@libs/llm/llm-call'),
    tracedGenerateText: (...args: any[]) => mockTracedGenerateText(...args),
}));

jest.mock(
    '@libs/llm/byok-to-vercel',
    () => ({
        withStructuredOutputFallback: (...args: any[]) =>
            mockWithStructuredOutputFallback(...args),
        getModelName: jest.fn().mockReturnValue('test-model'),
        // Off-trial default: undefined override (the stage falls through to the
        // resolved slot / managed default). Split out of byok-to-vercel into
        // byok-defaults and re-exported; the stage calls it before building.
        trialDefaultModel: jest.fn().mockReturnValue(undefined),
        // The model builder the stage calls to construct the LanguageModel.
        buildModelFromSlot: jest.fn().mockReturnValue({ __mockModel: 'byok' }),
        // Platform (non-BYOK) model seam used by the summary/secondary paths.
        buildPlatformModel: jest
            .fn()
            .mockReturnValue({ __mockModel: 'platform' }),
    }),
);

jest.mock('@libs/llm/llm', () => ({
    LLM: { run: (...args: any[]) => mockLlmRun(...args) },
}));

// The dedup gate is `!slot && !hasManagedModelKey()` — skip (keep all) only when
// there is neither a BYOK slot NOR a managed key. These tests exercise the dedup
// MERGE logic (LLM.run is mocked), not the gate, so force a managed model to be
// "available". Without this the gate reads real env: hasManagedModelKey()'s cloud
// path checks API_FIREWORKS_API_KEY (NOT the API_OPEN_AI_API_KEY the tests set),
// so it passed only via ambient .env and flaked to keep-all when another suite
// left that env unset — surfacing as "expected 3, received 4".
jest.mock('@libs/llm/managed-slot', () => ({
    ...jest.requireActual('@libs/llm/managed-slot'),
    hasManagedModelKey: jest.fn(() => true),
}));

jest.mock('ai', () => ({
    generateText: jest.fn().mockResolvedValue({
        object: { classifications: [] },
        output: { classifications: [] },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }),
    Output: { object: jest.fn().mockReturnValue({}) },
    jsonSchema: jest.fn().mockReturnValue({}),
    stepCountIs: () => () => false,
    hasToolCall: () => () => false,
    tool: (opts: any) => opts,
}));

jest.mock('@libs/core/log/logger', () => ({
    createLogger: () => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
    }),
}));

describe('AgentReviewStage', () => {
    let stage: AgentReviewStage;
    let mockOrchestrator: jest.Mocked<ReviewOrchestratorService>;

    const createBaseContext = (
        overrides: Partial<CodeReviewPipelineContext> = {},
    ): CodeReviewPipelineContext =>
        ({
            organizationAndTeamData: {
                organizationId: 'org-123',
                teamId: 'team-456',
            } as any,
            repository: {
                id: 'repo-1',
                name: 'test-repo',
                fullName: 'org/test-repo',
            } as any,
            branch: 'main',
            pullRequest: {
                number: 42,
                title: 'Test PR',
                base: { repo: { fullName: 'org/repo' }, ref: 'main' },
                repository: {} as any,
                isDraft: false,
                stats: {
                    total_additions: 10,
                    total_deletions: 5,
                    total_files: 2,
                    total_lines_changed: 15,
                },
            },
            teamAutomationId: 'team-auto-1',
            origin: 'github',
            action: 'opened',
            platformType: PlatformType.GITHUB,
            codeReviewConfig: {
                codeReviewVersion: CodeReviewVersion.V3_AGENT,
                reviewOptions: { bug: true, security: true, performance: true },
            } as any,
            preparedFileContexts: [],
            validSuggestions: [],
            discardedSuggestions: [],
            correlationId: 'test-correlation-id',
            ...overrides,
        }) as CodeReviewPipelineContext;

    beforeEach(async () => {
        mockOrchestrator = {
            execute: jest.fn().mockResolvedValue({
                suggestions: [
                    {
                        relevantFile: 'src/auth.ts',
                        suggestionContent: 'Missing null check',
                        label: 'bug',
                        severity: 'high',
                        relevantLinesStart: 10,
                        relevantLinesEnd: 15,
                    },
                    {
                        relevantFile: 'src/api.ts',
                        suggestionContent: 'XSS vulnerability',
                        label: 'security',
                        severity: 'critical',
                        relevantLinesStart: 20,
                        relevantLinesEnd: 25,
                    },
                ],
                agentResults: [
                    {
                        agentName: 'bug-agent',
                        suggestions: [{}],
                        turnsUsed: 3,
                        durationMs: 1000,
                    },
                    {
                        agentName: 'security-agent',
                        suggestions: [{}],
                        turnsUsed: 5,
                        durationMs: 2000,
                    },
                ],
                totalDurationMs: 2500,
            }),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AgentReviewStage,
                {
                    provide: ReviewOrchestratorService,
                    useValue: mockOrchestrator,
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
    });

    // ---------------- QA #2628 harness H (stage level) ----------------
    const fs = require('fs');
    const REV = process.env.H_REV || 'unknown';
    const OUT = process.env.H_OUT || '/dev/null';
    const ev = (test: string, event: string, data: any = {}) =>
        fs.appendFileSync(OUT, JSON.stringify({ rev: REV, test, event, ...data }) + '\n');
    const deferred = <T = any>() => {
        let resolve!: (v: T) => void, reject!: (e: any) => void;
        const promise = new Promise<T>((r, j) => ((resolve = r), (reject = j)));
        return { promise, resolve, reject };
    };
    const handle = (cleanup: jest.Mock) => ({
        remoteCommands: { grep: jest.fn(), read: jest.fn(), listDir: jest.fn() },
        cleanup,
        type: 'e2b' as const,
        sandboxId: 'h-sbx',
        repoDir: '/home/user/repo',
        run: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        readFile: jest.fn().mockResolvedValue(''),
        writeFile: jest.fn().mockResolvedValue(undefined),
    });
    const ctxWith = (cleanup: jest.Mock, over: any = {}) =>
        createBaseContext({
            changedFiles: [{ filename: 'src/auth.ts' } as any, { filename: 'src/api.ts' } as any],
            sandboxHandle: handle(cleanup) as any,
            ...over,
        });
    const norm = (r: any) =>
        JSON.stringify({
            files: (r.fileAnalysisResults ?? []).map((f: any) => ({ file: f.file?.filename ?? f.filename, n: (f.analysis?.codeSuggestions ?? f.suggestions ?? []).length })),
            valid: (r.validSuggestions ?? []).map((s: any) => [s.relevantFile, s.relevantLinesStart, s.relevantLinesEnd, s.label, s.severity, s.suggestionContent]),
            errors: (r.errors ?? []).map((e: any) => [e.stage, e.severity, String(e.error?.message ?? e.error)]),
        });

    describe(`QA2628 H stage @${REV}`, () => {
        it('M5 deferred last reader: no release before the orchestrator settles; release precedes post-processing (dedup)', async () => {
            const steps: string[] = [];
            const cleanup = jest.fn(async () => void steps.push('release'));
            const gate = deferred<void>();
            const base = mockOrchestrator.execute.getMockImplementation()!;
            mockOrchestrator.execute.mockImplementationOnce(async (input: any) => {
                steps.push('orchestrator-start(last tool pending)');
                await gate.promise;
                steps.push('orchestrator-settled');
                return base(input);
            });
            mockLlmRun.mockImplementation(async () => {
                steps.push('post-processing-llm');
                return undefined;
            });
            const p = (stage as any).executeStage(ctxWith(cleanup));
            await new Promise((r) => setTimeout(r, 50));
            const releasedWhilePending = cleanup.mock.calls.length;
            gate.resolve();
            const result = await p;
            ev('M5', 'order', { steps, releasedWhilePending, cleanupCalls: cleanup.mock.calls.length, out: norm(result) });
            expect(releasedWhilePending).toBe(0);
            expect(cleanup).toHaveBeenCalledTimes(1);
            const iRel = steps.indexOf('release');
            const iOrc = steps.indexOf('orchestrator-settled');
            const iPost = steps.indexOf('post-processing-llm');
            expect(iRel).toBeGreaterThan(iOrc);
            if (iPost >= 0) expect(iRel).toBeLessThan(iPost);
        });

        it.each([
            ['balanced', {}],
            ['deep', { reviewMode: 'deep' }],
            ['custom-only', { onlyCustomAgent: 'qa-2628-capacity' }],
        ])('M6 %s: release waits for the whole orchestrator call', async (mode, over: any) => {
            const steps: string[] = [];
            const cleanup = jest.fn(async () => void steps.push('release'));
            const base = mockOrchestrator.execute.getMockImplementation()!;
            mockOrchestrator.execute.mockImplementationOnce(async (input: any) => {
                const readers = ['builtin', 'custom-agent', 'verify'].map((r, i) => new Promise<void>((res) => setTimeout(() => (steps.push(`${r}-settled`), res()), 20 * (3 - i))));
                await Promise.allSettled(readers);
                steps.push('orchestrator-settled');
                return base(input);
            });
            const ctx = ctxWith(cleanup, { codeReviewConfig: { ...(createBaseContext().codeReviewConfig as any), ...(over.reviewMode ? { reviewMode: over.reviewMode } : {}) }, ...(over.onlyCustomAgent ? { onlyCustomAgent: over.onlyCustomAgent } : {}) });
            await (stage as any).executeStage(ctx);
            ev('M6', mode, { steps, cleanupCalls: cleanup.mock.calls.length });
            expect(cleanup).toHaveBeenCalledTimes(1);
            expect(steps.indexOf('release')).toBe(steps.indexOf('orchestrator-settled') + 1);
        });

        it('M28 orchestrator failure modes: release once after settlement; error kept', async () => {
            const out: any = {};
            for (const [name, impl] of [
                ['throws', async () => { throw new Error('model not found'); }],
                ['429-then-success', async (input: any) => { await new Promise((r) => setTimeout(r, 30)); return mockOrchestrator.execute.getMockImplementation()!(input); }],
                ['timeout', async () => { await new Promise((r) => setTimeout(r, 30)); throw Object.assign(new Error('AGENT_TIMEOUT'), { name: 'TimeoutError' }); }],
            ] as const) {
                const steps: string[] = [];
                const cleanup = jest.fn(async () => void steps.push('release'));
                const base = mockOrchestrator.execute.getMockImplementation()!;
                mockOrchestrator.execute.mockImplementationOnce(async (input: any) => { try { return await (impl as any)(input); } finally { steps.push('orchestrator-settled'); } });
                const r = await (stage as any).executeStage(ctxWith(cleanup));
                out[name] = { steps, cleanupCalls: cleanup.mock.calls.length, errors: (r.errors ?? []).map((e: any) => [e.stage, e.severity ?? 'critical', String(e.error?.message ?? e.error)]), results: (r.fileAnalysisResults ?? []).length };
                mockOrchestrator.execute.mockImplementation(base);
            }
            ev('M28', 'result', out);
            for (const k of Object.keys(out)) {
                expect(out[k].cleanupCalls).toBe(1);
                expect(out[k].steps).toEqual(['orchestrator-settled', 'release']);
            }
            expect(out.throws.errors.length).toBeGreaterThan(0);
            expect(out.timeout.errors.length).toBeGreaterThan(0);
            expect(out['429-then-success'].errors).toEqual([]);
        });

        it('M29 paths that never reach the orchestrator', async () => {
            const out: any = {};
            // empty changed files: early return, the stage does not release
            {
                const cleanup = jest.fn(async () => undefined);
                await (stage as any).executeStage(ctxWith(cleanup, { changedFiles: [] }));
                out.emptyFiles = { cleanupCalls: cleanup.mock.calls.length };
            }
            // failure before the try (custom agents resolution throws)
            {
                const cleanup = jest.fn(async () => undefined);
                const spy = jest.spyOn(stage as any, 'resolveCustomAgents').mockRejectedValueOnce(new Error('config read failed'));
                let thrown: any;
                let r: any;
                try { r = await (stage as any).executeStage(ctxWith(cleanup)); } catch (e) { thrown = e; }
                out.preTryFailure = { cleanupCalls: cleanup.mock.calls.length, thrown: thrown ? String(thrown.message) : null, errors: (r?.errors ?? []).length };
                spy.mockRestore();
            }
            // failure while assembling the orchestrator input (inside the try)
            {
                const cleanup = jest.fn(async () => undefined);
                const spy = jest.spyOn(stage as any, 'resolveGitHubToken').mockRejectedValueOnce(new Error('token lookup failed'));
                let thrown: any;
                let r: any;
                try { r = await (stage as any).executeStage(ctxWith(cleanup)); } catch (e) { thrown = e; }
                out.inputAssemblyFailure = { cleanupCalls: cleanup.mock.calls.length, thrown: thrown ? String(thrown.message) : null, errors: (r?.errors ?? []).length, orchestratorCalls: mockOrchestrator.execute.mock.calls.length };
                spy.mockRestore();
            }
            ev('M29', 'result', out);
            expect(out.emptyFiles.cleanupCalls).toBe(0);
            expect(out.inputAssemblyFailure.cleanupCalls).toBe(1);
        });

        it('M31 parent abort during the orchestrator: one release, not a successful empty review', async () => {
            const ac = new AbortController();
            const steps: string[] = [];
            const cleanup = jest.fn(async () => void steps.push('release'));
            mockOrchestrator.execute.mockImplementationOnce(
                (_input: any) => new Promise((_res, rej) => ac.signal.addEventListener('abort', () => (steps.push('orchestrator-aborted'), rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))),
            );
            const p = (stage as any).executeStage(ctxWith(cleanup, { parentSignal: ac.signal }));
            await new Promise((r) => setTimeout(r, 20));
            ac.abort();
            let r: any, thrown: any;
            try { r = await p; } catch (e) { thrown = e; }
            ev('M31', 'result', { steps, cleanupCalls: cleanup.mock.calls.length, thrown: thrown ? String(thrown.message) : null, errors: (r?.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)), results: (r?.fileAnalysisResults ?? []).length });
            expect(cleanup).toHaveBeenCalledTimes(1);
            expect(thrown || (r.errors ?? []).length > 0).toBeTruthy();
        });

        it('M38/M42 identical inputs give identical output; a release failure alone is not an agent failure', async () => {
            const ok = jest.fn(async () => undefined);
            const r1 = await (stage as any).executeStage(ctxWith(ok));
            const bad = jest.fn(async () => { throw new Error('mongo down'); });
            const r2 = await (stage as any).executeStage(ctxWith(bad));
            mockOrchestrator.execute.mockRejectedValueOnce(new Error('agent crashed'));
            const r3 = await (stage as any).executeStage(ctxWith(jest.fn(async () => undefined)));
            ev('M38', 'output', { normal: norm(r1) });
            ev('M42', 'result', { releaseFailure: norm(r2), agentFailure: norm(r3) });
            expect(norm(r2)).toBe(norm(r1));
            expect((r3.errors ?? []).length).toBeGreaterThan(0);
        });
    });
});
