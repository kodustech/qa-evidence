// QA #2576 item 16: the gate's kodus-config.yml read on GitLab / Bitbucket Cloud / Azure Repos through the REAL
// provider services (GitlabService, BitbucketCloudService, AzureReposService + AzureReposRequestHelper) doing real
// read-only HTTP against dedicated fixture repos (qa-2576-yaml, file says implicitReplies: false). Stubbed: only the
// DB boundaries (integrationService.getPlatformAuthDetails, stored repositories list), the LLM classifier, the agent.
// Tokens come from env (never printed) and are encrypted with a throwaway API_CRYPTO_KEY so the services decrypt them.
jest.mock('@libs/common/utils/thread-id', () => ({ createThreadId: jest.fn(() => ({ id: 'TR', metadata: {} })) }));
jest.mock('./implicit-reply', () => ({ ...jest.requireActual('./implicit-reply'), classifyReplyAddressedToKody: jest.fn() }));
jest.setTimeout(120000);

import * as fs from 'fs';
import { encrypt } from '@libs/common/utils/crypto';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { GitlabService } from '@libs/platform/infrastructure/adapters/services/gitlab.service';
import { BitbucketCloudService } from '@libs/platform/infrastructure/adapters/services/bitbucket/bitbucket-cloud.service';
import { AzureReposService } from '@libs/platform/infrastructure/adapters/services/azureRepos/azureRepos.service';
import { AzureReposRequestHelper } from '@libs/platform/infrastructure/adapters/services/azureRepos/azure-repos-request-helper';
import { createLogger } from '@libs/core/log/logger';
import { ChatWithKodyFromGitUseCase } from './chatWithKodyFromGit.use-case';
import { classifyReplyAddressedToKody } from './implicit-reply';

const classify = classifyReplyAddressedToKody as jest.Mock;
const E = process.env as any;
const OUT: any = {};
afterAll(() => fs.writeFileSync(E.QA_OUT, JSON.stringify(OUT, null, 1)));
const ORG = '11111111-1111-4111-8111-111111111111', TEAM = '22222222-2222-4222-8222-222222222222';
const T0 = '2026-11-24T10:00:00Z', T1 = '2026-11-24T10:01:00Z';

function provider(kind: string) {
    const http: string[] = [];
    if (kind === 'gitlab') {
        const s: any = Object.create(GitlabService.prototype);
        s.logger = createLogger('GitlabService');
        s.integrationService = { getPlatformAuthDetails: async () => ({ accessToken: encrypt(E.QA_GL_TOKEN), authMode: 'token' }) };
        s.cacheService = { getFromCache: async () => null, addToCache: async () => undefined };
        return { s, http };
    }
    if (kind === 'bitbucket') {
        const s: any = Object.create(BitbucketCloudService.prototype);
        s.logger = { log: () => undefined, warn: (o: any) => http.push('provider-warn: ' + o?.message), error: (o: any) => http.push('provider-error: ' + o?.message + ' | ' + (o?.error?.message ?? '')), debug: () => undefined };
        s.headCommitMemo = new Map();
        s.integrationService = { getPlatformAuthDetails: async () => ({ email: E.QA_BB_EMAIL, appPassword: encrypt(E.QA_BB_TOKEN), authMode: 'token' }) };
        s.findOneByOrganizationAndTeamDataAndConfigKey = async () => [{ id: E.QA_BB_REPO, name: 'qa-2576-yaml', workspaceId: E.QA_BB_WS, default_branch: 'main' }];
        s.cacheService = { getFromCache: async () => null, addToCache: async () => undefined };
        const orig = s.safeFetch; s.safeFetch = (url: string, o: any, c: any) => (http.push(String(url).split('?')[0]), (orig ? orig.call(s, url, o, c) : fetch(url, o)));
        return { s, http };
    }
    const s: any = Object.create(AzureReposService.prototype);
    s.logger = createLogger('AzureReposService');
    s.integrationService = { getPlatformAuthDetails: async () => ({ orgName: E.QA_AZ_ORG, token: encrypt(E.QA_AZ_TOKEN), authMode: 'token' }) };
    s.findOneByOrganizationAndTeamDataAndConfigKey = async () => [{ id: E.QA_AZ_REPO, name: 'qa-2576-yaml', project: { id: E.QA_AZ_PROJECT, name: 'Kodus QA' }, default_branch: 'refs/heads/main' }];
    const helper: any = Object.create(AzureReposRequestHelper.prototype); helper.logger = createLogger('AzureReposRequestHelper');
    s.azureReposRequestHelper = helper;
    s.cacheService = { getFromCache: async () => null, addToCache: async () => undefined };
    return { s, http };
}

