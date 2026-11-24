/* QA #2671 harness — not committed. Runs the real AgentReviewStage post-processing,
 * CreatePrLevelCommentsStage, CreateFileCommentsStage, CommentManagerService,
 * CodeManagementService and GithubService; stubs only the orchestrator output
 * (scripted model findings), LLM side calls, octokit transport and persistence. */
import * as fs from 'fs';
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from './agent-review.stage';
import { CreatePrLevelCommentsStage } from './create-pr-level-comments.stage';
import { CreateFileCommentsStage } from './create-file-comments.stage';
import { CommentManagerService } from '@libs/code-review/infrastructure/adapters/services/commentManager.service';
import { SuggestionService } from '@libs/code-review/infrastructure/adapters/services/suggestion.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { GithubService } from '@libs/platform/infrastructure/adapters/services/github/github.service';
import { LLM } from '@libs/llm/llm';
import { resolveAgentPrompt } from '@libs/common/utils/codeManagement/suggestion-comment-blocks';

jest.mock('@libs/core/log/logger', () => {
    const mk = (component: string) => {
        const push = (level: string) => (args: any) => {
            ((globalThis as any).__qaLogs ??= []).push({ level, component, message: String(args?.message ?? '') + (args?.error ? ' ERR=' + String(args.error?.message ?? args.error).slice(0,300) : '') });
        };
        return { log: push('log'), error: push('error'), warn: push('warn'), debug: push('debug'), info: push('info') };
    };
    return { createLogger: mk };
});
jest.mock('@libs/mcp-server/services/mcp-manager.service', () => ({
    MCPManagerService: jest.fn(),
}));
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

jest.mock('@morphllm/morphsdk', () => ({
    applyEdit: jest.fn(async ({ originalCode, codeEdit, instruction, filepath }: any) => {
        const m = /QA-EDIT (\d+)-(\d+)/.exec(instruction);
        const [a, b] = [Number(m[1]), Number(m[2])];
        const lines = originalCode.split('\n');
        const merged = [...lines.slice(0, a - 1), ...codeEdit.split('\n'), ...lines.slice(b)].join('\n');
        const { createTwoFilesPatch } = jest.requireActual('diff');
        ((globalThis as any).__qaEdits ??= []).push({ filepath, a, b });
        return { mergedCode: merged, udiff: createTwoFilesPatch(filepath, filepath, originalCode, merged) };
    }),
}));
jest.mock('@llamaduck/forgejo-ts', () => {
    const actual = jest.requireActual('@llamaduck/forgejo-ts');
    const fx = () => JSON.parse(require('fs').readFileSync(process.env.QA_FJ as string, 'utf8'));
    return {
        ...actual,
        repoGetPullRequestFiles: jest.fn(async (req: any) => ({ data: req.query.page === 1 ? fx().files : [], response: { ok: true, status: 200 } })),
        repoDownloadPullDiffOrPatch: jest.fn(async () => ({ data: fx().diff, response: { ok: true, status: 200 } })),
        issueCreateComment: jest.fn(async (req: any) => {
            ((globalThis as any).__fjIssue ??= []).push({ path: req.path, body: req.body.body });
            return { data: { id: 900 + (globalThis as any).__fjIssue.length }, response: { ok: true, status: 201 } };
        }),
        repoCreatePullReview: jest.fn(async (req: any) => {
            ((globalThis as any).__fjReview ??= []).push(req.body);
            return { data: { id: 55, comments: [{ id: 56 }] }, response: { ok: true, status: 200 } };
        }),
    };
});
const OUT = process.env.QA_OUT || '/tmp/qa2671-out.json';
const results: Record<string, any> = {};
const logs: Array<{ level: string; message: string }> = ((globalThis as any).__qaLogs ??= []);

const rec = (k: string, v: any) => {
    results[k] = v;
};

// ---------- fixture ----------
const RENAMED = 'qa2671/instrumentation-client.ts';
const OLD = 'qa2671/instrumentation.ts';
const EDITED = 'qa2671/renamed-and-edited.ts';
const CONTROL = 'qa2671/user.ts';
const H1930 = 'qa2671/attendance.ts';
const WIDE = 'qa2671/report.ts';

const addLines = (start: number, n: number) =>
    [`@@ -${start - 1},0 +${start},${n} @@`]
        .concat(Array.from({ length: n }, (_, i) => `+const l${start + i} = ${i};`))
        .join('\n');

