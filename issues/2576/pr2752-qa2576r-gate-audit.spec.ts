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

// R6: capture the CodeBaseConfigService loader WARN (metadata valueType) next to the gate outcome.
async function runR6(name: string, env: Env) {
    const comment = reply(900, 'QA Fixed in abc123.');
    const b = build({ thread: [root(), comment], ...env });
    const cbsLogs: any[] = [];
    for (const lvl of ['warn', 'error']) {
        (b.cbs as any).logger[lvl] = (o: any) => cbsLogs.push({ level: lvl, message: o?.message, md: o?.metadata ? { valueType: o.metadata.valueType, org: o.metadata.organizationAndTeamData?.organizationId, repo: o.metadata.repository?.id, keys: Object.keys(o.metadata) } : undefined, raw: JSON.stringify(o) });
    }
    let error: any;
    try { await b.useCase.execute(ghParams(comment)); } catch (e: any) { error = e.message; }
    const silence = b.logs.filter((l) => /Unmentioned reply left unanswered/.test(l.message)).map((l) => `${l.level}:${l.md?.implicitReplySilence}`);
    OUT[name] = { outcome: silence.length ? `silenced:${silence.join(',')}` : (b.calls['llm.classify'] ? 'classifier' : 'other'), classify: (b.calls['llm.classify'] ?? []).length, fileReads: (b.calls['provider.getRepositoryContentFile'] ?? []).length, loaderWarns: cbsLogs.filter((l) => /implicitReplies/.test(l.message || '')).map((l) => ({ level: l.level, message: l.message, md: l.md, rawHasCanary: /qa2576-canary/.test(l.raw) })), otherCbsWarns: cbsLogs.filter((l) => !/implicitReplies/.test(l.message || '')).map((l) => l.message), error };
}

describe('qa2576 retest R6', () => {
    it('gate matrix: non-boolean file values vs stored', async () => {
        const files: Record<string, string> = {
            quoted_false: yml('conversation:\n  implicitReplies: "false"\n'),
            canary_string: yml('conversation:\n  implicitReplies: "qa2576-canary-x1"\n'),
            yaml_no: yml('conversation:\n  implicitReplies: no\n'),
            yaml_off: yml('conversation:\n  implicitReplies: off\n'),
            zero: yml('conversation:\n  implicitReplies: 0\n'),
            null: yml('conversation:\n  implicitReplies: null\n'),
            empty_key: yml('conversation:\n  implicitReplies:\n'),
            array_false: yml('conversation:\n  implicitReplies: [false]\n'),
            conversation_off: yml('conversation: "off"\n'),
            conversation_null: yml('conversation: null\n'),
            true: yml('conversation:\n  implicitReplies: true\n'),
            false: yml('conversation:\n  implicitReplies: false\n'),
            missing_key: yml('reviewOptions:\n  bug: true\n'),
            empty_block: yml('conversation: {}\n'),
            a_quoted_true: yml('conversation:\n  implicitReplies: "true"\n'),
            a_yaml_yes: yml('conversation:\n  implicitReplies: yes\n'),
            a_yaml_on: yml('conversation:\n  implicitReplies: on\n'),
            a_one: yml('conversation:\n  implicitReplies: 1\n'),
            a_nested_object: yml('conversation:\n  implicitReplies:\n    value: false\n'),
            a_conversation_array: yml('conversation: []\n'),
            a_conversation_false: yml('conversation: false\n'),
            a_sibling_invalid: yml('conversation:\n  implicitReplies: "false"\n  other: x\n'),
            a_sibling_valid: yml('conversation:\n  implicitReplies: false\n  other: x\n'),
        };
        for (const [k, body] of Object.entries(files)) {
            await runR6(`stored_false__${k}`, { stored: cfg({}, { ...OPT, conversation: { implicitReplies: false } }), file: body });
            await runR6(`stored_true__${k}`, { stored: cfg({}, { ...OPT, conversation: { implicitReplies: true } }), file: body });
        }
    });
    it('loader keeps the rest of the file', async () => {
        const b = build({ stored: cfg({}, { ...OPT }) });
        const res: any = {};
        for (const [k, body] of Object.entries({
            quoted_with_siblings: yml('reviewOptions:\n  bug: false\n  security: true\nconversation:\n  implicitReplies: "false"\nrunOnDraft: false\n'),
            nonobject_with_siblings: yml('reviewOptions:\n  bug: false\nconversation: "off"\nrunOnDraft: false\n'),
            valid_with_siblings: yml('reviewOptions:\n  bug: false\nconversation:\n  implicitReplies: false\nrunOnDraft: false\n'),
        })) {
            (b.cbs as any).logger.warn = () => undefined;
            const env: any = { file: body };
            (b as any).cbs.codeManagementService.getRepositoryContentFile = async () => ({ data: { content: Buffer.from(env.file).toString('base64'), encoding: 'base64' } });
            let rejected = 0;
            const file: any = await (b.cbs as any).getKodusConfigFile({ organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, repository: { id: '123', name: 'athena' }, overridesWebPreferences: true, onRejectedImplicitReplies: () => rejected++ });
            res[k] = { rejected, conversation: file?.conversation, reviewOptions: file?.reviewOptions, runOnDraft: file?.runOnDraft, keys: Object.keys(file || {}).sort() };
        }
        OUT.loader_rest_of_file = res;
    });
});
