// QA #2576 harness: real ChatWithKodyFromGitUseCase + real CodeBaseConfigService (getSimpleConfig,
// getKodusConfigFile, YAML loader, cascade). Stubbed boundaries only: Postgres parameters row, provider
// HTTP (comments, default branch, file content), LLM classifier call, conversation agent, sandbox.
jest.mock('@libs/common/utils/thread-id', () => ({
    createThreadId: jest.fn(() => ({ id: 'TR-test', metadata: {} })),
}));
jest.mock('./implicit-reply', () => ({
    ...jest.requireActual('./implicit-reply'),
    classifyReplyAddressedToKody: jest.fn(),
}));

import * as fs from 'fs';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { isNewThreadReply } from '@libs/common/utils/codeManagement/threadReply';
import { ChatWithKodyFromGitUseCase } from './chatWithKodyFromGit.use-case';
import { classifyReplyAddressedToKody } from './implicit-reply';

const classify = classifyReplyAddressedToKody as jest.Mock;
const ORG = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const ORG_B = '33333333-3333-4333-8333-333333333333';
const TEAM_B = '44444444-4444-4444-8444-444444444444';
const MARKER = '<!-- kody-codereview -->';
const ANSWER = `${MARKER}\n<!-- kody-conversation -->`;
const OUT: any = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(OUT, null, 1)));

type Env = {
    stored?: any; // configValue of the parameters row; null = no row; Error = throws
    storedByTeam?: Record<string, any>;
    file?: string | null | Error | (() => string | null);
    defaultBranch?: string;
    noService?: boolean;
    thread?: any[];
    classifyImpl?: () => any;
    contexts?: Record<string, { organizationId: string; teamId: string }>;
};

function build(env: Env) {
    const calls: Record<string, any[]> = {};
    const rec = (k: string, ...a: any[]) => ((calls[k] ??= []).push(a), undefined);
    const logs: any[] = [];
    const parametersService = {
        findOne: jest.fn(async (q: any) => {
            rec('parameters.findOne', q?.team?.uuid);
            const s = env.storedByTeam ? env.storedByTeam[q?.team?.uuid] : env.stored;
            if (s instanceof Error) throw s;
            return s == null ? null : { configValue: JSON.parse(JSON.stringify(s)) };
        }),
    };
    const cfgCodeMgmt = {
        getTypeIntegration: jest.fn(async () => 'GITHUB'),
        getDefaultBranch: jest.fn(async (p: any) => (rec('provider.getDefaultBranch', p.repository?.id), env.defaultBranch ?? 'main')),
        getRepositoryContentFile: jest.fn(async (p: any) => {
            rec('provider.getRepositoryContentFile', p.file?.filename, p.pullRequest?.head?.ref, p.repository?.id);
            let f = typeof env.file === 'function' ? env.file() : env.file;
            if (f instanceof Error) throw f;
            if (f == null) return null;
            return { data: { content: Buffer.from(f).toString('base64'), encoding: 'base64' } };
        }),
    };
    const cbs = new CodeBaseConfigService(
        {} as any, {} as any, {} as any, parametersService as any, {} as any, {} as any,
        cfgCodeMgmt as any, {} as any, {} as any, { getFromCache: async () => null, addToCache: async () => undefined } as any,
    );
    const codeManagementService = {
        findTeamAndOrganizationIdByConfigKey: jest.fn(async (q: any) => {
            rec('integration.lookup', typeof q?.repository?.id, q?.repository?.id);
            return { integration: { organization: { uuid: ORG } }, team: { uuid: TEAM } };
        }),
        getPullRequestReviewComment: jest.fn(async () => env.thread ?? []),
        addReactionToComment: jest.fn(async () => rec('provider.addReaction')),
        removeReactionsFromComment: jest.fn(async () => undefined),
        createResponseToComment: jest.fn(async (p: any) => (rec('provider.createResponse', p.inReplyToId), { id: 999 })),
        updateResponseToComment: jest.fn(async () => ({})),
        getCloneParams: jest.fn(async () => undefined),
        getPullRequest: jest.fn(async () => undefined),
    };
    const permissionValidationService = {
        validateExecutionPermissions: jest.fn(async () => (rec('permission.validate'), { allowed: true })),
        resolveTaskSlot: jest.fn(async () => (rec('model.resolveTaskSlot'), undefined)),
    };
    const agent = { execute: jest.fn(async () => (rec('agent.execute'), 'an answer')) };
    const lease = {
        acquire: jest.fn(async () => (rec('sandbox.acquire'), { sandbox: { type: 'null' }, leaseId: 'l' })),
        release: jest.fn(async () => undefined),
    };
    const prs = { findByNumberAndRepositoryId: jest.fn(async (...a: any[]) => (rec('suggestion.lookup', typeof a[1], a[1]), null)) };
    const claims = new Map<string, string>();
    const claimService = {
        claim: jest.fn(async (_c: string, key: string) => { rec('claim', key); if (claims.has(key)) return null; claims.set(key, 'PROCESSING'); return 'h'; }),
        complete: jest.fn(async (_c: string, key: string) => (claims.set(key, 'PROCESSED'), undefined)),
        release: jest.fn(async (_c: string, key: string) => (claims.delete(key), undefined)),
    };
    const webhookContextService = env.contexts
        ? { getContext: jest.fn(async (_p: any, _id: string, source: any) => {
              const c = env.contexts![source?.host ?? 'default'];
              return c ? { organizationAndTeamData: c } : null;
          }) }
        : undefined;
    const useCase = new (ChatWithKodyFromGitUseCase as any)(
        codeManagementService, agent, { execute: jest.fn() }, permissionValidationService, lease, prs, claimService,
        undefined, undefined, webhookContextService, env.noService ? undefined : cbs,
    );
    for (const lvl of ['log', 'warn', 'error', 'debug', 'verbose']) {
        const orig = useCase.logger[lvl]?.bind(useCase.logger);
        useCase.logger[lvl] = (o: any) => { logs.push({ level: lvl, message: o?.message, md: o?.metadata ? { implicitReplySilence: o.metadata.implicitReplySilence, commentId: o.metadata.commentId, platformType: o.metadata.platformType, org: o.metadata.organizationAndTeamData?.organizationId } : undefined, error: o?.error?.message }); };
    }
    classify.mockReset();
    classify.mockImplementation(env.classifyImpl ?? (async () => (rec('llm.classify'), true)));
    return { useCase, calls, logs, claims, cbs, claimService };
}