const PATCH_CONTROL = ['@@ -10,2 +10,3 @@', ' const a = 1;', '+const b = 2;'].join('\n');
const PATCH_EDITED = ['@@ -10,1 +10,4 @@', ' const x = 1;', '+log(student.sessionToken);', '+const y = 2;', '+const z = 3;'].join('\n');

const F1 = () => [
    { filename: CONTROL, status: 'modified', patch: PATCH_CONTROL },
    { filename: RENAMED, previous_filename: OLD, status: 'renamed' },
    { filename: EDITED, previous_filename: 'qa2671/edited.ts', status: 'renamed', patch: PATCH_EDITED },
    { filename: H1930, status: 'modified', patch: addLines(19, 12) },
    { filename: WIDE, status: 'modified', patch: addLines(120, 61) },
];

let n = 0;
const f = (file: string | undefined, s: number | undefined, e: number | undefined, over: Record<string, unknown> = {}) => ({
    relevantFile: file,
    relevantLinesStart: s,
    relevantLinesEnd: e,
    label: 'security',
    severity: 'high',
    oneSentenceSummary: `QA2671-${++n} session token written to telemetry`,
    suggestionContent: `QA2671-${n} The student session token is logged; remove it.`,
    fullExplanation: `QA2671-${n} FULL explanation: the token reaches telemetry.`,
    improvedCode: '',
    ...over,
});

// ---------- stage ----------
const makeStage = () => {
    const reviewOrchestrator = { execute: jest.fn() };
    const stage = new AgentReviewStage(
        { findLatestStageLog: jest.fn(), updateCodeReview: jest.fn(), updateStageLog: jest.fn() } as any,
        { findByExternalId: jest.fn().mockResolvedValue(null) } as any,
        reviewOrchestrator as any,
        { runLLMInSpan: jest.fn(async ({ runFn }: any) => runFn?.()) } as any,
        { generateContext: jest.fn(), generateContextLegacy: jest.fn() } as any,
        { isEnabled: jest.fn().mockResolvedValue(false) } as any,
        { getReleaseTrack: jest.fn().mockResolvedValue('stable') } as any,
        { getRepositories: jest.fn().mockResolvedValue([]), getCloneParams: jest.fn().mockResolvedValue(null) } as any,
    );
    return { stage, reviewOrchestrator };
};

const baseCtx = (over: Record<string, any> = {}) =>
    frozenContext({
        organizationAndTeamData: { organizationId: 'org-A', teamId: 'team-A' },
        repository: { id: 'repo-A', name: 'claude-athena', language: 'typescript' },
        pullRequest: { number: 7, head: { sha: 'head-sha' } },
        platformType: 'GITHUB',
        changedFiles: F1(),
        codeReviewConfig: {
            reviewOptions: { bug: true, security: true, performance: true },
            resolvedModelSlot: { provider: 'openai', model: 'gpt-4o-mini' },
            kodyRules: [
                { uuid: 'rule-token', title: 'no session tokens in logs', rule: 'Never log student session tokens.', severity: 'high' },
            ],
        },
        validSuggestions: [],
        discardedSuggestions: [],
        errors: [],
        prAllCommits: [{ sha: 'head-sha' }],
        fileMetadata: new Map(),
        ...over,
    }) as any;

const runStage = async (suggestions: any[], over: Record<string, any> = {}) => {
    const { stage, reviewOrchestrator } = makeStage();
    reviewOrchestrator.execute.mockResolvedValue({ suggestions, agentResults: [], failures: [], incomplete: [], warnings: [] });
    const ctx = baseCtx(over);
    const out = await (stage as any).executeStage(ctx);
    return { ctx, out };
};

const summarize = (out: any) => ({
    prLevel: (out.validSuggestionsByPR ?? []).map((s: any) => ({
        label: s.label,
        severity: s.severity,
        suggestionContent: s.suggestionContent,
        fullExplanation: s.fullExplanation,
        agentPrompt: (() => { try { return resolveAgentPrompt(s); } catch { return null; } })(),
        customAgent: s.customAgent ?? null,
        brokenKodyRulesIds: s.brokenKodyRulesIds ?? null,
    })),
    validSuggestions: (out.validSuggestions ?? []).map((s: any) => ({ file: s.relevantFile, start: s.relevantLinesStart, end: s.relevantLinesEnd, label: s.label, tag: s.oneSentenceSummary?.slice(0, 10), customAgent: s.customAgent?.id ?? null })),
    inlineByFile: (out.fileAnalysisResults ?? []).map((r: any) => ({ file: r.file?.filename, n: (r.validSuggestionsToAnalyze ?? []).length })),
    discarded: (out.discardedSuggestions ?? []).map((s: any) => ({ file: s.relevantFile, start: s.relevantLinesStart, end: s.relevantLinesEnd, status: s.priorityStatus, tag: s.oneSentenceSummary?.slice(0, 10) })),
});

