// QA #2576 audit round. Real ChatWithKodyFromGitUseCase, real CodeBaseConfigService (cascade + YAML loader),
// real UpdateOrCreateCodeReviewParameterUseCase (settings writes), real WebhookContextService (tenant resolution).
// Stubbed: Postgres rows, provider HTTP, LLM classifier call, agent, sandbox.
jest.mock('@libs/common/utils/thread-id', () => ({ createThreadId: jest.fn(() => ({ id: 'TR', metadata: {} })) }));
jest.mock('./implicit-reply', () => ({ ...jest.requireActual('./implicit-reply'), classifyReplyAddressedToKody: jest.fn() }));

import * as fs from 'fs';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { validateRiskApprovalSettings } from '@libs/common/utils/validateCodeReviewConfigFile';
import { isKodyMentionNonReview } from '@libs/common/utils/codeManagement/codeCommentMarkers';
import { isNewThreadReply } from '@libs/common/utils/codeManagement/threadReply';
import { ChatWithKodyFromGitUseCase } from './chatWithKodyFromGit.use-case';
import { classifyReplyAddressedToKody } from './implicit-reply';
import * as yaml from 'js-yaml';

let UpdateUC: any, WebhookCtx: any;
try { UpdateUC = require('@libs/code-review/application/use-cases/configuration/update-or-create-code-review-parameter-use-case').UpdateOrCreateCodeReviewParameterUseCase; } catch {}
try { WebhookCtx = require('@libs/platform/application/services/webhook-context.service').WebhookContextService; } catch {}

const classify = classifyReplyAddressedToKody as jest.Mock;
const ORG = '11111111-1111-4111-8111-111111111111', TEAM = '22222222-2222-4222-8222-222222222222';
const ORG_B = '33333333-3333-4333-8333-333333333333', TEAM_B = '44444444-4444-4444-8444-444444444444';
const MK = '<!-- kody-codereview -->', BBMK = '`kody|code-review`';
const OUT: any = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(OUT, null, 1)));

function mkCbs(getStored: () => any, file?: () => any) {
    const calls: any[] = [];
    const cm = {
        getTypeIntegration: async () => 'X',
        getDefaultBranch: async (p: any) => (calls.push(['defaultBranch', p.repository]), 'main'),
        getRepositoryContentFile: async (p: any) => { calls.push(['file', p.repository, p.file?.filename]); const f = file?.(); if (f instanceof Error) throw f; return f == null ? null : { data: { content: Buffer.from(f).toString('base64'), encoding: 'base64' } }; },
    };
    const cbs = new CodeBaseConfigService({} as any, {} as any, {} as any, { findOne: async (q: any) => { calls.push(['params.findOne', q?.team?.uuid]); const s = getStored(q?.team?.uuid); return s ? { configValue: JSON.parse(JSON.stringify(s)) } : null; } } as any, {} as any, {} as any, cm as any, {} as any, {} as any, {} as any);
    return { cbs, calls };
}

