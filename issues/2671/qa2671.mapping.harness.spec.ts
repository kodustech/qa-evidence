/* QA #2671 provider-shape harness — not committed. Real provider mapping
 * (GitHub listFiles map, GitLab allDiffs map, shared splitUnifiedDiff used by
 * Bitbucket Cloud and Forgejo, Azure _generateFileDiffForAzure) with frozen
 * provider responses, then the real AgentReviewStage routing. */
import * as fs from 'fs';
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from './agent-review.stage';
import { GithubService } from '@libs/platform/infrastructure/adapters/services/github/github.service';
import { GitlabService } from '@libs/platform/infrastructure/adapters/services/gitlab.service';
import { AzureReposService } from '@libs/platform/infrastructure/adapters/services/azureRepos/azureRepos.service';
import { AzureReposRequestHelper } from '@libs/platform/infrastructure/adapters/services/azureRepos/azure-repos-request-helper';
import { splitUnifiedDiff } from '@libs/common/utils/split-unified-diff';
import { LLM } from '@libs/llm/llm';

jest.mock('@libs/mcp-server/services/mcp-manager.service', () => ({ MCPManagerService: jest.fn() }));
jest.mock('@libs/code-review/infrastructure/agents/engine/classify-severity', () => ({ classifySeverity: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@libs/code-review/infrastructure/agents/engine/format-suggestion-content', () => ({ formatSuggestionContent: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@libs/llm/managed-slot', () => ({ ...jest.requireActual('@libs/llm/managed-slot'), hasManagedModelKey: jest.fn(() => false) }));

const OUT = process.env.QA_OUT || '/tmp/qa2671-mapping.json';
const results: Record<string, any> = {};
afterAll(() => fs.writeFileSync(OUT, JSON.stringify(results, null, 2)));
beforeAll(() => { jest.spyOn(LLM, 'run').mockRejectedValue(new Error('no model')); });

const CONTROL = { filename: 'qa2671/user.ts', status: 'modified', patch: '@@ -10,2 +10,3 @@\n const a = 1;\n+const b = 2;' };

const route = async (file: any) => {
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
    reviewOrchestrator.execute.mockResolvedValue({
        suggestions: [{ relevantFile: file.filename, relevantLinesStart: 2, relevantLinesEnd: 3, label: 'bug', severity: 'high', oneSentenceSummary: 'QA2671 t', suggestionContent: 'QA2671 c', improvedCode: '' }],
        agentResults: [], failures: [], incomplete: [], warnings: [],
    });
    const out = await (stage as any).executeStage(frozenContext({
        organizationAndTeamData: { organizationId: 'org-A', teamId: 'team-A' },
        repository: { id: 'r', name: 'claude-athena' }, pullRequest: { number: 7 }, platformType: 'GITHUB',
        changedFiles: [CONTROL, file],
        codeReviewConfig: { reviewOptions: { bug: true }, resolvedModelSlot: { provider: 'openai', model: 'x' }, kodyRules: [] },
        validSuggestions: [], discardedSuggestions: [], errors: [],
    }) as any);
    const pr = (out.validSuggestionsByPR ?? []).length;
    const inline = (out.validSuggestions ?? []).filter((s: any) => s.relevantFile === file.filename).length;
    const disc = (out.discardedSuggestions ?? []).filter((s: any) => s.relevantFile === file.filename).map((s: any) => s.priorityStatus);
    return pr ? 'PR-level' : inline ? 'inline' : disc.length ? `discarded:${disc.join(',')}` : 'lost';
};

const show = (f: any) => ({ filename: f.filename, status: f.status, patch: f.patch === undefined ? '<absent>' : f.patch === null ? '<null>' : JSON.stringify(f.patch).slice(0, 80), previous_filename: f.previous_filename });

describe('QA2671 provider shapes', () => {
    it('GitHub listFiles mapping', async () => {
        const gh = new GithubService({} as any, {} as any, {} as any, { getFromCache: jest.fn(), addToCache: jest.fn() } as any, { get: jest.fn() } as any);
        jest.spyOn(gh as any, 'getGithubAuthDetails').mockResolvedValue({ org: 'o', authMode: 'token' });
        const files = [
            { filename: 'qa2671/pure-rename.ts', status: 'renamed', previous_filename: 'qa2671/old.ts', additions: 0, deletions: 0, changes: 0 },
            { filename: 'qa2671/rename-edit.ts', status: 'renamed', previous_filename: 'qa2671/old2.ts', patch: '@@ -1,2 +1,3 @@\n a\n+b\n c' },
            { filename: 'qa2671/copied.ts', status: 'copied', previous_filename: 'qa2671/old3.ts' },
            { filename: 'qa2671/mode-only.sh', status: 'changed' },
            { filename: 'qa2671/logo-renamed.png', status: 'renamed', previous_filename: 'qa2671/logo.png' },
            { filename: 'qa2671/huge.ts', status: 'modified' },
        ];
        jest.spyOn(gh as any, 'instanceOctokit').mockResolvedValue({ paginate: async () => files, rest: { pulls: { listFiles: {} } } });
        const mapped = await gh.getFilesByPullRequestId({ organizationAndTeamData: { organizationId: 'org-A', teamId: 't' }, repository: { id: 'r', name: 'claude-athena' }, prNumber: 7 } as any);
        results.GitHub = await Promise.all(mapped.map(async (f: any) => ({ ...show(f), routedTo: await route(f) })));
    });

    it('GitLab allDiffs mapping', async () => {
        const s = new GitlabService({} as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any);
        jest.spyOn(s as any, 'getAuthDetails').mockResolvedValue({});
        const diffs = [
            { old_path: 'qa2671/old.ts', new_path: 'qa2671/pure-rename.ts', renamed_file: true, new_file: false, deleted_file: false, diff: '' },
            { old_path: 'qa2671/old2.ts', new_path: 'qa2671/rename-edit.ts', renamed_file: true, diff: '@@ -1,2 +1,3 @@\n a\n+b\n c\n' },
            { old_path: 'qa2671/mode-only.sh', new_path: 'qa2671/mode-only.sh', a_mode: '100644', b_mode: '100755', diff: '' },
            { old_path: 'qa2671/logo.png', new_path: 'qa2671/logo-renamed.png', renamed_file: true, diff: 'Binary files a/qa2671/logo.png and b/qa2671/logo-renamed.png differ\n' },
        ];
        jest.spyOn(s as any, 'instanceGitlabApi').mockReturnValue({ MergeRequests: { allDiffs: async () => diffs } });
        const mapped = await s.getFilesByPullRequestId({ organizationAndTeamData: { organizationId: 'org-A', teamId: 't' }, repository: { id: 'r' }, prNumber: 7 });
        results.GitLab = await Promise.all(mapped.map(async (f: any) => ({ ...show(f), routedTo: await route(f) })));
    });

    it('splitUnifiedDiff (Bitbucket Cloud whole-PR diff, Forgejo .diff)', async () => {
        const raw = [
            'diff --git a/qa2671/old.ts b/qa2671/pure-rename.ts', 'similarity index 100%', 'rename from qa2671/old.ts', 'rename to qa2671/pure-rename.ts',
            'diff --git a/qa2671/old3.ts b/qa2671/copied.ts', 'similarity index 100%', 'copy from qa2671/old3.ts', 'copy to qa2671/copied.ts',
            'diff --git a/qa2671/mode-only.sh b/qa2671/mode-only.sh', 'old mode 100644', 'new mode 100755',
            'diff --git a/qa2671/logo.png b/qa2671/logo-renamed.png', 'similarity index 90%', 'rename from qa2671/logo.png', 'rename to qa2671/logo-renamed.png', 'Binary files a/qa2671/logo.png and b/qa2671/logo-renamed.png differ',
            'diff --git a/qa2671/old2.ts b/qa2671/rename-edit.ts', 'similarity index 80%', 'rename from qa2671/old2.ts', 'rename to qa2671/rename-edit.ts', '--- a/qa2671/old2.ts', '+++ b/qa2671/rename-edit.ts', '@@ -1,2 +1,3 @@', ' a', '+b', ' c',
            '',
        ].join('\n');
        const files = splitUnifiedDiff(raw);
        // Bitbucket keeps the diffstat status (renamed for a rename); Forgejo keeps the files-API status. Route both views.
        results.splitUnifiedDiff = await Promise.all(files.map(async (f: any) => ({
            ...show(f),
            routedWithParsedStatus: await route(f),
            routedAsDiffstatRenamed: f.filename.includes('rename') || f.filename.includes('copied') ? await route({ ...f, status: f.filename.includes('copied') ? 'copied' : 'renamed' }) : null,
        })));
    });

    it('Azure _generateFileDiffForAzure for a pure rename (base read by new path)', async () => {
        const helper = new AzureReposRequestHelper();
        const content = Array.from({ length: 30 }, (_, i) => `const l${i + 1} = ${i};`).join('\n');
        jest.spyOn(helper, 'getFileContent').mockImplementation(async (p: any) => {
            if (p.commitId === 'base' && p.filePath === '/qa2671/pure-rename.ts') { const e: any = new Error('404'); e.status = 404; throw e; }
            return { content } as any;
        });
        const s = new AzureReposService({} as any, {} as any, {} as any, helper, { get: jest.fn() } as any);
        const res: Record<string, any> = {};
        for (const changeType of ['rename', 'edit, rename']) {
            const f = await (s as any)._generateFileDiffForAzure({ orgName: 'o', token: 't', projectId: 'p', repositoryId: 'r', filePath: '/qa2671/pure-rename.ts', baseCommitId: 'base', targetCommitId: 'head', changeType });
            const hunks = (f.patch?.match(/^@@ /gm) ?? []).length;
            res[changeType] = { status: f.status, hunks, patchHead: JSON.stringify(f.patch).slice(0, 120), additions: f.additions, routedTo: await route({ ...f, filename: f.filename }) };
        }
        results.Azure = res;
    });
});
