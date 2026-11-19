# QA #2204 — local harness, merge `8e50ce8` vs first parent `c5eb9f6`

Real code: `runChunkedReview` (inside the generalist) → `ReviewOrchestratorService` → `AgentReviewStage.executeStage` → `AutomationCodeReviewService.deriveFinalStatus`. Only the per-batch model call (`runBatch`) is stubbed. "First parent" = the worktree at the merge commit with only `batch-runner.ts` checked out from `c5eb9f6` (the PR changed nothing else in product code).

| Scenario | First parent: stage errors / final status | Merge: stage errors / final status |
|---|---|---|
| A one batch throws | none / **success** | partial `agent:generalist`: Agent "generalist" ended after 1ms without submitting a result — the review did not complete / **partial_error** |
| B no batch throws | none / **success** | none / **success** |
| C all batches throw | critical `agent:generalist`: first / **error** | critical `agent:generalist`: first / **error** |
| D truncated + throw | partial `agent:generalist`: Agent "generalist" had its turn truncated by the model provider after 0ms — the review did not complete / **partial_error** | partial `agent:generalist`: Agent "generalist" had its turn truncated by the model provider after 0ms — the review did not complete / **partial_error** |

Jest: merge 4/4 pass; first parent 1 failed (scenario A), 3 pass. The PR spec `batch-runner.spec.ts` passes 8/8 at the merge.

## Batch runner log, scenario A (merge)
```
[AGENT] generalist PR#7: reviewing 2 files in 2 batch(es)
[AGENT] generalist batch 1/2 starting: 1 files
[AGENT] generalist batch 1/2 completed: 0 findings
[AGENT] generalist batch 2/2 starting: 1 files
ERROR [AGENT] generalist batch 2/2 failed: Your prepayment credits are depleted
[AGENT] generalist PR#7 all batches done: 0 total findings in 1ms
```