const at = (m: number) => `2026-09-24T10:${String(m).padStart(2, '0')}:00Z`;
const root = (id = 555) => ({ id, body: `Off-by-one in the loop. ${MARKER}`, user: { login: 'kodus-ai[bot]', type: 'Bot' }, created_at: at(0), path: 'src/report.ts' });
const reply = (id: number, body: string, extra: any = {}) => ({ id, in_reply_to_id: 555, body, user: { login: 'dev-one', type: 'User' }, created_at: at(1), path: 'src/report.ts', ...extra });
function ghParams(c: any, opts: any = {}) {
    return { event: opts.event ?? 'pull_request_review_comment', platformType: PlatformType.GITHUB, payload: {
        action: opts.action ?? 'created', repository: { id: opts.repoId ?? 123, name: opts.repoName ?? 'athena', owner: { login: 'acme' }, html_url: `https://${opts.host ?? 'github.com'}/acme/athena` },
        pull_request: { number: 812, head: { ref: 'feat/x' }, base: { ref: 'main', repo: { default_branch: 'main' } } },
        comment: { ...c, updated_at: c.updated_at ?? c.created_at }, sender: { id: 1, login: 'dev-one' } } } as any;
}
const cfg = (g: any, repo?: any, repoId = '123', extraRepos: any[] = []) => ({ id: 'global', name: 'Global', configs: g, isSelected: true,
    repositories: [...(repo ? [{ id: repoId, name: 'athena', configs: repo, isSelected: true, directories: repo.__dirs ?? [] }] : []), ...extraRepos] });