// ---------- delivery (real CommentManager -> CodeManagement -> GithubService) ----------
type Mode = { issue?: 'ok' | '503' | 'noid' | '403'; review?: 'ok' | '403' | 'reject-reversed' };
const makeGithub = (calls: any[], mode: Mode) => {
    const gh = new GithubService({} as any, {} as any, {} as any, { getFromCache: jest.fn(), addToCache: jest.fn() } as any, { get: jest.fn() } as any);
    jest.spyOn(gh as any, 'getGithubAuthDetails').mockResolvedValue({ org: 'kodus-olimpo', authMode: 'token' });
    let id = 1000;
    jest.spyOn(gh as any, 'instanceOctokit').mockResolvedValue({
        issues: {
            createComment: async (req: any) => {
                calls.push({ api: 'issues.createComment', req: { owner: req.owner, repo: req.repo, issue_number: req.issue_number, body: req.body } });
                if (mode.issue === '503') { const e: any = new Error('Service Unavailable'); e.status = 503; throw e; }
                if (mode.issue === '403') { const e: any = new Error('Forbidden'); e.status = 403; throw e; }
                if (mode.issue === 'noid') return { data: {} };
                return { data: { id: ++id } };
            },
        },
        pulls: {
            createReviewComment: async (req: any) => {
                const { body, ...rest } = req;
                calls.push({ api: 'pulls.createReviewComment', req: rest, bodyHasSuggestionBlock: /```suggestion/.test(String(body)) });
                if (mode.review === '403' && calls.filter((c) => c.api === 'pulls.createReviewComment').length === 1) {
                    const e: any = new Error('Forbidden'); e.status = 403; throw e;
                }
                if (req.start_line !== undefined && req.start_line > req.line) {
                    throw new Error('Validation Failed: {"resource":"PullRequestReviewComment","code":"custom","field":"pull_request_review_thread.start_line","message":"start_line must precede line"}');
                }
                return { data: { id: ++id, pull_request_review_id: 77 } };
            },
        },
    });
    return gh;
};

const makeCommentManager = (calls: any[], mode: Mode) => {
    const gh = makeGithub(calls, mode);
    const cms = new CodeManagementService(
        { findOne: jest.fn().mockResolvedValue({ platform: 'GITHUB' }) } as any,
        { getCodeManagementService: () => gh } as any,
    );
    (cms as any).getCommitsForPullRequestForCodeReview = async () => [{ sha: 'head-sha' }];
    return new CommentManagerService({} as any, {} as any, {} as any, {} as any, cms as any, {} as any);
};

const suggestionSvc = () => {
    const s: any = Object.create(SuggestionService.prototype);
    s.logger = { log: () => {}, error: () => {}, warn: () => {}, debug: () => {} };
    return s;
};

const postPrLevel = async (stageOut: any, mode: Mode = { issue: 'ok' }, persist: 'ok' | 'throw' = 'ok') => {
    const calls: any[] = [];
    const saved: any[] = [];
    const cm = makeCommentManager(calls, mode);
    const stage = new CreatePrLevelCommentsStage(cm as any, suggestionSvc(), {
        addPrLevelSuggestions: async (...args: any[]) => {
            if (persist === 'throw') throw new Error('mongo down');
            saved.push(args[3]);
        },
    } as any);
    const out = await (stage as any).executeStage(stageOut);
    return {
        calls,
        saved: saved.flat().map((s: any) => ({ id: s.id, deliveryStatus: s.deliveryStatus, commentId: s.comment?.id ?? null, label: s.label })),
        results: (out.prLevelCommentResults ?? []).map((r: any) => ({ deliveryStatus: r.deliveryStatus, commentId: r.codeReviewFeedbackData?.commentId ?? null })),
    };
};

const postInline = async (validSuggestions: any[], discarded: any[] = [], changedFiles = F1(), mode: Mode = { review: 'ok' }) => {
    const calls: any[] = [];
    const cm = makeCommentManager(calls, mode);
    const saved: any[] = [];
    const stage = new CreateFileCommentsStage(cm as any, { aggregateAndSaveDataStructure: async (...a: any[]) => saved.push(a) } as any, {
        resolveImplementedSuggestionsOnPlatform: jest.fn().mockResolvedValue(undefined),
        verifyIfSuggestionsWereSent: jest.fn().mockResolvedValue([]),
        extractRepriorizedSuggestions: jest.fn().mockReturnValue({ repriorizedSuggestions: [], filteredDiscardedSuggestions: [] }),
    } as any);
    const ctx = baseCtx({ changedFiles, validSuggestions, discardedSuggestions: discarded });
    const out = await (stage as any).executeStage(ctx);
    return {
        calls,
        lineComments: (out.lineComments ?? []).map((r: any) => ({ path: r.comment?.path, start_line: r.comment?.start_line, line: r.comment?.line, deliveryStatus: r.deliveryStatus, tag: r.comment?.suggestion?.oneSentenceSummary?.slice(0, 10) })),
    };
};

const msgs = (re: RegExp) => logs.filter((l) => re.test(l.message)).map((l) => `${l.level}: ${l.message}`);

beforeAll(() => {
    jest.spyOn(LLM, 'run').mockRejectedValue(new Error('no model in harness'));
});
afterAll(() => {
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
});
beforeEach(() => { logs.length = 0; n = 0; });


// ===================== audit round (A2, A3, A6, A7, A8, X-S10) =====================
import { ValidateSuggestionsStage } from './validate-suggestions.stage';
import { GetPullRequestSuggestionsUseCase } from '@libs/code-review/application/use-cases/pullRequests/get-pull-request-suggestions.use-case';
import { ForgejoService } from '@libs/platform/infrastructure/adapters/services/forgejo.service';
import { toRecord, toRecordFromPrLevel } from '@libs/code-review/infrastructure/adapters/services/pr-decision-store.service';

const FX = JSON.parse(fs.readFileSync(process.env.QA_FX as string, 'utf8'));

// Delivery + persistence with every selector captured, one shared CommentManager (production singleton shape).
const makeIdentityDelivery = () => {
    const calls: any[] = [];
    const auth: any[] = [];
    const persisted: any[] = [];
    const gh = new GithubService({} as any, {} as any, {} as any, { getFromCache: jest.fn(), addToCache: jest.fn() } as any, { get: jest.fn() } as any);
    jest.spyOn(gh as any, 'getGithubAuthDetails').mockImplementation(async (otd: any) => {
        auth.push({ fn: 'getGithubAuthDetails', organizationId: otd?.organizationId, teamId: otd?.teamId });
        return { org: otd?.organizationId === 'org-A' ? 'owner-a' : 'owner-b', authMode: 'token' };
    });
    let id = 5000;
    jest.spyOn(gh as any, 'instanceOctokit').mockImplementation(async (otd: any) => {
        auth.push({ fn: 'instanceOctokit', organizationId: otd?.organizationId, teamId: otd?.teamId });
        return {
            issues: {
                createComment: async (req: any) => {
                    await new Promise((r) => setTimeout(r, req.repo === 'athena-a' ? 15 : 1));
                    calls.push({ owner: req.owner, repo: req.repo, issue_number: req.issue_number, tag: /TAG-[AB]/.exec(req.body)?.[0] ?? null });
                    return { data: { id: ++id } };
                },
            },
        };
    });
    const cms = new CodeManagementService({ findOne: jest.fn().mockResolvedValue({ platform: 'GITHUB' }) } as any, { getCodeManagementService: () => gh } as any);
    const cm = new CommentManagerService({} as any, {} as any, {} as any, {} as any, cms as any, {} as any);
    const stage = new CreatePrLevelCommentsStage(cm as any, suggestionSvc(), {
        addPrLevelSuggestions: async (prNumber: number, repoId: string, repoName: string, sugs: any[], otd: any) => {
            persisted.push({ prNumber, repoId, repoName, organizationId: otd?.organizationId, teamId: otd?.teamId, tags: sugs.map((s) => /TAG-[AB]/.exec(s.suggestionContent)?.[0] ?? null), commentIds: sugs.map((s) => s.comment?.id ?? null) });
        },
    } as any);
    return { stage, calls, auth, persisted };
};

// Full PR-level delivery keeping the raw transformed records.
const postPrLevelRaw = async (stageOut: any, mode: Mode) => {
    const calls: any[] = [];
    const saved: any[] = [];
    const cm = makeCommentManager(calls, mode);
    const stage = new CreatePrLevelCommentsStage(cm as any, suggestionSvc(), { addPrLevelSuggestions: async (...a: any[]) => saved.push(...a[3]) } as any);
    await (stage as any).executeStage(stageOut);
    return { calls, saved };
};

const ATT_CONTENT = Array.from({ length: 30 }, (_, i) => `const v${i + 1} = ${i + 1}; // line ${i + 1}`).join('\n');

describe('QA2671 audit harness', () => {
    it('A3/M13 rule with configured MEDIUM severity, threshold high, applyFiltersToKodyRules false/true', async () => {
        const res: Record<string, any> = {};
        const rules = [{ uuid: 'rule-med', title: 'qa2671 medium rule', rule: 'Never log student session tokens.', severity: 'medium' }];
        for (const [name, flag] of Object.entries({ krFalse: false, krTrue: true })) {
            logs.length = 0;
            const { out } = await runStage([
                f(RENAMED, 19, 30, { label: 'kody_rules', severity: 'medium', brokenKodyRulesIds: ['rule-med'] }),
                f(CONTROL, 11, 11, { label: 'kody_rules', severity: 'medium', brokenKodyRulesIds: ['rule-med'], suggestionContent: 'QA2671 rule on inline control file' }),
                f(RENAMED, 19, 30, { label: 'bug', severity: 'medium', suggestionContent: 'QA2671 native medium control' }),
            ], {
                codeReviewConfig: { ...baseCtx().codeReviewConfig, kodyRules: rules, suggestionControl: { maxSuggestions: 9, severityLevelFilter: 'high', applyFiltersToKodyRules: flag } },
            });
            const s = summarize(out);
            res[name] = {
                prLevel: s.prLevel.map((p: any) => `${p.label}/${p.severity}: ${p.suggestionContent.slice(0, 60)}`),
                inline: s.validSuggestions.map((v: any) => `${v.label}@${v.file}:${v.start}`),
                discarded: (out.discardedSuggestions ?? []).map((d: any) => `${d.label}/${d.severity}@${d.relevantFile}:${d.relevantLinesStart} -> ${d.priorityStatus}`),
                logs: msgs(/severity|Severity|filter/i),
            };
        }
        rec('A3', res);
    });

    it('X-S10/M17 inline stage with both endpoints omitted, and synthetic 0 / negative / NaN', async () => {
        const res: Record<string, any> = {};
        const cases: Record<string, [any, any]> = { both_omitted: [undefined, undefined], synthetic_zero: [0, 0], synthetic_negative: [-3, 5], synthetic_nan: [NaN, NaN], synthetic_end_only_0: [undefined, 0] };
        for (const [name, [a, b]] of Object.entries(cases)) {
            const s = { ...f(H1930, a, b, { label: 'bug' }), id: `xs10-${name}` };
            const inl = await postInline([s]);
            res[name] = { posts: inl.calls.map((c) => ({ api: c.api, start_line: c.req.start_line, line: c.req.line })), lineComments: inl.lineComments, logs: msgs(/line comment|Error|mismatch/i).slice(0, 4) };
        }
        rec('XS10', res);
    });

    it('A6/M23 real ValidateSuggestionsStage -> candidate -> validatedData -> inline stage -> GitHub request', async () => {
        const res: Record<string, any> = {};
        const file = { filename: H1930, status: 'modified', patch: addLines(19, 12), fileContent: ATT_CONTENT };
        const mk = (id: string, s: number, e: number, edit: [number, number]) => ({
            ...f(H1930, s, e, { label: 'bug' }),
            id,
            existingCode: ATT_CONTENT.split('\n').slice(edit[0] - 1, edit[1]).join('\n'),
            improvedCode: Array.from({ length: edit[1] - edit[0] + 1 }, (_, i) => `const fixed${edit[0] + i} = ${edit[0] + i};`).join('\n'),
            llmPrompt: `QA-EDIT ${edit[0]}-${edit[1]} replace the lines`,
        });
        const inputs = [mk('val-asc', 20, 22, [20, 22]), mk('val-rev', 22, 20, [20, 22]), mk('val-wide-rev', 40, 20, [20, 21])];
        (globalThis as any).__qaEdits = [];
        const stage = new ValidateSuggestionsStage(
            { validateFiles: jest.fn(async (c: any[]) => new Set(c.map((x) => x.id))) } as any,
            { checkSuggestionSimplicity: jest.fn(async () => ({ isSimple: true })), validateWithLLM: jest.fn(async () => ({ isValid: true })) } as any,
        );
        const ctx = baseCtx({ changedFiles: [file], validSuggestions: inputs, codeReviewConfig: { ...baseCtx().codeReviewConfig, enableCommittableSuggestions: true } });
        logs.length = 0;
        const out = await (stage as any).executeStage(ctx);
        const validated = (out.validSuggestions ?? []).map((s: any) => ({ id: s.id, isCommittable: s.isCommittable ?? null, start: s.relevantLinesStart, end: s.relevantLinesEnd, validatedData: s.validatedData ? { lineStart: s.validatedData.lineStart, lineEnd: s.validatedData.lineEnd, code: s.validatedData.code } : null }));
        const inl = await postInline(out.validSuggestions, [], [file]);
        res.edits = (globalThis as any).__qaEdits;
        res.validated = validated;
        res.posts = inl.calls.map((c) => ({ start_line: c.req.start_line, line: c.req.line, path: c.req.path, bodyHasSuggestionBlock: c.bodyHasSuggestionBlock }));
        res.lineComments = inl.lineComments;
        res.logs = msgs(/ValidateSuggestions|committable|candidate|Discarding|complex/i);
        rec('A6', res);
    });

    it('A7/M28 two orgs, distinct identities, same PR number and filename, through delivery and persistence', async () => {
        const del = makeIdentityDelivery();
        const ctxFor = (org: 'A' | 'B') => ({
            organizationAndTeamData: { organizationId: `org-${org}`, teamId: `team-${org}` },
            repository: { id: `repo-${org}`, name: `athena-${org.toLowerCase()}`, fullName: `owner-${org.toLowerCase()}/athena-${org.toLowerCase()}`, language: 'typescript' },
        });
        const stageOuts: any = {};
        for (const org of ['A', 'B'] as const) {
            const r = await runStage([f(RENAMED, 19, 30, { label: 'bug', suggestionContent: `QA2671 TAG-${org} finding for org ${org}` })], ctxFor(org));
            stageOuts[org] = r.out;
        }
        // Concurrent delivery through ONE stage/manager instance (org A's provider call is the slower one).
        await Promise.all([(del.stage as any).executeStage(stageOuts.A), (del.stage as any).executeStage(stageOuts.B)]);
        const crossed = [
            ...del.calls.filter((c) => (c.tag === 'TAG-A') !== (c.owner === 'owner-a' && c.repo === 'athena-a')),
            ...del.persisted.filter((p) => p.tags.some((t: string) => (t === 'TAG-A') !== (p.organizationId === 'org-A' && p.repoId === 'repo-A' && p.repoName === 'athena-a'))),
        ];
        rec('A7', {
            stageOutputs: { A: summarize(stageOuts.A).prLevel.map((p: any) => p.suggestionContent), B: summarize(stageOuts.B).prLevel.map((p: any) => p.suggestionContent) },
            authSelectors: del.auth,
            providerRequests: del.calls,
            persistence: del.persisted,
            crossedIdentities: crossed,
        });
    });

    it('A8/M29 FAILED + SENT PR-level records through the real GetPullRequestSuggestionsUseCase (json + markdown)', async () => {
        const failedRun = await runStage([f(RENAMED, 19, 30, { label: 'bug', oneSentenceSummary: 'QA2671-FAILED rename finding', suggestionContent: 'QA2671-FAILED body' }), f(EDITED, 11, 12, { label: 'security' })]);
        const failed = await postPrLevelRaw(failedRun.out, { issue: '503' });
        const sentRun = await runStage([f(RENAMED, 19, 30, { label: 'security', oneSentenceSummary: 'QA2671-SENT rename finding', suggestionContent: 'QA2671-SENT body' })]);
        const sent = await postPrLevelRaw(sentRun.out, { issue: 'ok' });
        const sibling = failedRun.out.validSuggestions.find((s: any) => s.relevantFile === EDITED);
        const pr = {
            number: 7,
            provider: 'github',
            repository: { id: 'repo-A', name: 'claude-athena', fullName: 'kodus-olimpo/claude-athena' },
            files: [{ path: EDITED, suggestions: [{ ...sibling, deliveryStatus: 'sent' }] }],
            prLevelSuggestions: [...failed.saved, ...sent.saved],
        };
        const uc = new GetPullRequestSuggestionsUseCase({ filterActiveReviewSuggestions: jest.fn(async ({ suggestions }: any) => suggestions) } as any);
        const json = await uc.execute({ organizationId: 'org-A', pr, format: 'json' });
        const md = await uc.execute({ organizationId: 'org-A', pr, format: 'markdown' });
        rec('A8', {
            persistedPrLevel: pr.prLevelSuggestions.map((s: any) => ({ summary: s.oneSentenceSummary, deliveryStatus: s.deliveryStatus, commentId: s.comment?.id ?? null })),
            json: { count: json.suggestionsCount, prLevel: json.response.suggestions.prLevel.map((s: any) => `${s.oneSentenceSummary}/${s.deliveryStatus}`), files: json.response.suggestions.files.map((s: any) => `${s.filePath}/${s.deliveryStatus}`) },
            markdown: { count: md.suggestionsCount, mentionsFailed: md.response.markdown.includes('QA2671-FAILED'), mentionsSent: md.response.markdown.includes('QA2671-SENT'), text: md.response.markdown },
        });
    });

    it('A2/M9 incremental replay: real compare mapping, persisted history, new pure rename in the delta', async () => {
        // 1. Real GithubService.getChangedFilesSinceLastCommit over the captured (read-only) GitHub responses.
        const gh = new GithubService({} as any, {} as any, {} as any, { getFromCache: jest.fn(), addToCache: jest.fn() } as any, { get: jest.fn() } as any);
        jest.spyOn(gh as any, 'getGithubAuthDetails').mockResolvedValue({ org: 'kodus-olimpo', authMode: 'token' });
        const octo: any = {
            pulls: { listCommits: 'listCommits', listFiles: 'listFiles' },
            paginate: async (fn: string) => (fn === 'listCommits' ? FX.commits : FX.prFiles),
            repos: { compareCommitsWithBasehead: async (q: any) => ({ data: FX.compare, q }) },
        };
        jest.spyOn(gh as any, 'instanceOctokit').mockResolvedValue(octo);
        const delta = await gh.getChangedFilesSinceLastCommit({
            organizationAndTeamData: { organizationId: 'org-A', teamId: 'team-A' },
            repository: { id: 'repo-A', name: 'claude-athena' },
            prNumber: 12,
            lastCommit: { sha: 'e0c88e3a15bd254e4d00e9534abbef3bd0007d97' },
        });
        const SCHOOL = 'qa2671/school/attendance.ts';
        // 2. History exactly as the decision store maps persisted records (M1 PR-level + file-level sent).
        const history = [
            toRecordFromPrLevel({ id: '3ce86d4a-3bd4-485c-a0ea-c6aa6b385358', label: 'kody_rules', severity: 'high', brokenKodyRulesIds: ['rule-token'], suggestionContent: '`qa2671/instrumentation-client.ts:19` — Session tokens must never reach telemetry or logs. Drop `student.sessionToken` from the log call.', deliveryStatus: 'sent', comment: { id: 7132185747 }, createdAt: '2026-11-24T12:59:06.127Z' } as any),
            toRecord({ id: 'ab907d98', relevantFile: 'qa2671/attendance.ts', relevantLinesStart: 20, relevantLinesEnd: 22, label: 'bug', suggestionContent: 'lastAbsentee indexes absentees out of bounds and throws at runtime', deliveryStatus: 'sent', createdAt: '2026-11-24T12:59:09Z' } as any),
        ];
        // 3. Scripted repeat-check verdicts at the external LLM boundary; every other LLM call still fails.
        const judged: any[] = [];
        (LLM.run as jest.Mock).mockImplementation(async (args: any) => {
            if (args?.runName !== 'code-review-repeat-check') throw new Error('no model in harness');
            const blocks = [...String(args.user).matchAll(/<Finding n="(\d+)">([\s\S]*?)<\/Finding>/g)];
            const verdicts = blocks.map(([, n, body]) => {
                const where = /Where: (.*)/.exec(body)?.[1];
                const earlier = [...body.matchAll(/<Earlier id="([^"]+)">/g)].map((m) => m[1]);
                const isOldRoot = /instrumentation-client\.ts:19/.test(where ?? '');
                judged.push({ n: Number(n), where, earlierOffered: earlier });
                return isOldRoot && earlier.includes('pr-comment-7132185747')
                    ? { finding: Number(n), verdict: 'same_occurrence', earlierId: 'pr-comment-7132185747' }
                    : { finding: Number(n), verdict: 'different_problem', earlierId: null };
            });
            return { verdicts };
        });
        const variants: Record<string, any> = {};
        try {
          for (const [vname, need] of Object.entries({ rule_full_file_like_QA: 'full-file', rule_diff_only: 'diff-only' })) {
            judged.length = 0;
            logs.length = 0;
            const { out } = await runStage([
                f('qa2671/instrumentation-client.ts', 19, 19, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'], oneSentenceSummary: 'QA2671-OLDROOT token log in recordSessionStart', suggestionContent: 'QA2671-OLDROOT recordSessionStart logs student.sessionToken' }),
                f('qa2671/instrumentation-client.ts', 33, 33, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'], oneSentenceSummary: 'QA2671-NEWEDIT token log in recordSessionEnd', suggestionContent: 'QA2671-NEWEDIT recordSessionEnd logs student.sessionToken' }),
                f(SCHOOL, 9, 10, { label: 'bug', oneSentenceSummary: 'QA2671-NEWRENAME present count ignores duplicate records', suggestionContent: 'QA2671-NEWRENAME duplicate check-ins inflate the rate' }),
            ], { codeReviewConfig: { ...baseCtx().codeReviewConfig, kodyRules: [{ uuid: 'rule-token', title: 'no session tokens in logs', rule: 'Never log student session tokens.', severity: 'high', contextNeed: { need } }] }, changedFiles: delta, previousDecisions: history, pullRequest: { number: 12, head: { sha: '320ed78d8dab936c3fb3e389aeaa39ffb78ce47a' } }, repository: { id: 'repo-A', name: 'claude-athena', fullName: 'kodus-olimpo/claude-athena', language: 'typescript' } });
            const pr = await postPrLevel(out);
            const inl = await postInline(out.validSuggestions, out.discardedSuggestions, delta);
            variants[vname] = {
                deltaFiles: delta.map((d: any) => ({ filename: d.filename, status: d.status, hasPatch: !!d.patch, previous_filename: d.previous_filename ?? null })),
                historyRecords: history.map((h) => ({ suggestionId: h.suggestionId, relevantFile: h.relevantFile ?? null, label: h.label })),
                offeredToRepeatModel: [...judged],
                routing: summarize(out),
                prLevelPosts: pr.calls.map((c) => c.req.body.split('\n').find((l: string) => l.includes('qa2671/')) ?? null),
                prLevelSaved: pr.saved,
                inlinePosts: inl.calls.map((c) => ({ path: c.req.path, start_line: c.req.start_line, line: c.req.line })),
                logs: msgs(/REPEAT-CHECK|Dropped|PR-level|File-anchored/),
                offered: [...judged],
            };
          }
          rec('A2', variants);
        } finally {
            (LLM.run as jest.Mock).mockRejectedValue(new Error('no model in harness'));
        }
    });
    it('M7F Forgejo pure rename: real ForgejoService file mapping (captured Codeberg responses) -> routing -> PR-level post', async () => {
        const fj = new ForgejoService({} as any, {} as any, {} as any, { get: jest.fn() } as any);
        jest.spyOn(fj as any, 'getAuthDetails').mockResolvedValue({ host: 'https://codeberg.example', accessToken: 'x' });
        jest.spyOn(fj as any, 'createForgejoClient').mockReturnValue({} as any);
        const otd = { organizationId: 'org-A', teamId: 'team-A' };
        const files = await fj.getFilesByPullRequestId({ organizationAndTeamData: otd as any, repository: { name: 'kodus/claude-athena' }, prNumber: 4 });
        const changed = (files ?? []).map((x: any) => ({ ...x }));
        const { out } = await runStage([
            f('qa2671/instrumentation-client.ts', 19, 19, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'] }),
            f('qa2671/renamed-and-edited.ts', 12, 12, { label: 'security' }),
        ], { platformType: 'FORGEJO', changedFiles: changed, repository: { id: 'fj-1', name: 'kodus/claude-athena', language: 'typescript' }, pullRequest: { number: 4, head: { sha: 'head-sha' } } });
        (globalThis as any).__fjIssue = [];
        const cms = new CodeManagementService({ findOne: jest.fn().mockResolvedValue({ platform: 'FORGEJO' }) } as any, { getCodeManagementService: () => fj } as any);
        (cms as any).getCommitsForPullRequestForCodeReview = async () => [{ sha: 'head-sha' }];
        const cm = new CommentManagerService({} as any, {} as any, {} as any, {} as any, cms as any, {} as any);
        const saved: any[] = [];
        const st = new CreatePrLevelCommentsStage(cm as any, suggestionSvc(), { addPrLevelSuggestions: async (...a: any[]) => saved.push(...a[3]) } as any);
        logs.length = 0;
        await (st as any).executeStage(out);
        rec('M7F', {
            mappedFiles: changed.map((x: any) => ({ filename: x.filename, status: x.status, patchLength: (x.patch ?? '').length, previous_filename: x.previous_filename ?? null })),
            routing: summarize(out),
            issueComments: (globalThis as any).__fjIssue.map((c: any) => ({ path: c.path, citation: c.body.split('\n').find((l: string) => l.includes('qa2671/')) ?? null })),
            saved: saved.map((s) => ({ deliveryStatus: s.deliveryStatus, commentId: s.comment?.id ?? null })),
            logs: msgs(/PR-level|Fetched|Error/),
        });
    });
});
