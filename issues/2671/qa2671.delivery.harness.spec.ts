/* QA #2671 delivery harness — not committed. Real builder, CreateFileCommentsStage,
 * CommentManagerService, CodeManagementService and provider adapters; only the
 * HTTP transport / SDK call and auth lookups are stubbed. */
import * as fs from 'fs';
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { CreateFileCommentsStage } from './create-file-comments.stage';
import { CommentManagerService } from '@libs/code-review/infrastructure/adapters/services/commentManager.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { GithubService } from '@libs/platform/infrastructure/adapters/services/github/github.service';
import { GitlabService } from '@libs/platform/infrastructure/adapters/services/gitlab.service';
import { BitbucketCloudService } from '@libs/platform/infrastructure/adapters/services/bitbucket/bitbucket-cloud.service';
import { AzureReposService } from '@libs/platform/infrastructure/adapters/services/azureRepos/azureRepos.service';
import { AzureReposRequestHelper } from '@libs/platform/infrastructure/adapters/services/azureRepos/azure-repos-request-helper';
import { ForgejoService } from '@libs/platform/infrastructure/adapters/services/forgejo.service';
import {
    buildCommentFromSuggestion,
    calculateCommentEndLine,
    calculateCommentStartLine,
} from '@libs/common/utils/comment-builder.utils';
import { PriorityStatus } from '@libs/platformData/domain/pullRequests/enums/priorityStatus.enum';
import * as forgejoSdk from '@llamaduck/forgejo-ts';

jest.mock('@libs/mcp-server/services/mcp-manager.service', () => ({ MCPManagerService: jest.fn() }));
jest.mock('@libs/core/log/logger', () => ({
    createLogger: (component: string) => {
        const push = (level: string) => (args: any) => {
            ((globalThis as any).__qaLogs ??= []).push({ level, component, message: String(args?.message ?? ''), error: args?.error ? String(args.error?.message ?? args.error) : undefined });
        };
        return { log: push('log'), error: push('error'), warn: push('warn'), debug: push('debug'), info: push('info') };
    },
}));
jest.mock('@llamaduck/forgejo-ts', () => {
    const actual = jest.requireActual('@llamaduck/forgejo-ts');
    return {
        ...actual,
        repoCreatePullReview: jest.fn(async (req: any) => {
            ((globalThis as any).__fjCalls ??= []).push(req.body);
            return { data: { id: 55, comments: [{ id: 56 }] } };
        }),
    };
});

const OUT = process.env.QA_OUT || '/tmp/qa2671-delivery.json';
const results: Record<string, any> = {};
afterAll(() => fs.writeFileSync(OUT, JSON.stringify(results, null, 2)));

const addLines = (start: number, n: number) =>
    [`@@ -${start - 1},0 +${start},${n} @@`].concat(Array.from({ length: n }, (_, i) => `+const l${start + i} = ${i};`)).join('\n');
const H1930 = 'qa2671/attendance.ts';
const WIDE = 'qa2671/report.ts';
const FILES = [
    { filename: H1930, status: 'modified', patch: addLines(19, 12) },
    { filename: WIDE, status: 'modified', patch: addLines(120, 61) },
    { filename: 'qa2671/b.ts', status: 'modified', patch: addLines(19, 20) },
];

let id = 0;
const sug = (file: string, s?: number, e?: number, over: Record<string, unknown> = {}) => ({
    id: `s-${++id}`,
    relevantFile: file,
    relevantLinesStart: s,
    relevantLinesEnd: e,
    label: 'bug',
    severity: 'high',
    oneSentenceSummary: `QA2671 ${s}-${e}`,
    suggestionContent: `QA2671 range ${s}-${e}`,
    improvedCode: '',
    ...over,
});

const ghRejectsReversed = (calls: any[], failFirst403 = false) => {
    const gh = new GithubService({} as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any);
    jest.spyOn(gh as any, 'getGithubAuthDetails').mockResolvedValue({ org: 'o', authMode: 'token' });
    jest.spyOn(gh as any, 'instanceOctokit').mockResolvedValue({
        pulls: {
            createReviewComment: async (req: any) => {
                const { body, ...rest } = req;
                calls.push(rest);
                if (failFirst403 && calls.length === 1) { const e: any = new Error('Forbidden'); e.status = 403; throw e; }
                if (rest.start_line !== undefined && rest.start_line > rest.line) {
                    // GitHub's own check for a reversed range (shape modeled; it is a 422 the line-mismatch matcher does not know)
                    throw new Error('Validation Failed: {"resource":"PullRequestReviewComment","code":"invalid","field":"start_line"}');
                }
                return { data: { id: 900 + calls.length, pull_request_review_id: 1 } };
            },
        },
    });
    return gh;
};