function payload(kind: string) {
    if (kind === 'gitlab') return { event: 'note', platformType: PlatformType.GITLAB, payload: { object_kind: 'note', event_type: 'note', user: { id: 7, name: 'Dev', username: 'dev' }, project: { id: Number(E.QA_GL_PROJECT), name: 'qa-2576-yaml', path_with_namespace: 'ns/qa-2576-yaml', namespace: 'NS', web_url: 'https://gitlab.com/ns/qa-2576-yaml' }, object_attributes: { id: 901, note: 'Fixed.', type: 'DiffNote', action: 'create', discussion_id: 'd1', updated_at: T1 }, merge_request: { iid: 1, source_branch: 'f', target_branch: 'main' } } };
    if (kind === 'bitbucket') return { event: 'pullrequest:comment_created', platformType: PlatformType.BITBUCKET, payload: { repository: { uuid: `{${E.QA_BB_REPO}}`, name: 'qa-2576-yaml', full_name: 'ws/qa-2576-yaml', workspace: { slug: 'ws' } }, pullrequest: { id: 1, source: { branch: { name: 'f' } }, destination: { branch: { name: 'main' } } }, comment: { id: 300, content: { raw: 'Fixed.' }, parent: { id: 200 }, inline: { path: 'a.ts' }, created_on: T1, updated_on: T1 }, actor: { display_name: 'Dev', uuid: '{u}' } } };
    return { event: 'ms.vss-code.git-pullrequest-comment-event', platformType: PlatformType.AZURE_REPOS, payload: { resource: { comment: { id: 2, parentCommentId: 1, content: 'Fixed.', author: { displayName: 'Dev' }, publishedDate: T1, lastUpdatedDate: T1, _links: { threads: { href: 'https://dev.azure.com/o/p/_apis/git/repositories/r/pullRequests/211/threads/1372' } }, threadContext: { filePath: '/a.ts' } }, pullRequest: { pullRequestId: 211, repository: { id: E.QA_AZ_REPO, name: 'qa-2576-yaml', project: { name: 'Kodus QA' } }, sourceRefName: 'refs/heads/f', targetRefName: 'refs/heads/main' } }, resourceContainers: { project: { id: E.QA_AZ_PROJECT } } } };
}
function comments(kind: string) {
    const MK = '<!-- kody-codereview -->';
    if (kind === 'gitlab') return [{ id: 100, body: `Bug ${MK}`, author: { name: 'Owner', username: 'owner' }, discussionId: 'd1', created_at: T0 }, { id: 901, body: 'Fixed.', author: { name: 'Dev', username: 'dev' }, discussionId: 'd1', created_at: T1 }];
    if (kind === 'bitbucket') return [{ id: 200, body: '`kody|code-review` Bug', author: { name: 'Owner' }, created_at: T0 }, { id: 300, body: 'Fixed.', parent: { id: 200 }, author: { name: 'Dev' }, created_at: T1 }];
    return [{ threadId: 1372, id: 1, body: `Bug ${MK}`, author: { name: 'Owner' }, createdAt: T0, replies: [{ id: 2, threadId: 1372, body: 'Fixed.', author: { name: 'Dev' }, createdAt: T1 }] }];
}

describe('item 16', () => {
    for (const kind of ['gitlab', 'bitbucket', 'azure']) {
        for (const optIn of [true, false]) {
            it(`${kind} opt-in=${optIn}`, async () => {
                const { s, http } = provider(kind);
                const reads: any[] = [];
                const cm = {
                    getTypeIntegration: async () => kind,
                    getDefaultBranch: async (p: any) => { const r = await s.getDefaultBranch(p); reads.push({ op: 'getDefaultBranch', repository: p.repository, result: r }); return r; },
                    getRepositoryContentFile: async (p: any) => { const r = await s.getRepositoryContentFile(p); reads.push({ op: 'getRepositoryContentFile', repository: p.repository, ref: p.pullRequest?.head?.ref, gotContent: !!r?.data?.content, contentHead: r?.data?.content ? String(r.data.encoding === 'base64' ? Buffer.from(r.data.content, 'base64').toString() : r.data.content).slice(0, 80) : null }); return r; },
                };
                const repoId = kind === 'gitlab' ? E.QA_GL_PROJECT : kind === 'bitbucket' ? E.QA_BB_REPO : E.QA_AZ_REPO;
                const stored = { id: 'global', name: 'Global', configs: {}, repositories: [{ id: repoId, name: 'qa-2576-yaml', configs: optIn ? { kodusConfigFileOverridesWebPreferences: true } : {}, directories: [] }] };
                const cbs = new CodeBaseConfigService({} as any, {} as any, {} as any, { findOne: async () => ({ configValue: stored }) } as any, {} as any, {} as any, cm as any, {} as any, {} as any, {} as any);
                const logs: any[] = []; let cls = 0;
                const uc: any = new (ChatWithKodyFromGitUseCase as any)(
                    { findTeamAndOrganizationIdByConfigKey: async () => ({ integration: { organization: { uuid: ORG } }, team: { uuid: TEAM } }), getPullRequestReviewComment: async () => comments(kind), addReactionToComment: async () => undefined, removeReactionsFromComment: async () => undefined, createResponseToComment: async (p: any) => ({ id: 9, parent: { id: p.inReplyToId } }), updateResponseToComment: async () => ({}), getCloneParams: async () => undefined },
                    { execute: async () => 'a' }, { execute: async () => undefined }, { validateExecutionPermissions: async () => ({ allowed: true }), resolveTaskSlot: async () => undefined },
                    { acquire: async () => ({ sandbox: { type: 'null' }, leaseId: 'l' }), release: async () => undefined }, { findByNumberAndRepositoryId: async () => null }, undefined, undefined, undefined, undefined, cbs);
                for (const lvl of ['log', 'warn', 'error']) uc.logger[lvl] = (o: any) => logs.push(`${lvl}:${o?.message}${o?.error ? ' | ' + o.error.message : ''}`);
                classify.mockReset(); classify.mockImplementation(async () => (cls++, false));
                await uc.execute(payload(kind));
                OUT[`${kind}_optin_${optIn}`] = { reads, http, silence: logs.filter((l) => /left unanswered/.test(l)), warns: logs.filter((l) => /^warn|^error/.test(l) && !/platoformtype|sandbox clone/.test(l)), classifierCalls: cls };
            });
        }
    }
});