function mkUseCase(cbs: any, comments: any, extra: any = {}) {
    const rec: Record<string, number> = {}; const logs: any[] = [];
    const inc = (k: string) => (rec[k] = (rec[k] ?? 0) + 1);
    const cm = {
        findTeamAndOrganizationIdByConfigKey: async () => ({ integration: { organization: { uuid: ORG } }, team: { uuid: TEAM } }),
        getPullRequestReviewComment: async () => comments,
        addReactionToComment: async () => inc('reaction'), removeReactionsFromComment: async () => undefined,
        createResponseToComment: async (p: any) => (inc('response'), { id: 999, threadId: 1372, discussion_id: 'd1', parent: { id: p.inReplyToId } }),
        updateResponseToComment: async () => (inc('update'), {}), getCloneParams: async () => undefined,
        getPullRequest: async () => undefined, deleteComment: async () => undefined,
    };
    const claims = new Map<string, string>();
    const claim = { claim: async (_c: string, k: string) => { (rec['claimKeys' as any] as any) = [...(((rec as any).claimKeys) ?? []), k]; if (claims.has(k)) return null; claims.set(k, 'PROCESSING'); return 'h'; }, complete: async (_c: string, k: string) => { claims.set(k, 'PROCESSED'); }, release: async (_c: string, k: string) => { claims.delete(k); } };
    const uc: any = new (ChatWithKodyFromGitUseCase as any)(cm, { execute: async () => (inc('agent'), 'answer') }, { execute: async () => undefined },
        { validateExecutionPermissions: async () => (inc('permission'), { allowed: true }), resolveTaskSlot: async () => (inc('modelSlot'), undefined) },
        { acquire: async () => (inc('sandbox'), { sandbox: { type: 'null' }, leaseId: 'l' }), release: async () => undefined },
        { findByNumberAndRepositoryId: async () => null }, claim, undefined, undefined, extra.webhookContextService, cbs);
    for (const lvl of ['log', 'warn', 'error', 'debug']) uc.logger[lvl] = (o: any) => logs.push({ level: lvl, message: o?.message, reason: o?.metadata?.implicitReplySilence, org: o?.metadata?.organizationAndTeamData?.organizationId, err: o?.error?.message });
    classify.mockReset(); classify.mockImplementation(async () => (inc('classifier'), extra.verdict ?? true));
    return { uc, rec, logs, claims };
}
async function runCase(name: string, params: any, comments: any, cbsPack: any, extra: any = {}) {
    const u = mkUseCase(cbsPack.cbs, comments, extra);
    let err; try { await u.uc.execute(params); } catch (e: any) { err = e.message; }
    const r = { silence: u.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => `${l.level}:${l.reason}`), counts: { ...u.rec }, cfgCalls: cbsPack.calls.splice(0), notable: u.logs.filter((l) => !/Receiving|Extracted|PR description|platoformtype|sandbox clone|reaction from comment/.test(l.message)).map((l) => `${l.level}:${l.message}${l.err ? ' | ' + l.err : ''}`), claims: [...u.claims.entries()], err };
    OUT[name] = r; return r;
}
const T0 = '2026-11-24T10:00:00Z', T1 = '2026-11-24T10:01:00Z';
// native payload shapes
const P = {
    github: (c: any, o: any = {}) => ({ event: o.event ?? 'pull_request_review_comment', platformType: PlatformType.GITHUB, payload: { action: o.action ?? 'created', repository: { id: 1468015189, name: 'codex-athena', full_name: 'org/codex-athena', owner: { login: 'org' }, html_url: 'https://github.com/org/codex-athena' }, ...(o.event === 'issue_comment' ? { issue: { number: 1, pull_request: { url: 'https://api.github.com/repos/org/codex-athena/pulls/1' } } } : { pull_request: { number: 1, head: { ref: 'f' }, base: { ref: 'main' } } }), comment: c, sender: { id: 5, login: 'dev' } } }),
    gitlab: (note: any, o: any = {}) => ({ event: 'note', platformType: PlatformType.GITLAB, payload: { object_kind: 'note', event_type: 'note', user: { id: 7, name: 'Dev', username: 'dev' }, project: { id: 89319210, name: 'codex-athena', path_with_namespace: 'ns/codex-athena', namespace: 'NS', web_url: `https://${o.host ?? 'gitlab.com'}/ns/codex-athena` }, object_attributes: { id: note.id, note: note.body, type: 'DiffNote', action: 'create', noteable_type: 'MergeRequest', updated_at: T1, ...(o.noDiscussionId ? {} : { discussion_id: 'd1' }) }, merge_request: { iid: 1, source_branch: 'f', target_branch: 'main', description: '' } } }),
    bitbucket: (c: any) => ({ event: 'pullrequest:comment_created', platformType: PlatformType.BITBUCKET, payload: { repository: { uuid: '{d7ecce61-5e9d-4e3d-b60a-67a295687125}', name: 'codex-athena', full_name: 'ws/codex-athena', workspace: { slug: 'ws' } }, pullrequest: { id: 1, source: { branch: { name: 'f' } }, destination: { branch: { name: 'main' } }, description: '' }, comment: { id: c.id, content: { raw: c.body }, ...(c.parent ? { parent: { id: c.parent } } : {}), inline: c.inline === false ? undefined : { path: 'a.ts', to: 3 }, created_on: T1, updated_on: T1 }, actor: { display_name: 'Dev', uuid: '{u1}' } } }),
    azure: (c: any, thread = 1372) => ({ event: 'ms.vss-code.git-pullrequest-comment-event', platformType: PlatformType.AZURE_REPOS, payload: { eventType: 'ms.vss-code.git-pullrequest-comment-event', resource: { comment: { id: c.id, parentCommentId: c.parent ?? 0, content: c.body, author: { displayName: 'Dev', id: 'u1' }, publishedDate: T1, lastUpdatedDate: T1, _links: { threads: { href: `https://dev.azure.com/o/p/_apis/git/repositories/r/pullRequests/211/threads/${thread}` } }, ...(c.filePath ? { threadContext: { filePath: c.filePath } } : {}) }, pullRequest: { pullRequestId: 211, repository: { id: '32c159b2-ac16-419b-9445-8ab275cabadc', name: 'codex-athena', project: { name: 'Kodus QA' } }, sourceRefName: 'refs/heads/f', targetRefName: 'refs/heads/main' } }, resourceContainers: { project: { id: 'p' } } } }),
    forgejo: (c: any, o: any = {}) => ({ event: o.event ?? 'issue_comment', platformType: PlatformType.FORGEJO, payload: { action: 'created', repository: { id: 2929820, full_name: 'kodus/codex-athena', name: 'codex-athena', owner: { login: 'kodus' }, html_url: 'https://codeberg.org/kodus/codex-athena' }, issue: { number: 1, pull_request: {} }, pull_request: { number: 1, head: { ref: 'f' }, base: { ref: 'main' } }, comment: c, sender: { id: 5, login: 'dev' } } }),
};
const C = {
    github: (reply: any) => [{ id: 555, body: `Bug. ${MK}`, user: { login: 'owner', type: 'User' }, created_at: T0 }, { in_reply_to_id: 555, user: { login: 'dev', type: 'User' }, created_at: T1, ...reply }],
    gitlab: (reply: any) => [{ id: 100, body: `Bug. ${MK}`, author: { name: 'Owner', username: 'owner' }, discussionId: 'd1', created_at: T0 }, { author: { name: 'Dev', username: 'dev' }, discussionId: 'd1', created_at: T1, ...reply }],
    gitlabRaw: (reply: any) => [{ id: 'd1', notes: [{ id: 100, body: `Bug. ${MK}`, author: { name: 'Owner', username: 'owner' }, created_at: T0 }, { author: { name: 'Dev', username: 'dev' }, created_at: T1, ...reply }] }],
    bitbucket: (reply: any) => [{ id: 200, body: `${BBMK} Bug`, author: { name: 'Owner' }, created_at: T0 }, { id: 201, body: `${BBMK} **Prompt for AI**`, parent: { id: 200 }, author: { name: 'Owner' }, created_at: T0 }, { parent: { id: 200 }, author: { name: 'Dev' }, created_at: T1, ...reply }],
    azure: (reply: any) => [{ threadId: 1372, id: 1, body: `Bug. ${MK}`, author: { name: 'Owner' }, createdAt: T0, replies: [{ author: { name: 'Dev' }, threadId: 1372, createdAt: T1, ...reply }] }],
    forgejo: (reply: any) => [{ id: 555, body: `Bug. ${MK}`, user: { login: 'owner' }, created_at: T0 }, { user: { login: 'dev' }, created_at: T1, ...reply }],
};
const cfg = (g: any, repos: Record<string, any> = {}) => ({ id: 'global', name: 'Global', configs: g, isSelected: true, repositories: Object.entries(repos).map(([id, c]) => ({ id, name: id, configs: c, isSelected: true, directories: [] })) });