## Harness source
```ts
/**
 * QA harness for #2204 (not part of the product). Real runChunkedReview inside
 * the generalist, real ReviewOrchestratorService, real AgentReviewStage, real
 * AutomationCodeReviewService.deriveFinalStatus. Only the per-batch model call
 * (runBatch) is stubbed: batch 1 returns, batch 2 throws a provider error.
 */
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from './agent-review.stage';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { LLM } from '@libs/llm/llm';
import { runChunkedReview } from '@libs/code-review/infrastructure/agents/collaborators/batch-runner';
import { ReviewOrchestratorService } from '@libs/code-review/infrastructure/agents/review-orchestrator.service';
import { AutomationCodeReviewService } from '@libs/automation/infrastructure/adapters/services/processAutomation/strategies/automationCodeReview';

jest.mock(
    '@libs/code-review/infrastructure/agents/engine/classify-severity',
    () => ({ classifySeverity: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock(
    '@libs/code-review/infrastructure/agents/engine/format-suggestion-content',
    () => ({ formatSuggestionContent: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock('@libs/llm/managed-slot', () => {
    const actual = jest.requireActual('@libs/llm/managed-slot');
    return { ...actual, hasManagedModelKey: jest.fn(() => false) };
});

const bigPatch = (name: string) =>
    `@@ -1,1 +1,400 @@\n${Array.from({ length: 400 }, (_, i) => `+const ${name}${i} = ${i};`).join('\n')}`;

const out = (over: Record<string, unknown> = {}) => ({
    suggestions: [],
    agentName: 'generalist',
    agentCategory: 'generalist',
    turnsUsed: 3,
    durationMs: 1,
    hitHardLimit: false,
    finishReason: 'stop',
    ...over,
});

function chunkedAgent(batches: Array<Record<string, unknown> | Error>) {
    const calls: string[][] = [];
    const logs: string[] = [];
    return {
        calls,
        logs,
        agent: {
            execute: jest.fn(async (input: any) => {
                const queue = [...batches];
                return runChunkedReview(input, {
                    identity: { name: 'generalist' } as any,
                    agentCategory: 'generalist',
                    startTime: Date.now(),
                    diffBudget: 3_000,
                    runBatch: async (b: any) => {
                        calls.push(b.changedFiles.map((f: any) => f.filename));
                        const next = queue.shift() ?? out();
                        if (next instanceof Error) throw next;
                        return next as any;
                    },
                    logger: {
                        log: (e: any) => logs.push(e.message),
                        error: (e: any) => logs.push('ERROR ' + e.message),
                    },
                });
            }),
        } as any,
    };
}

const idle = { execute: jest.fn(async () => out()) } as any;

function makeStage(generalist: any) {
    const orchestrator = new ReviewOrchestratorService(
        idle,
        idle,
        idle,
        generalist,
    );
    (orchestrator as any).logger = { log() {}, warn() {}, error() {}, debug() {} };
    const stage = new AgentReviewStage(
        {
            findLatestStageLog: jest.fn(),
            updateCodeReview: jest.fn(),
            updateStageLog: jest.fn(),
        } as any,
        { findByExternalId: jest.fn().mockResolvedValue(null) } as any,
        orchestrator as any,
        { runLLMInSpan: jest.fn(async ({ runFn }: any) => runFn?.()) } as any,
        {
            generateContext: jest.fn(),
            generateContextLegacy: jest.fn().mockResolvedValue(''),
        } as any,
        { isEnabled: jest.fn().mockResolvedValue(false) } as any,
        { getReleaseTrack: jest.fn().mockResolvedValue('stable') } as any,
        {
            getRepositories: jest.fn().mockResolvedValue([]),
            getCloneParams: jest.fn().mockResolvedValue(null),
        } as any,
    );
    return stage;
}

const ctx = () =>
    frozenContext({
        organizationAndTeamData: { organizationId: 'org-1', teamId: 'team-1' },
        repository: { id: 'repo-1', name: 'repo-1' },
        pullRequest: { number: 7 },
        platformType: 'GITHUB',
        changedFiles: [
            { filename: 'src/a.ts', patch: bigPatch('a') },
            { filename: 'src/b.ts', patch: bigPatch('b') },
        ],
        codeReviewConfig: {
            reviewOptions: { bug: true, security: true, performance: true },
            reviewMode: 'balanced',
            resolvedModelSlot: { provider: 'openai', model: 'gpt-4o-mini' },
        },
        validSuggestions: [],
        discardedSuggestions: [],
        errors: [],
    }) as any as CodeReviewPipelineContext;

const status = (result: any) =>
    (AutomationCodeReviewService.prototype as any).deriveFinalStatus.call(
        {},
        result,
    );

const summarize = (label: string, h: any, result: any) => {
    const errs = (result.errors ?? []).map((e: any) => ({
        substage: e.substage,
        severity: e.severity,
        message: String(e.error?.message ?? e.error),
    }));
    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify(
            { scenario: label, batches: h.calls, runnerLogs: h.logs, errors: errs, finalStatus: status(result) },
            null,
            1,
        ),
    );
    return errs;
};

let runSpy: jest.SpyInstance;
beforeEach(() => {
    runSpy = jest
        .spyOn(LLM, 'run')
        .mockResolvedValue({ groups: [], unique: [] } as any);
});
afterEach(() => runSpy?.mockRestore());

describe('QA #2204 harness', () => {
    it('A: batch 1 returns clean, batch 2 throws -> partial review', async () => {
        const h = chunkedAgent([out(), new Error('Your prepayment credits are depleted')]);
        const result = await (makeStage(h.agent) as any).executeStage(ctx());
        const errs = summarize('A one batch throws', h, result);
        expect(h.calls).toHaveLength(2);
        expect(errs).toEqual([
            expect.objectContaining({
                substage: 'agent:generalist',
                severity: 'partial',
            }),
        ]);
        expect(status(result)).toBe('partial_error');
    });

    it('B: every batch returns -> clean review', async () => {
        const h = chunkedAgent([out(), out()]);
        const result = await (makeStage(h.agent) as any).executeStage(ctx());
        const errs = summarize('B no batch throws', h, result);
        expect(errs).toEqual([]);
        expect(status(result)).toBe('success');
    });

    it('C: every batch throws -> agent failure (critical)', async () => {
        const h = chunkedAgent([new Error('first'), new Error('second')]);
        const result = await (makeStage(h.agent) as any).executeStage(ctx());
        const errs = summarize('C all batches throw', h, result);
        expect(errs[0]).toMatchObject({ substage: 'agent:generalist', severity: 'critical' });
        expect(status(result)).toBe('error');
    });

    it('D: batch 1 truncated, batch 2 throws -> reason stays truncated', async () => {
        const h = chunkedAgent([
            out({ hitHardLimit: true, finishReason: 'truncated' }),
            new Error('timeout'),
        ]);
        const result = await (makeStage(h.agent) as any).executeStage(ctx());
        const errs = summarize('D truncated + throw', h, result);
        expect(errs[0].message).toContain('truncated by the model provider');
    });
});

```