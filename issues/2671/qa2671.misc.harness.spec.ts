/* QA #2671 misc harness — not committed. M35 auth modes, M36 CLI reachability. */
import * as fs from 'fs';
import { CliInputConverter } from '@libs/cli-review/infrastructure/converters/cli-input.converter';
import { CommentManagerService } from '@libs/code-review/infrastructure/adapters/services/commentManager.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { GithubService } from '@libs/platform/infrastructure/adapters/services/github/github.service';

jest.mock('@libs/mcp-server/services/mcp-manager.service', () => ({ MCPManagerService: jest.fn() }));

const OUT = process.env.QA_OUT || '/tmp/qa2671-misc.json';
const results: Record<string, any> = {};
afterAll(() => fs.writeFileSync(OUT, JSON.stringify(results, null, 2)));

describe('QA2671 misc', () => {
    it('M35 PR-level and inline delivery under token vs app auth', async () => {
        for (const authMode of ['token', 'app']) {
            const calls: any[] = [];
            const gh = new GithubService({} as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any);
            jest.spyOn(gh as any, 'getGithubAuthDetails').mockResolvedValue({ org: 'o', authMode });
            jest.spyOn(gh as any, 'instanceOctokit').mockResolvedValue({
                issues: { createComment: async (r: any) => { calls.push(['issues.createComment', r.issue_number]); return { data: { id: 1 } }; } },
                pulls: { createReviewComment: async (r: any) => { calls.push(['pulls.createReviewComment', r.start_line, r.line]); return { data: { id: 2, pull_request_review_id: 3 } }; } },
                reactions: { createForPullRequestReviewComment: async () => { calls.push(['reaction']); return {}; } },
                rest: { reactions: { createForPullRequestReviewComment: async () => { calls.push(['reaction']); return {}; } } },
            });
            const cms = new CodeManagementService({ findOne: jest.fn().mockResolvedValue({ platform: 'GITHUB' }) } as any, { getCodeManagementService: () => gh } as any);
            (cms as any).getCommitsForPullRequestForCodeReview = async () => [{ sha: 'h' }];
            const cm = new CommentManagerService({} as any, {} as any, {} as any, {} as any, cms as any, {} as any);
            const org = { organizationId: 'org-A', teamId: 't' } as any;
            const repo = { name: 'claude-athena', id: 'r', language: 'typescript' };
            const pr = await cm.createPrLevelReviewComments(org, 7, repo, [{ id: 'x', suggestionContent: '`qa2671/a.ts:19` — c', oneSentenceSummary: 't', label: 'bug', severity: 'high' } as any], 'en-US', true, 'GITHUB' as any);
            const inl = await cm.createLineComments(org, 7, repo, [{ path: 'qa2671/a.ts', start_line: 19, line: 30, side: 'RIGHT', body: {}, suggestion: { id: 'y', relevantLinesStart: 30, relevantLinesEnd: 19 } } as any], 'en-US', true, undefined, 'GITHUB' as any);
            results[`M35_${authMode}`] = { calls, pr: pr.commentResults.map((r: any) => r.deliveryStatus), inline: inl.commentResults.map((r: any) => r.deliveryStatus) };
        }
    });

    it('M36 CLI input: pure rename via unified diff and via structured files', () => {
        const conv = new CliInputConverter();
        const raw = ['diff --git a/qa2671/old.ts b/qa2671/pure-rename.ts', 'similarity index 100%', 'rename from qa2671/old.ts', 'rename to qa2671/pure-rename.ts', ''].join('\n');
        const fromDiff = conv.convertToFileChanges({ diff: raw } as any).map((f: any) => ({ filename: f.filename, status: f.status, patchTruthy: !!f.patch, patchWithLinesStrTruthy: !!f.patchWithLinesStr }));
        const fromFiles = conv.convertToFileChanges({ diff: '', config: { files: [{ path: 'qa2671/pure-rename.ts', diff: '', status: 'renamed' }] } } as any).map((f: any) => ({ filename: f.filename, status: f.status, patchTruthy: !!f.patch, patchWithLinesStrTruthy: !!f.patchWithLinesStr, keptByPrepareCliFiles: !!f.patch || !!f.patchWithLinesStr }));
        results.M36 = { fromDiff, fromFiles };
    });
});