describe('audit', () => {
    it('item 1: M18 invalid policy blocks really rejected; tolerate path', async () => {
        const files: Record<string, string> = {
            approvalPolicies: 'version: "1.2"\napprovalPolicies:\n  - nope: 1\nconversation:\n  implicitReplies: false\n',
            riskCriteria: 'version: "1.2"\nriskCriteria: 42\nconversation:\n  implicitReplies: false\n',
            validControl: 'version: "1.2"\nconversation:\n  implicitReplies: false\n',
        };
        OUT.item1 = {};
        for (const [k, f] of Object.entries(files)) {
            const { cbs } = mkCbs(() => cfg({}, { '123': { kodusConfigFileOverridesWebPreferences: true } }), () => f);
            const errs = validateRiskApprovalSettings(yaml.load(f) as any).map((e: any) => `${e.instancePath} ${e.message}`);
            let strict: any; try { await cbs.getKodusConfigFile({ organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, repository: { id: '123', name: 'a' }, overrideConfig: true, tolerateReviewSettingsErrors: false }); strict = 'returned (no throw)'; } catch (e: any) { strict = 'THREW: ' + e.message; }
            const tol: any = await cbs.getKodusConfigFile({ organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, repository: { id: '123', name: 'a' }, overrideConfig: true, tolerateReviewSettingsErrors: true });
            const pack = mkCbs(() => cfg({}, { '1468015189': { kodusConfigFileOverridesWebPreferences: true } }), () => f);
            const gate = await runCase(`item1_gate_${k}`, P.github({ id: 900, body: 'Fixed.', in_reply_to_id: 555, created_at: T1, updated_at: T1 }), C.github({ id: 900, body: 'Fixed.' }), pack);
            OUT.item1[k] = { validatorErrors: errs, strictLoad: strict, tolerantLoad: { conversation: tol?.conversation, approvalPolicies: JSON.stringify(tol?.approvalPolicies)?.slice(0, 200), riskCriteria: JSON.stringify(tol?.riskCriteria)?.slice(0, 200), otherKeys: Object.keys(tol ?? {}).filter((x) => !['conversation', 'approvalPolicies', 'riskCriteria'].includes(x)) }, gate: gate.silence };
        }
    });

    it('items 2/3: real settings writes (UpdateOrCreate use case) then the gate, GitHub/GitLab/Azure ids', async () => {
        if (!UpdateUC) { OUT.items23 = 'UpdateOrCreate use case not importable'; return; }
        for (const [prov, rid] of [['github', '1468015189'], ['gitlab', '89319210'], ['azure', '32c159b2-ac16-419b-9445-8ab275cabadc']] as const) {
            let stored: any = cfg({}, { [rid]: {} });
            const uc = new UpdateUC({ findByKey: jest.fn(async () => ({ configValue: JSON.parse(JSON.stringify(stored)) })) }, { execute: jest.fn(async (...a: any[]) => { const v = a.find((x) => x && typeof x === 'object' && 'repositories' in x); if (v) stored = JSON.parse(JSON.stringify(v)); return true; }) },
                { findIntegrationConfigFormatted: async () => [{ id: rid, name: rid, directories: [] }] }, { emit: jest.fn() }, { ensure: jest.fn() }, { detectAndSaveReferences: jest.fn() }, { buildConfigKey: () => 'k' },
                { getCentralizedRepositoryIfEnabled: jest.fn(async () => null), getScopedKodusConfigFileContent: jest.fn(async () => null), createMutationPullRequestIfEnabled: jest.fn(), buildCentralizedPath: (p: any) => p },
                { find: async () => [] }, { getBYOKConfig: jest.fn(), getSubscriptionStatus: jest.fn() }, { execute: jest.fn() }, { validateOrganizationLicense: async () => ({ valid: true, subscriptionStatus: 'active', planType: 'teams_byok' }) }, { codeReviewSettingsUpdated: jest.fn() }, { getTypeIntegration: jest.fn(async () => PlatformType.GITHUB) });
            const write = (cv: any, repositoryId?: string) => uc.execute({ organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, configValue: cv, repositoryId, actor: { source: 'web', userId: 'u' }, requestUser: { uuid: 'u' }, skipAuthorization: true });
            const snap = () => ({ global: stored.configs?.conversation ?? null, repo: stored.repositories.find((r: any) => r.id === rid)?.configs?.conversation ?? null });
            const pack = mkCbs(() => stored);
            const params = prov === 'github' ? P.github({ id: 900, body: 'Fixed.', in_reply_to_id: 555, created_at: T1, updated_at: T1 }) : prov === 'gitlab' ? P.gitlab({ id: 901, body: 'Fixed.' }) : P.azure({ id: 2, parent: 1, body: 'Fixed.', filePath: '/a.ts' });
            const comments = prov === 'github' ? C.github({ id: 900, body: 'Fixed.' }) : prov === 'gitlab' ? C.gitlab({ id: 901, body: 'Fixed.' }) : C.azure({ id: 2, body: 'Fixed.' });
            const steps: any[] = [];
            // M10: global true (default), repo false
            await write({ conversation: { implicitReplies: false } }, rid); steps.push({ step: 'repo false, global default', stored: snap(), gate: (await runCase(`items23_${prov}_repo_false`, params, comments, pack)).silence });
            // M11: global false + repo true -> classified; then global true + repo false -> disabled with the false at repo level
            await write({ conversation: { implicitReplies: false } }); await write({ conversation: { implicitReplies: true } }, rid);
            steps.push({ step: 'global false, repo true', stored: snap(), gate: (await runCase(`items23_${prov}_global_false_repo_true`, params, comments, pack)).counts.classifier ?? 0 });
            await write({ conversation: { implicitReplies: true } }); await write({ conversation: { implicitReplies: false } }, rid);
            steps.push({ step: 'global true, repo false (differs from inherited)', stored: snap(), gate: (await runCase(`items23_${prov}_global_true_repo_false`, params, comments, pack)).silence });
            OUT[`items23_${prov}`] = steps;
        }
    });

    it('item 5: real WebhookContextService, two tenants same repo id', async () => {
        if (!WebhookCtx) { OUT.item5 = 'not importable'; return; }
        const configs = [
            { configValue: [{ id: '42', name: 'acme/athena', http_url: 'https://gl-a.example.com/acme/athena.git', web_url: 'https://gl-a.example.com/acme/athena' }], team: { uuid: TEAM, organization: { uuid: ORG } }, integration: { authIntegration: { authDetails: { host: 'https://gl-a.example.com' } } } },
            { configValue: [{ id: '42', name: 'acme/athena', http_url: 'https://gl-b.example.com/acme/athena.git', web_url: 'https://gl-b.example.com/acme/athena' }], team: { uuid: TEAM_B, organization: { uuid: ORG_B } }, integration: { authIntegration: { authDetails: { host: 'https://gl-b.example.com' } } } },
        ];
        const lookups: any[] = [];
        const ctx = new WebhookCtx({ findIntegrationConfigWithTeams: async (_k: any, id: any, p: any) => (lookups.push([typeof id, id, p]), configs) }, { find: async (q: any) => [{ uuid: 'ta-' + q.team.uuid }] }, { find: async () => [{ uuid: 'auto' }] });
        const stored: any = { [TEAM]: cfg({ conversation: { implicitReplies: false } }), [TEAM_B]: cfg({}) };
        const pack = mkCbs((team: string) => stored[team]);
        const note = (id: number) => ({ id, body: 'Fixed.' });
        const mk = (host: string, id: number) => { const p: any = P.gitlab(note(id), { host }); p.payload.project.id = 42; p.payload.project.path_with_namespace = 'acme/athena'; p.payload.project.web_url = `https://${host}/acme/athena`; return p; };
        const a = await runCase('item5_tenant_A', mk('gl-a.example.com', 901), C.gitlab(note(901)), pack, { webhookContextService: ctx });
        const b = await runCase('item5_tenant_B', mk('gl-b.example.com', 902), C.gitlab(note(902)), pack, { webhookContextService: ctx });
        OUT.item5 = { contextLookups: lookups, A: { silence: a.silence, findOneTeams: a.cfgCalls.filter((c: any) => c[0] === 'params.findOne').map((c: any) => c[1]), classifier: a.counts.classifier ?? 0 }, B: { silence: b.silence, findOneTeams: b.cfgCalls.filter((c: any) => c[0] === 'params.findOne').map((c: any) => c[1]), classifier: b.counts.classifier ?? 0 } };
    });

    it('items 6/14: edit a silenced reply into @kody (handler predicate + use case, new version key)', async () => {
        const pack = mkCbs(() => cfg({ conversation: { implicitReplies: false } }));
        const silent = { id: 900, body: 'Fixed in abc.', in_reply_to_id: 555, created_at: T1, updated_at: T1 };
        const edited = { ...silent, body: '@kody explain this finding', updated_at: '2026-11-24T10:05:00Z' };
        const u = mkUseCase(pack.cbs, C.github({ id: 900, body: 'Fixed in abc.' }));
        await u.uc.execute(P.github(silent));
        (u.uc as any).codeManagementService.getPullRequestReviewComment = async () => C.github({ id: 900, body: edited.body });
        await u.uc.execute(P.github(edited, { action: 'edited' }));
        const handlerForwards = (body: string, action: string) => isKodyMentionNonReview(body) || isNewThreadReply(PlatformType.GITHUB, 'pull_request_review_comment', { action, comment: { in_reply_to_id: 555 } });
        OUT.items6_14 = { handlerPredicate: { editedMention: handlerForwards(edited.body, 'edited'), editedUnmentioned: handlerForwards('Fixed, edited', 'edited'), createdUnmentioned: handlerForwards('Fixed', 'created') },
            silence: u.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.reason), claimKeys: (u.rec as any).claimKeys, claims: [...u.claims.entries()], agent: u.rec.agent ?? 0, classifier: u.rec.classifier ?? 0, responses: u.rec.response ?? 0, dupSkips: u.logs.filter((l) => /already claimed/.test(l.message)).length };
    });

    it('item 7: GitLab note without discussion_id (raw discussions flattened)', async () => {
        const pack = mkCbs(() => cfg({ conversation: { implicitReplies: false } }));
        await runCase('item7_gitlab_no_discussion_id_off', P.gitlab({ id: 901, body: 'Fixed.' }, { noDiscussionId: true }), C.gitlabRaw({ id: 901, body: 'Fixed.' }), pack);
        const pack2 = mkCbs(() => cfg({}));
        await runCase('item7_gitlab_no_discussion_id_on', P.gitlab({ id: 901, body: 'Fixed.' }, { noDiscussionId: true }), C.gitlabRaw({ id: 901, body: 'Fixed.' }), pack2);
    });

    it('items 11/12: explicit @kody and implicit (setting on) per provider with native payloads', async () => {
        const off = () => cfg({ conversation: { implicitReplies: false } }), on = () => cfg({});
        // item 11 explicit, setting off
        await runCase('item11_github_toplevel_mention_off', P.github({ id: 951, body: '@kody summarize the risk', user: { login: 'dev' }, created_at: T1, updated_at: T1 }, { event: 'issue_comment' }), [{ id: 951, body: '@kody summarize the risk', user: { login: 'dev' }, created_at: T1 }], mkCbs(off));
        await runCase('item11_bitbucket_thread_mention_off', P.bitbucket({ id: 300, parent: 200, body: '@kody explain this finding' }), C.bitbucket({ id: 300, body: '@kody explain this finding' }), mkCbs(off));
        await runCase('item11_bitbucket_general_mention_off', P.bitbucket({ id: 301, body: '@kody summarize', inline: false }), [{ id: 301, body: '@kody summarize', author: { name: 'Dev' }, created_at: T1 }], mkCbs(off));
        await runCase('item11_azure_thread_mention_off', P.azure({ id: 2, parent: 1, body: '@kody explain this finding', filePath: '/a.ts' }), C.azure({ id: 2, body: '@kody explain this finding' }), mkCbs(off));
        await runCase('item11_forgejo_general_mention_off', P.forgejo({ id: 77, body: '@kody explain', user: { login: 'dev' }, created_at: T1, updated_at: T1 }), [{ id: 77, body: '@kody explain', user: { login: 'dev' }, created_at: T1 }], mkCbs(off));
        await runCase('item11_forgejo_inline_mention_off', P.forgejo({ id: 78, body: '@kody explain', in_reply_to_id: 555, user: { login: 'dev' }, created_at: T1, updated_at: T1 }, { event: 'pull_request_review_comment' }), C.forgejo({ id: 78, body: '@kody explain' }), mkCbs(off));
        // item 12 implicit with setting on: exactly one classifier call per reply
        await runCase('item12_gitlab_implicit_on', P.gitlab({ id: 901, body: 'Why is this wrong?' }), C.gitlab({ id: 901, body: 'Why is this wrong?' }), mkCbs(on));
        await runCase('item12_bitbucket_implicit_on', P.bitbucket({ id: 300, parent: 200, body: 'Why is this wrong?' }), C.bitbucket({ id: 300, body: 'Why is this wrong?' }), mkCbs(on));
        await runCase('item12_azure_implicit_on', P.azure({ id: 2, parent: 1, body: 'Why is this wrong?', filePath: '/a.ts' }), C.azure({ id: 2, body: 'Why is this wrong?' }), mkCbs(on));
        await runCase('item12_gitlab_implicit_off', P.gitlab({ id: 901, body: 'Why?' }), C.gitlab({ id: 901, body: 'Why?' }), mkCbs(off));
        await runCase('item12_bitbucket_implicit_off', P.bitbucket({ id: 300, parent: 200, body: 'Why?' }), C.bitbucket({ id: 300, body: 'Why?' }), mkCbs(off));
        await runCase('item12_azure_implicit_off', P.azure({ id: 2, parent: 1, body: 'Why?', filePath: '/a.ts' }), C.azure({ id: 2, body: 'Why?' }), mkCbs(off));
    });

    it('item 17: two teams of one org', async () => {
        const stored: any = { [TEAM]: cfg({ conversation: { implicitReplies: false } }), [TEAM_B]: cfg({}) };
        const pack = mkCbs((t: string) => stored[t]);
        const a: any = await pack.cbs.getSimpleConfig({ organizationId: ORG, teamId: TEAM }, { repositoryId: 'r' });
        const b: any = await pack.cbs.getSimpleConfig({ organizationId: ORG, teamId: TEAM_B }, { repositoryId: 'r' });
        OUT.item17 = { teamA_globalFalse: a.conversation, teamB_sameOrg_noSetting: b.conversation, findOneTeams: pack.calls.map((c: any) => c[1]) };
    });
});