async function run(name: string, env: Env, comment: any = reply(900, 'QA Fixed in abc123.'), opts: any = {}) {
    const b = build({ thread: [root(), comment], ...env });
    let error: any;
    try { await b.useCase.execute(ghParams(comment, opts)); } catch (e: any) { error = e.message; }
    const silence = b.logs.filter((l) => /Unmentioned reply left unanswered/.test(l.message)).map((l) => `${l.level}:${l.md?.implicitReplySilence}`);
    const warns = b.logs.filter((l) => l.level === 'warn' || l.level === 'error').map((l) => `${l.level}:${l.message}${l.error ? ' | ' + l.error : ''}`);
    const counts = Object.fromEntries(Object.entries(b.calls).map(([k, v]) => [k, v.length]));
    const r = { silence, warns, counts, claims: [...b.claims.entries()], error, args: { content: b.calls['provider.getRepositoryContentFile'], params: b.calls['parameters.findOne'], integration: b.calls['integration.lookup'], suggestion: b.calls['suggestion.lookup'], claim: b.calls['claim'] } };
    OUT[name] = r;
    return { ...r, b };
}

const OPT = { kodusConfigFileOverridesWebPreferences: true };
const yml = (s: string) => `version: "1.2"\n${s}`;

describe('qa2576', () => {
    it('M9/M10/M11/M14/M16/M17/M18/M19/M20/M22/M23/M24 gate matrix', async () => {
        await run('M9_no_row', { stored: null });
        await run('M9_empty_configs', { stored: cfg({}) });
        await run('M9_old_record_no_key', { stored: cfg({ reviewCadence: { type: 'manual' } }, { reviewOptions: { bug: true } }) });
        await run('M9_empty_block_under_global_false', { stored: cfg({ conversation: { implicitReplies: false } }, { conversation: {} }) });
        await run('M9_no_service', { stored: cfg({ conversation: { implicitReplies: false } }), noService: true });
        await run('M6_global_false', { stored: cfg({ conversation: { implicitReplies: false } }) });
        await run('M10_repo_false_numeric_payload', { stored: cfg({}, { conversation: { implicitReplies: false } }) });
        await run('M10_other_repo_inherits_global_true', { stored: cfg({}, { conversation: { implicitReplies: false } }) }, reply(901, 'QA Fixed.'), { repoId: 456, repoName: 'ares' });
        await run('M11_global_false_repo_true', { stored: cfg({ conversation: { implicitReplies: false } }, { conversation: { implicitReplies: true } }) });
        await run('M11_other_repo_inherits_global_false', { stored: cfg({ conversation: { implicitReplies: false } }, { conversation: { implicitReplies: true } }) }, reply(902, 'QA x'), { repoId: 456, repoName: 'ares' });
        // file layer
        await run('M12_optin_file_false_stored_true', { stored: cfg({}, { ...OPT }), file: yml('conversation:\n  implicitReplies: false\n') });
        await run('M13_optin_file_true_stored_false', { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: yml('conversation:\n  implicitReplies: true\n') });
        await run('M14_optout_file_false_stored_true', { stored: cfg({}, {}), file: yml('conversation:\n  implicitReplies: false\n') });
        await run('M14_optout_explicit_false_file_false', { stored: cfg({}, { kodusConfigFileOverridesWebPreferences: false }), file: yml('conversation:\n  implicitReplies: false\n') });
        await run('M14_optout_file_true_stored_false', { stored: cfg({}, { conversation: { implicitReplies: false } }), file: yml('conversation:\n  implicitReplies: true\n') });
        await run('M15_global_optin_repo_unset_file_false_stored_true', { stored: cfg({ ...OPT }), file: yml('conversation:\n  implicitReplies: false\n') });
        const pipelinePref = (b: any) => { try { return (b.cbs as any).getFileOverridePreference?.(undefined); } catch (e: any) { return 'err:' + e.message; } };
        OUT.M15_pipeline_getFileOverridePreference_repoUnset = pipelinePref(build({}));
        for (const [k, body] of Object.entries({ missing: null, empty: '', no_conversation_key: yml('reviewOptions:\n  bug: true\n'), empty_block: yml('conversation: {}\n'),
            true: yml('conversation:\n  implicitReplies: true\n'), false: yml('conversation:\n  implicitReplies: false\n'), quoted_false: yml('conversation:\n  implicitReplies: "false"\n'),
            zero: yml('conversation:\n  implicitReplies: 0\n'), null: yml('conversation:\n  implicitReplies: null\n'), no: yml('conversation:\n  implicitReplies: no\n') })) {
            await run(`M16_stored_false_optin_${k}`, { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: body as any });
            await run(`M16_stored_true_optin_${k}`, { stored: cfg({}, { ...OPT }), file: body as any });
        }
        await run('M17_malformed_yaml_stored_false', { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: yml('conversation: [\n  implicitReplies: false\n') });
        await run('M17_malformed_yaml_stored_true', { stored: cfg({}, { ...OPT }), file: yml('conversation: [\n  implicitReplies: false\n') });
        await run('M18_invalid_riskCriteria_file_false_stored_true', { stored: cfg({}, { ...OPT }), file: yml('riskCriteria: 42\nconversation:\n  implicitReplies: false\n') });
        await run('M18_invalid_approvalPolicies_file_false_stored_true', { stored: cfg({}, { ...OPT }), file: yml('approvalPolicies:\n  - nope: 1\nconversation:\n  implicitReplies: false\n') });
        // directory
        const dirs = (v: boolean) => [{ id: 'dir-1', name: 'src', path: '/src', configs: { conversation: { implicitReplies: v } } }];
        await run('M19_repo_false_dir_true_anchor_inside', { stored: cfg({}, { conversation: { implicitReplies: false }, __dirs: dirs(true) }) });
        await run('M19_repo_false_dir_true_anchor_outside', { stored: cfg({}, { conversation: { implicitReplies: false }, __dirs: dirs(true) }) }, reply(903, 'QA x', { path: 'docs/a.md' }));
        await run('M19_repo_true_dir_false_anchor_inside', { stored: cfg({}, { conversation: { implicitReplies: true }, __dirs: dirs(false) }) });
        // default branch / revisions
        let rev = yml('conversation:\n  implicitReplies: false\n');
        const e20 = { stored: cfg({}, { ...OPT }), defaultBranch: 'develop', file: () => rev };
        const b20 = build({ thread: [root(), reply(910, 'QA a')], ...e20 });
        await b20.useCase.execute(ghParams(reply(910, 'QA a')));
        rev = yml('conversation:\n  implicitReplies: true\n');
        b20.claims.clear();
        (b20.useCase as any).codeManagementService.getPullRequestReviewComment = jest.fn(async () => [root(), reply(911, 'QA b')]);
        await b20.useCase.execute(ghParams(reply(911, 'QA b')));
        OUT.M20_develop_branch_two_revisions = { content: b20.calls['provider.getRepositoryContentFile'], silence: b20.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), classify: (b20.calls['llm.classify'] ?? []).length };
        // failures
        await run('M22_stored_read_throws', { stored: new Error('ECONNRESET postgres') });
        await run('M23_file_timeout_stored_false', { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: new Error('ETIMEDOUT') });
        await run('M23_file_429_stored_true', { stored: cfg({}, { ...OPT }), file: Object.assign(new Error('Request failed with status code 429'), { status: 429 }) });
        await run('M23_file_500_stored_false', { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: Object.assign(new Error('Request failed with status code 500'), { status: 500 }) });
        await run('M23_bitbucket_swallowed_null_stored_false', { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: null });
        await run('M24_classifier_throws', { stored: cfg({}), classifyImpl: async () => { throw new Error('model 503'); } });
        await run('M24_classifier_no_verdict', { stored: cfg({}), classifyImpl: async () => undefined });
        await run('M24_classifier_false', { stored: cfg({}), classifyImpl: async () => false });
        await run('M24_explicit_mention_classifier_broken', { stored: cfg({}), classifyImpl: async () => { throw new Error('model 503'); } }, reply(920, '@kody explain this finding'));
        await run('M7_explicit_mention_setting_off', { stored: cfg({ conversation: { implicitReplies: false } }) }, reply(921, '@kody explain this finding'));
    });

    it('M21 free gates before the setting', async () => {
        const off = cfg({ conversation: { implicitReplies: false } });
        const human = (id: number) => ({ id, body: 'question', user: { login: 'someone', type: 'User' }, created_at: at(0) });
        // non-Kody root
        { const r = reply(930, 'QA x'); const b = build({ stored: off, thread: [human(555), r] }); await b.useCase.execute(ghParams(r));
          OUT.M21_non_kody_root = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), findOne: (b.calls['parameters.findOne'] ?? []).length }; }
        // Kody-authored reply
        { const r = { id: 931, in_reply_to_id: 555, body: `answer ${ANSWER}`, user: { login: 'dev-one', type: 'User' }, created_at: at(1) };
          const b = build({ stored: off, thread: [root(), r] }); await b.useCase.execute(ghParams(r));
          OUT.M21_kody_author = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), findOne: (b.calls['parameters.findOne'] ?? []).length }; }
        // bot cap: 5 Kody replies to a bot, then bot again
        { const th: any[] = [root()]; let id = 1000;
          for (let i = 0; i < 5; i++) { th.push({ id: id++, in_reply_to_id: 555, body: 'bot says', user: { login: 'agent[bot]', type: 'Bot' }, created_at: at(2 + i) }); th.push({ id: id++, in_reply_to_id: 555, body: `ok ${ANSWER}`, user: { login: 'x', type: 'User' }, created_at: at(2 + i) }); }
          const r = { id: 1999, in_reply_to_id: 555, body: 'bot again', user: { login: 'agent[bot]', type: 'Bot' }, created_at: at(20) }; th.push(r);
          const b = build({ stored: off, thread: th }); await b.useCase.execute(ghParams(r));
          OUT.M21_bot_cap = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), findOne: (b.calls['parameters.findOne'] ?? []).length }; }
        // thread cap: 10 Kody replies
        { const th: any[] = [root()]; let id = 2000;
          for (let i = 0; i < 10; i++) { th.push({ id: id++, in_reply_to_id: 555, body: 'human q', user: { login: 'dev-one', type: 'User' }, created_at: at(2 + i) }); th.push({ id: id++, in_reply_to_id: 555, body: `a ${ANSWER}`, user: { login: 'x', type: 'User' }, created_at: at(2 + i) }); }
          const r = { id: 2999, in_reply_to_id: 555, body: 'one more', user: { login: 'dev-one', type: 'User' }, created_at: at(30) }; th.push(r);
          const b = build({ stored: off, thread: th }); await b.useCase.execute(ghParams(r));
          OUT.M21_thread_cap = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), findOne: (b.calls['parameters.findOne'] ?? []).length }; }
        // eligible control
        { const r = reply(932, 'QA Fixed'); const b = build({ stored: off, thread: [root(), r] }); await b.useCase.execute(ghParams(r));
          OUT.M21_eligible_control = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), findOne: (b.calls['parameters.findOne'] ?? []).length }; }
    });

    it('M25/M39 duplicate delivery and claim key', async () => {
        const off = cfg({ conversation: { implicitReplies: false } });
        const r = reply(940, 'QA Fixed');
        const b = build({ stored: off, thread: [root(), r] });
        await Promise.all([b.useCase.execute(ghParams(r)), b.useCase.execute(ghParams(r))]);
        const first = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).length, dup: b.logs.filter((l) => /already claimed/.test(l.message)).length, claims: [...b.claims.entries()] };
        // enable, redeliver same version
        (b.useCase as any).codeBaseConfigService = build({ stored: cfg({}) }).cbs;
        classify.mockImplementation(async () => (((b.calls['llm.classify'] ??= []).push([])), true));
        await b.useCase.execute(ghParams(r));
        const afterEnable = { silence: b.logs.filter((l) => /left unanswered/.test(l.message)).length, dup: b.logs.filter((l) => /already claimed/.test(l.message)).length, classify: (b.calls['llm.classify'] ?? []).length };
        // new reply has its own key
        const r2 = reply(941, 'QA new');
        (b.useCase as any).codeManagementService.getPullRequestReviewComment = jest.fn(async () => [root(), r2]);
        await b.useCase.execute(ghParams(r2));
        OUT.M25_double_delivery = { first, afterEnable, newReply: { classify: (b.calls['llm.classify'] ?? []).length, claims: [...b.claims.entries()] } };
        OUT.M39_claim_keys = b.calls['claim'];
        OUT.M39_suggestion_lookup = b.calls['suggestion.lookup'];
        OUT.M39_integration_lookup = b.calls['integration.lookup'];
    });

    it('M27 handler routing created/edited/deleted (isNewThreadReply)', () => {
        const gh = (action: string) => ({ action, comment: { id: 1, in_reply_to_id: 2 } });
        const gl = (action?: string) => ({ object_attributes: { action, type: 'DiffNote' } });
        const az = (edited: boolean) => ({ resource: { comment: { parentCommentId: 1, publishedDate: 'a', lastContentUpdatedDate: edited ? 'b' : 'a' } } });
        OUT.M27_isNewThreadReply = {
            github_created: isNewThreadReply(PlatformType.GITHUB, 'pull_request_review_comment', gh('created')),
            github_edited: isNewThreadReply(PlatformType.GITHUB, 'pull_request_review_comment', gh('edited')),
            github_deleted: isNewThreadReply(PlatformType.GITHUB, 'pull_request_review_comment', gh('deleted')),
            gitlab_create: isNewThreadReply(PlatformType.GITLAB, 'note', gl('create')),
            gitlab_update: isNewThreadReply(PlatformType.GITLAB, 'note', gl('update')),
            azure_new: isNewThreadReply(PlatformType.AZURE_REPOS, 'ms.vss-code.git-pullrequest-comment-event', az(false)),
            azure_edited: isNewThreadReply(PlatformType.AZURE_REPOS, 'ms.vss-code.git-pullrequest-comment-event', az(true)),
            bitbucket_parented: isNewThreadReply(PlatformType.BITBUCKET, 'pullrequest:comment_created', { comment: { parent: { id: 1 } } }),
            bitbucket_updated_parented: isNewThreadReply(PlatformType.BITBUCKET, 'pullrequest:comment_updated', { comment: { parent: { id: 1 } } }),
        };
    });

    it('M29 getRepository on native payload shapes', () => {
        const { useCase } = build({});
        const g = (p: any) => { try { return (useCase as any).getRepository(p); } catch (e: any) { return 'err:' + e.message; } };
        OUT.M29 = {
            github_numeric: g({ platformType: PlatformType.GITHUB, payload: { repository: { id: 1468015189, name: 'codex-athena', owner: { login: 'kodus-olimpo' } } } }),
            gitlab_numeric: g({ platformType: PlatformType.GITLAB, payload: { project: { id: 89319210, name: 'codex-athena', path_with_namespace: '<agent-login>/codex-athena', namespace: 'Junior' } } }),
            bitbucket_braced_uuid: g({ platformType: PlatformType.BITBUCKET, payload: { repository: { uuid: '{d7ecce61-5e9d-4e3d-b60a-67a295687125}', name: 'codex-athena', workspace: { slug: 'kodustech' } } } }),
            azure_guid: g({ platformType: PlatformType.AZURE_REPOS, payload: { resource: { pullRequest: { repository: { id: '32c159b2-ac16-419b-9445-8ab275cabadc', name: 'codex-athena' } } }, resourceContainers: { project: { id: 'p' } } } }),
            forgejo_numeric: g({ platformType: PlatformType.FORGEJO, payload: { repository: { id: 2929820, full_name: 'kodus/codex-athena', owner: { login: 'kodus' } } } }),
            github_null_id: g({ platformType: PlatformType.GITHUB, payload: { repository: { id: null, name: 'x' } } }),
            github_missing_id: g({ platformType: PlatformType.GITHUB, payload: { repository: { name: 'x' } } }),
        };
        // direct getSimpleConfig with numeric vs string id against a string-keyed row
        return Promise.all([
            build({ stored: cfg({}, { conversation: { implicitReplies: false } }) }).cbs.getSimpleConfig({ organizationId: ORG, teamId: TEAM }, { repositoryId: 123 as any }),
            build({ stored: cfg({}, { conversation: { implicitReplies: false } }) }).cbs.getSimpleConfig({ organizationId: ORG, teamId: TEAM }, { repositoryId: '123' }),
        ]).then(([n, s]) => { OUT.M10_getSimpleConfig_numeric_vs_string = { numeric: (n as any).conversation, string: (s as any).conversation }; });
    });

    it('M30 sibling routes with setting off', async () => {
        const off = cfg({ conversation: { implicitReplies: false } });
        const cases: Record<string, any> = {
            inline_mention: ghParams(reply(950, '@kody why?')),
            general_mention: { event: 'issue_comment', platformType: PlatformType.GITHUB, payload: { action: 'created', repository: { id: 123, name: 'athena', owner: { login: 'acme' } }, issue: { number: 812, pull_request: { url: 'https://api.github.com/repos/acme/athena/pulls/812' } }, comment: { id: 951, body: '@kody summarize the risk', user: { login: 'dev-one' }, created_at: at(5), updated_at: at(5) }, sender: { id: 1, login: 'dev-one' } } },
            general_unmentioned: { event: 'issue_comment', platformType: PlatformType.GITHUB, payload: { action: 'created', repository: { id: 123, name: 'athena', owner: { login: 'acme' } }, issue: { number: 812, pull_request: { url: 'https://api.github.com/repos/acme/athena/pulls/812' } }, comment: { id: 952, body: 'LGTM, merging soon', user: { login: 'dev-one' }, created_at: at(5), updated_at: at(5) }, sender: { id: 1, login: 'dev-one' } } },
            start_review: { event: 'issue_comment', platformType: PlatformType.GITHUB, payload: { action: 'created', repository: { id: 123, name: 'athena', owner: { login: 'acme' } }, issue: { number: 812, pull_request: {} }, comment: { id: 953, body: '@kody start-review', user: { login: 'dev-one' }, created_at: at(5), updated_at: at(5) }, sender: { id: 1, login: 'dev-one' } } },
            business_logic: { event: 'issue_comment', platformType: PlatformType.GITHUB, payload: { action: 'created', repository: { id: 123, name: 'athena', owner: { login: 'acme' } }, issue: { number: 812, pull_request: {} }, comment: { id: 954, body: '@kody -v business-logic', user: { login: 'dev-one' }, created_at: at(5), updated_at: at(5) }, sender: { id: 1, login: 'dev-one' } } },
        };
        for (const [k, p] of Object.entries(cases)) {
            const c = p.payload.comment;
            const b = build({ stored: off, thread: [root(), { ...c, in_reply_to_id: p.event === 'issue_comment' ? undefined : 555 }] });
            let err; try { await b.useCase.execute(p); } catch (e: any) { err = e.message; }
            OUT['M30_' + k] = { commandType: (b.useCase as any).detectCommandType ? (() => { try { (b.useCase as any).commandManager = new ((require('./commands/command-manager') as any).CommandManager ?? Object)(); } catch {} return undefined; })() : undefined,
                silence: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => l.md?.implicitReplySilence), counts: Object.fromEntries(Object.entries(b.calls).map(([x, v]) => [x, v.length])), msgs: b.logs.map((l) => l.message).filter((m) => !/Receiving|Extracted|PR description/.test(m)).slice(0, 6), err };
        }
    });

    it('M38 tenant isolation, same repo id on two hosts', async () => {
        const storedByTeam = { [TEAM]: cfg({ conversation: { implicitReplies: false } }), [TEAM_B]: cfg({ conversation: { implicitReplies: true } }) };
        const contexts = { 'ghe-a.example.com': { organizationId: ORG, teamId: TEAM }, 'ghe-b.example.com': { organizationId: ORG_B, teamId: TEAM_B } };
        const b = build({ storedByTeam, contexts, thread: [root(), reply(960, 'QA a')] });
        const ra = reply(960, 'QA a'); const rb = reply(961, 'QA b');
        (b.useCase as any).codeManagementService.getPullRequestReviewComment = jest.fn(async () => [root(), ra, rb]);
        await Promise.all([b.useCase.execute(ghParams(ra, { host: 'ghe-a.example.com' })), b.useCase.execute(ghParams(rb, { host: 'ghe-b.example.com' }))]);
        OUT.M38_two_tenants = { findOneTeams: b.calls['parameters.findOne'], silences: b.logs.filter((l) => /left unanswered/.test(l.message)).map((l) => ({ reason: l.md?.implicitReplySilence, org: l.md?.org, commentId: l.md?.commentId })), classify: (b.calls['llm.classify'] ?? []).length };
    });
});
