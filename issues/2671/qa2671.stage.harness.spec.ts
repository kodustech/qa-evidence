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
            ((globalThis as any).__qaLogs ??= []).push({ level, component, message: String(args?.message ?? '') });
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
                calls.push({ api: 'issues.createComment', req: { issue_number: req.issue_number, body: req.body } });
                if (mode.issue === '503') { const e: any = new Error('Service Unavailable'); e.status = 503; throw e; }
                if (mode.issue === '403') { const e: any = new Error('Forbidden'); e.status = 403; throw e; }
                if (mode.issue === 'noid') return { data: {} };
                return { data: { id: ++id } };
            },
        },
        pulls: {
            createReviewComment: async (req: any) => {
                const { body, ...rest } = req;
                calls.push({ api: 'pulls.createReviewComment', req: rest });
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

describe('QA2671 harness', () => {
    it('M14 routing + delivery for labels, edited rename, out-of-PR, old path', async () => {
        const input = [
            f(RENAMED, 19, 30, { label: 'general' }),
            f(RENAMED, 19, 30, { label: 'bug', suggestionContent: 'QA2671 bug variant: null deref', severity: 'medium' }),
            f(RENAMED, 19, 30, { label: 'security' }),
            f(RENAMED, 19, 30, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'] }),
            f(EDITED, 11, 12, { label: 'security' }),
            f('qa2671/elsewhere.ts', 11, 12, { label: 'bug' }),
            f(OLD, 19, 30, { label: 'bug' }),
            f(CONTROL, 11, 11, { label: 'bug', severity: 'medium' }),
        ];
        const { out } = await runStage(input);
        const pr = await postPrLevel(out);
        const inl = await postInline(out.validSuggestions, out.discardedSuggestions);
        rec('M14', { routing: summarize(out), prLevelDelivery: pr, inlineDelivery: inl, logs: msgs(/AGENT\] Dropped|not found in changedFiles|PR-level/) });
    });

    it('M15 copied/renamed with patch absent/null/empty, with/without previous_filename', async () => {
        const shapes: Array<[string, any]> = [];
        for (const status of ['renamed', 'copied']) {
            for (const [pname, patch] of [['absent', undefined], ['null', null], ['empty', '']] as const) {
                for (const prev of [true, false]) {
                    const file: any = { filename: RENAMED, status };
                    if (pname !== 'absent') file.patch = patch;
                    if (prev) file.previous_filename = OLD;
                    shapes.push([`${status}/${pname}/${prev ? 'prev' : 'noprev'}`, file]);
                }
            }
        }
        const res: Record<string, any> = {};
        for (const [name, file] of shapes) {
            const { out } = await runStage([f(RENAMED, 19, 30)], { changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }, file] });
            const pr = await postPrLevel(out);
            res[name] = {
                prLevel: (out.validSuggestionsByPR ?? []).length,
                inline: (out.validSuggestions ?? []).length,
                cites: (out.validSuggestionsByPR ?? []).map((s: any) => s.suggestionContent.split(' — ')[0]),
                posted: pr.calls.map((c) => c.api),
                saved: pr.saved.map((s) => s.deliveryStatus),
            };
        }
        rec('M15', res);
    });

    it('M19 reversed range through the full stage path on files with hunks', async () => {
        const cases = {
            asc_19_30: f(H1930, 19, 30, { label: 'bug' }),
            rev_30_19: f(H1930, 30, 19, { label: 'bug' }),
            asc_120_180: f(WIDE, 120, 180, { label: 'bug' }),
            rev_180_120: f(WIDE, 180, 120, { label: 'bug' }),
            rev_kody_30_19: f(H1930, 30, 19, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'] }),
            rev_edited_12_11: f(EDITED, 12, 11, { label: 'security' }),
        };
        const res: Record<string, any> = {};
        for (const [name, s] of Object.entries(cases)) {
            n = 0;
            logs.length = 0;
            const { out } = await runStage([s]);
            const inl = await postInline(out.validSuggestions, out.discardedSuggestions);
            res[name] = { routing: summarize(out), posts: inl.calls, lineComments: inl.lineComments, logs: msgs(/AGENT\]/) };
        }
        rec('M19', res);
    });

    it('M20 PR-level citation for reversed range and missing/zero/negative line on a pure rename', async () => {
        const res: Record<string, any> = {};
        const cases: Record<string, any> = {
            rev_30_19: f(RENAMED, 30, 19, { label: 'bug' }),
            missing_line_bug: f(RENAMED, undefined, undefined, { label: 'bug' }),
            zero_line_bug: f(RENAMED, 0, 0, { label: 'bug' }),
            neg_line_bug: f(RENAMED, -3, 5, { label: 'bug' }),
            missing_line_kody: f(RENAMED, undefined, undefined, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'] }),
        };
        for (const [name, s] of Object.entries(cases)) {
            const { out } = await runStage([s]);
            const pr = await postPrLevel(out);
            res[name] = { routing: summarize(out), issueBodies: pr.calls.map((c) => c.req.body?.split('\n').find((l: string) => l.includes('qa2671/')) ?? null) };
        }
        rec('M20', res);
    });

    it('M13/M17-cfg severity filter and kody-rule filter before routing', async () => {
        const res: Record<string, any> = {};
        const findings = () => [
            f(RENAMED, 19, 30, { label: 'bug', severity: 'medium' }),
            f(RENAMED, 19, 30, { label: 'security', severity: 'high' }),
            f(RENAMED, 19, 30, { label: 'kody_rules', severity: 'medium', brokenKodyRulesIds: ['rule-token'] }),
            f(RENAMED, 19, 30, { label: 'performance', severity: 'low' }),
        ];
        for (const [name, sc] of Object.entries({
            filter_high_krFalse: { severityLevelFilter: 'high', applyFiltersToKodyRules: false },
            filter_high_krTrue: { severityLevelFilter: 'high', applyFiltersToKodyRules: true },
            filter_low: { severityLevelFilter: 'low' },
        })) {
            const { out } = await runStage(findings(), {
                codeReviewConfig: { ...baseCtx().codeReviewConfig, suggestionControl: { maxSuggestions: 9, ...sc } },
            });
            const s = summarize(out);
            res[name] = { prLevel: s.prLevel.map((p: any) => `${p.label}/${p.severity}`), inline: s.validSuggestions.length, discarded: s.discarded.map((d: any) => `${d.tag}:${d.status}`) };
        }
        // disabled security lens
        const { out } = await runStage(findings(), {
            codeReviewConfig: { ...baseCtx().codeReviewConfig, reviewOptions: { bug: true, security: false, performance: true } },
        });
        const s = summarize(out);
        res.security_lens_off = { prLevel: s.prLevel.map((p: any) => `${p.label}/${p.severity}`), discarded: s.discarded.map((d: any) => `${d.tag}:${d.status}`) };
        rec('M13', res);
    });

    it('M25 ignored rename, analyzer advisory, custom agent inline + single-comment', async () => {
        const res: Record<string, any> = {};
        const advisory = { tool: 'dependencies', ruleId: 'osv/GHSA-x', path: RENAMED, startLine: 19, endLine: 19, severity: 'error', message: 'lodash 4.17.20 is vulnerable', subject: 'lodash@4.17.20' };
        // (a) no custom agent: renamed file ignored
        let r = await runStage([f(RENAMED, 19, 30, { label: 'bug' })], {
            changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }],
            ignoredFileChanges: [{ filename: RENAMED, status: 'renamed', previous_filename: OLD }],
            ignoredFiles: [RENAMED],
            analyzerFindings: [advisory],
        });
        res.ignored_noagent = summarize(r.out);
        // (b) inline-mode custom agent scoped explicitly to the ignored path
        const agent = (format?: string) => ({
            id: 'agent-1', name: 'Token Guard', enabled: true, instructions: 'x',
            scope: { include: [RENAMED] }, tools: {}, presentation: { tag: { color: 'red' }, ...(format ? { format } : {}) },
        });
        for (const fmt of [undefined, 'single-comment']) {
            r = await runStage([f(RENAMED, 19, 30, { label: 'custom_agent', customAgent: { id: 'agent-1', name: 'Token Guard', color: 'red' } })], {
                changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }],
                ignoredFileChanges: [{ filename: RENAMED, status: 'renamed', previous_filename: OLD }],
                ignoredFiles: [RENAMED],
                codeReviewConfig: { ...baseCtx().codeReviewConfig, customAgents: [agent(fmt)] },
            });
            const pr = await postPrLevel(r.out);
            res[`agent_${fmt ?? 'inline'}`] = { routing: summarize(r.out), issueBodyHead: pr.calls.map((c) => c.req.body.split('\n').slice(0, 3).join(' | ')) };
        }
        // (c) custom agent on a reviewed (not ignored) pure rename
        r = await runStage([f(RENAMED, 19, 30, { label: 'custom_agent', customAgent: { id: 'agent-1', name: 'Token Guard', color: 'red' } })], {
            codeReviewConfig: { ...baseCtx().codeReviewConfig, customAgents: [{ ...agent(), scope: { include: ['qa2671/**'] } }] },
        });
        const pr = await postPrLevel(r.out);
        res.agent_reviewed_rename = { routing: summarize(r.out), issueBodyHead: pr.calls.map((c) => c.req.body.split('\n').slice(0, 3).join(' | ')), saved: pr.saved };
        rec('M25', res);
    });

    it('M26 withheld diff on a modified file: analyzer vs model', async () => {
        const LOCK = 'web/package-lock.json';
        const advisory = { tool: 'dependencies', ruleId: 'osv/GHSA-35jh', path: LOCK, startLine: 11, endLine: 11, severity: 'error', message: 'lodash 4.17.20 is vulnerable', subject: 'lodash@4.17.20' };
        const { out } = await runStage([f(LOCK, 11, 11, { label: 'bug' })], {
            changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }, { filename: LOCK, status: 'modified' }],
            analyzerFindings: [advisory],
        });
        rec('M26', summarize(out));
    });

    it('M28 path edge cases and two orgs with same PR number', async () => {
        const UNI = 'qa2671/café instrumentation-client.ts';
        const { out } = await runStage([
            f(UNI, 19, 30, { label: 'bug' }),
            f('qa2671/café instrumentation.ts', 19, 30, { label: 'bug' }),
            f('', 19, 30, { label: 'bug' }),
            f(undefined, 19, 30, { label: 'bug' }),
        ], { changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }, { filename: UNI, status: 'renamed', previous_filename: 'qa2671/café instrumentation.ts' }] });
        const pr = await postPrLevel(out);
        const two: any = {};
        for (const org of ['org-A', 'org-B']) {
            const r = await runStage([f(RENAMED, 19, 30, { label: 'bug', suggestionContent: `QA2671 for ${org}` })], { organizationAndTeamData: { organizationId: org, teamId: `team-${org}` } });
            two[org] = summarize(r.out).prLevel.map((p: any) => p.suggestionContent);
        }
        rec('M28', { routing: summarize(out), issueBodies: pr.calls.map((c) => c.req.body.split('\n').find((l: string) => l.includes('qa2671')) ?? null), twoOrgs: two });
    });

    it('M29 PR-level post 503 / no id / 403; sibling inline survives', async () => {
        const res: Record<string, any> = {};
        for (const mode of ['503', 'noid', '403', 'ok'] as const) {
            logs.length = 0;
            const { out } = await runStage([f(RENAMED, 19, 30, { label: 'bug' }), f(EDITED, 11, 12, { label: 'security' })]);
            const pr = await postPrLevel(out, { issue: mode });
            const inl = await postInline(out.validSuggestions, out.discardedSuggestions);
            res[mode] = { prResults: pr.results, saved: pr.saved, inline: inl.lineComments, logs: msgs(/PR-level|Successfully created|failed to deliver/) };
        }
        rec('M29', res);
    });

    it('M30 persistence fails after a successful PR-level post', async () => {
        logs.length = 0;
        const { out } = await runStage([f(RENAMED, 19, 30, { label: 'bug' })]);
        const first = await postPrLevel(out, { issue: 'ok' }, 'throw');
        const logs1 = msgs(/PR level|PR-level|Saved/);
        const again = await runStage([f(RENAMED, 19, 30, { label: 'bug' })]);
        const second = await postPrLevel(again.out, { issue: 'ok' });
        rec('M30', { first: { posts: first.calls.length, results: first.results, logs: logs1 }, rerunSameInput: { posts: second.calls.length, saved: second.saved }, idsDiffer: out.validSuggestionsByPR?.[0]?.id !== again.out.validSuggestionsByPR?.[0]?.id });
    });

    it('M31 two interleaved stage invocations with frozen inputs', async () => {
        const A = makeStage();
        const B = makeStage();
        let releaseA: () => void = () => {};
        const gateA = new Promise<void>((r) => (releaseA = r));
        const order: string[] = [];
        A.reviewOrchestrator.execute.mockImplementation(async () => {
            order.push('A:start'); await gateA; order.push('A:resume');
            return { suggestions: [f(RENAMED, 19, 30, { label: 'bug', suggestionContent: 'QA2671 org-A' })], agentResults: [], failures: [], incomplete: [], warnings: [] };
        });
        B.reviewOrchestrator.execute.mockImplementation(async () => {
            order.push('B:start');
            return { suggestions: [f(RENAMED, 19, 30, { label: 'bug', suggestionContent: 'QA2671 org-B' })], agentResults: [], failures: [], incomplete: [], warnings: [] };
        });
        const ctxA = baseCtx({ organizationAndTeamData: { organizationId: 'org-A', teamId: 't-A' } });
        const ctxB = baseCtx({
            organizationAndTeamData: { organizationId: 'org-B', teamId: 't-B' },
            changedFiles: [{ filename: CONTROL, patch: PATCH_CONTROL }, { filename: RENAMED, status: 'renamed', previous_filename: OLD, patch: addLines(19, 12) }],
        });
        const hashA = JSON.stringify(ctxA.changedFiles);
        const hashB = JSON.stringify(ctxB.changedFiles);
        const pA = (A.stage as any).executeStage(ctxA);
        await new Promise((r) => setTimeout(r, 10));
        const pB = (B.stage as any).executeStage(ctxB);
        const outB = await pB; order.push('B:done');
        releaseA();
        const outA = await pA; order.push('A:done');
        rec('M31', {
            order,
            A: summarize(outA), B: summarize(outB),
            frozenInputUnchanged: JSON.stringify(ctxA.changedFiles) === hashA && JSON.stringify(ctxB.changedFiles) === hashB,
            frozen: Object.isFrozen(ctxA.changedFiles),
        });
    });

    it('M32 PR-level reconstruction: content vs fullExplanation, rule link, analyzer, copy prompt on/off', async () => {
        const { out } = await runStage([
            f(RENAMED, 19, 30, { label: 'bug', suggestionContent: 'SHORT body for QA2671', fullExplanation: 'LONG explanation for QA2671 with details' }),
            f(RENAMED, 19, 30, { label: 'kody_rules', brokenKodyRulesIds: ['rule-token'] }),
        ], { analyzerFindings: [{ tool: 'dependencies', ruleId: 'osv/GHSA-x', path: RENAMED, startLine: 19, endLine: 19, severity: 'error', message: 'lodash 4.17.20 is vulnerable', subject: 'lodash@4.17.20' }] });
        const bodies: Record<string, any> = {};
        for (const copy of [true, false]) {
            const calls: any[] = [];
            const cm = makeCommentManager(calls, { issue: 'ok' });
            await cm.createPrLevelReviewComments({ organizationId: 'org-A', teamId: 'team-A' } as any, 7, { name: 'claude-athena', id: 'repo-A', language: 'typescript' }, out.validSuggestionsByPR, 'en-US', copy, 'GITHUB' as any);
            bodies[`copyPrompt_${copy}`] = calls.map((c) => c.req.body);
        }
        rec('M32', { routing: summarize(out), bodies });
    });

    it('M34 router timing at 1/100/1000 files and 1000 findings', async () => {
        const res: Record<string, any> = {};
        for (const nf of [1, 100, 1000]) {
            const files: any[] = [{ filename: CONTROL, patch: PATCH_CONTROL }];
            for (let i = 0; i < nf; i++) files.push({ filename: `qa2671/r${i}.ts`, status: 'renamed', previous_filename: `qa2671/o${i}.ts` });
            const findings = Array.from({ length: nf === 1000 ? 1000 : 10 }, (_, i) => f(`qa2671/r${i % nf}.ts`, 19, 30, { label: 'bug', oneSentenceSummary: `QA2671 t${i}`, suggestionContent: `distinct ${i}` }));
            const t0 = Date.now();
            const { out } = await runStage(findings, { changedFiles: files });
            res[`files_${nf}_findings_${findings.length}`] = { ms: Date.now() - t0, prLevel: (out.validSuggestionsByPR ?? []).length, inline: (out.validSuggestions ?? []).length, llmRunCalls: (LLM.run as jest.Mock).mock.calls.length };
        }
        rec('M34', res);
    }, 120000);
});