const gitlab = (calls: any[]) => {
    const s = new GitlabService({} as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
    jest.spyOn(s as any, 'getAuthDetails').mockResolvedValue({});
    jest.spyOn(s as any, 'instanceGitlabApi').mockReturnValue({
        MergeRequests: { allDiffVersions: async () => [{ base_commit_sha: 'b', start_commit_sha: 's' }] },
        MergeRequestDiscussions: { create: async (_p: any, _n: any, _b: any, opts: any) => { calls.push(opts.position); return { id: 'd', notes: [{ id: 1 }] }; } },
    });
    return s;
};
const bitbucket = (calls: any[]) => {
    const s = new BitbucketCloudService({} as any, {} as any, {} as any, { get: jest.fn() } as any);
    jest.spyOn(s as any, 'getAuthDetails').mockResolvedValue({});
    jest.spyOn(s as any, 'getWorkspaceFromRepository').mockResolvedValue('ws');
    jest.spyOn(s as any, 'instanceBitbucketApi').mockReturnValue({
        pullrequests: { createComment: async (req: any) => { calls.push(req._body.inline); return { data: { id: 2 } }; } },
    });
    return s;
};
const azure = (calls: any[]) => {
    const helper = new AzureReposRequestHelper();
    jest.spyOn(helper as any, 'azureRequest').mockResolvedValue({ post: async (_u: string, payload: any) => { calls.push(payload.threadContext); return { data: { id: 3 } }; } });
    const s = new AzureReposService({} as any, {} as any, {} as any, helper, { get: jest.fn() } as any);
    jest.spyOn(s as any, 'getAuthDetails').mockResolvedValue({ orgName: 'o', token: 't' });
    jest.spyOn(s as any, 'getProjectIdFromRepository').mockResolvedValue('p');
    return s;
};
const forgejo = (calls: any[]) => {
    (globalThis as any).__fjCalls = calls;
    const s = new ForgejoService({} as any, {} as any, {} as any, { get: jest.fn() } as any);
    jest.spyOn(s as any, 'getAuthDetails').mockResolvedValue({ host: 'https://codeberg.example', accessToken: 'x' });
    jest.spyOn(s as any, 'createForgejoClient').mockReturnValue({} as any);
    return s;
};

const manager = (adapter: any, platform: string) => {
    const cms = new CodeManagementService({ findOne: jest.fn().mockResolvedValue({ platform }) } as any, { getCodeManagementService: () => adapter } as any);
    (cms as any).getCommitsForPullRequestForCodeReview = async () => [{ sha: 'head-sha' }];
    return new CommentManagerService({} as any, {} as any, {} as any, {} as any, cms as any, {} as any);
};

const throughStage = async (adapter: any, platform: string, valid: any[], discarded: any[] = [], freeze = true) => {
    const cm = manager(adapter, platform);
    const stage = new CreateFileCommentsStage(cm as any, { aggregateAndSaveDataStructure: async () => null } as any, {
        resolveImplementedSuggestionsOnPlatform: jest.fn().mockResolvedValue(undefined),
        verifyIfSuggestionsWereSent: jest.fn().mockResolvedValue([]),
        extractRepriorizedSuggestions: jest.fn().mockReturnValue({ repriorizedSuggestions: [], filteredDiscardedSuggestions: [] }),
    } as any);
    const ctx = (freeze ? frozenContext : (x: any) => x)({
        organizationAndTeamData: { organizationId: 'org-A', teamId: 'team-A' },
        repository: { id: 'repo-A', name: 'kodus/claude-athena', language: 'typescript' },
        pullRequest: { number: 7, head: { sha: 'head-sha' } },
        platformType: platform,
        changedFiles: FILES,
        validSuggestions: valid,
        discardedSuggestions: discarded,
        errors: [],
        prAllCommits: [{ sha: 'head-sha' }],
        fileMetadata: new Map(),
        codeReviewConfig: {},
    }) as any;
    const out = await (stage as any).executeStage(ctx);
    return (out.lineComments ?? []).map((r: any) => ({ tag: r.comment?.suggestion?.oneSentenceSummary, start_line: r.comment?.start_line, line: r.comment?.line, status: r.deliveryStatus }));
};

describe('QA2671 delivery harness', () => {
    it('M16 builder utility (frozen inputs)', () => {
        const res: Record<string, any> = {};
        const cases: Array<[number | undefined, number | undefined]> = [[30, 19], [19, 30], [120, 100], [140, 120], [120, 140], [180, 120], [19, 19], [undefined, 19], [19, undefined], [undefined, undefined]];
        for (const [s, e] of cases) {
            const input = Object.freeze({ relevantFile: 'src/app.ts', relevantLinesStart: s, relevantLinesEnd: e });
            let built: any; let err: any = null;
            try { built = buildCommentFromSuggestion(input as any, 'typescript'); } catch (x) { err = String(x); }
            res[`${s}-${e}`] = {
                start: calculateCommentStartLine(input as any),
                end: calculateCommentEndLine(input as any),
                built: built ? { start_line: built.start_line, line: built.line, side: built.side, start_side: (built as any).start_side } : null,
                err,
                inputUnchanged: input.relevantLinesStart === s && input.relevantLinesEnd === e,
            };
        }
        results.M16 = res;
    });

    it('M17 15/16-line boundary matrix through utility and the inline stage (GitHub)', async () => {
        const res: Record<string, any> = {};
        const ranges: Array<[number | undefined, number | undefined]> = [[19, 32], [32, 19], [19, 33], [33, 19], [19, 34], [34, 19], [120, 180], [180, 120], [19, 19], [undefined, 19]];
        const valid = ranges.map(([s, e]) => sug(s === 120 || s === 180 ? WIDE : 'qa2671/b.ts', s, e));
        const calls: any[] = [];
        const stage = await throughStage(ghRejectsReversed(calls), 'GITHUB', valid);
        for (const [s, e] of ranges) {
            const util = { start: calculateCommentStartLine({ relevantLinesStart: s, relevantLinesEnd: e }), end: calculateCommentEndLine({ relevantLinesStart: s, relevantLinesEnd: e }) };
            res[`${s}-${e}`] = { util, stage: stage.filter((x: any) => x.tag === `QA2671 ${s}-${e}`) };
        }
        res._githubPosts = calls.map((c) => ({ path: c.path, start_line: c.start_line, line: c.line, side: c.side, start_side: c.start_side, commit_id: c.commit_id }));
        results.M17 = res;
    });

    it('M21 CreateFileCommentsStage -> CommentManager -> GitHub adapter final POST for 30-19', async () => {
        const calls: any[] = [];
        const out = await throughStage(ghRejectsReversed(calls), 'GITHUB', [sug(H1930, 30, 19), sug(H1930, 19, 30)]);
        results.M21 = { posts: calls, lineComments: out };
    });

    it('M22 fallback path after a 403: fallback 30-19 and 180-120', async () => {
        const res: Record<string, any> = {};
        for (const [name, fb] of [['fb_30_19', sug(H1930, 30, 19, { severity: 'high', priorityStatus: PriorityStatus.DISCARDED_BY_QUANTITY })], ['fb_180_120', sug(WIDE, 180, 120, { severity: 'high', priorityStatus: PriorityStatus.DISCARDED_BY_QUANTITY })]] as const) {
            for (const freeze of [true, false]) {
                const calls: any[] = [];
                (globalThis as any).__qaLogs = [];
                const out = await throughStage(ghRejectsReversed(calls, true), 'GITHUB', [sug(H1930, 20, 22, { severity: 'high' })], [{ ...fb }], freeze);
                res[`${name}_${freeze ? 'frozenCtx' : 'plainCtx'}`] = {
                    posts: calls.map((c) => ({ path: c.path, start_line: c.start_line, line: c.line })),
                    lineComments: out,
                    errors: ((globalThis as any).__qaLogs as any[]).filter((l) => l.level === 'error' || /fallback|Fallback/.test(l.message)).map((l) => `${l.level}: ${l.message}${l.error ? ' :: ' + l.error : ''}`),
                };
            }
        }
        results.M22 = res;
    });

    it('M23 committable suggestion: validatedData override on GitHub', async () => {
        const res: Record<string, any> = {};
        for (const [name, vd] of [['validated_ascending', { code: 'x', lineStart: 19, lineEnd: 22 }], ['synthetic_reversed_probe', { code: 'x', lineStart: 30, lineEnd: 19 }]] as const) {
            const calls: any[] = [];
            const out = await throughStage(ghRejectsReversed(calls), 'GITHUB', [sug(H1930, 30, 19, { isCommittable: true, validatedData: vd, improvedCode: 'x' })]);
            res[name] = { posts: calls.map((c) => ({ start_line: c.start_line, line: c.line })), lineComments: out };
        }
        results.M23 = res;
    });

    it('M24 adapter translation GitLab/Bitbucket/Azure/Forgejo for 30-19 and 180-120 (through the inline stage)', async () => {
        const res: Record<string, any> = {};
        const valid = () => [sug(H1930, 30, 19), sug(WIDE, 180, 120), sug(H1930, 19, 30)];
        for (const [platform, make] of [['GITLAB', gitlab], ['BITBUCKET', bitbucket], ['AZURE_REPOS', azure], ['FORGEJO', forgejo]] as const) {
            const calls: any[] = [];
            const out = await throughStage((make as any)(calls), platform, valid());
            res[platform] = {
                requests: calls.map((c: any) => (platform === 'FORGEJO' ? { new_position: c.comments?.[0]?.new_position, path: c.comments?.[0]?.path } : c)),
                lineComments: out,
            };
        }
        results.M24 = res;
    });
});
