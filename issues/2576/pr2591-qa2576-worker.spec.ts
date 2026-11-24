// QA #2576 M28 worker: one OS process = one delivery of the same comment version, handled by the real
// ChatWithKodyFromGitUseCase + real MessageClaimService + real InboxMessageRepository on a disposable Postgres,
// real CodeBaseConfigService. Only provider HTTP / LLM / agent / sandbox are stubbed. ROLE=victim blocks inside
// the kodus-config.yml read so the orchestrator can SIGKILL it there.
jest.mock('@libs/common/utils/thread-id', () => ({ createThreadId: jest.fn(() => ({ id: 'TR', metadata: {} })) }));
jest.mock('./implicit-reply', () => ({ ...jest.requireActual('./implicit-reply'), classifyReplyAddressedToKody: jest.fn(async () => { emit('classifier-called'); return true; }) }));
jest.setTimeout(30 * 60 * 1000);

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { InboxMessageModel } from '@libs/core/workflow/infrastructure/repositories/schemas/inbox-message.model';
import { WorkflowJobModel } from '@libs/core/workflow/infrastructure/repositories/schemas/workflow-job.model';
import { OutboxMessageModel } from '@libs/core/workflow/infrastructure/repositories/schemas/outbox-message.model';
import { InboxMessageRepository } from '@libs/core/workflow/infrastructure/repositories/inbox-message.repository';
import { MessageClaimService } from '@libs/core/workflow/infrastructure/message-claim.service';
import { ChatWithKodyFromGitUseCase } from './chatWithKodyFromGit.use-case';

function emit(event: string, extra: any = {}) {
    process.stdout.write(`QAEVT ${JSON.stringify({ t: new Date().toISOString(), pid: process.pid, role: process.env.ROLE, event, ...extra })}\n`);
}

it('worker', async () => {
    const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 55476, username: 'postgres', password: 'qa2576', database: 'qa', entities: [InboxMessageModel, WorkflowJobModel, OutboxMessageModel], synchronize: process.env.ROLE === 'init' });
    await ds.initialize();
    emit('db-ready');
    if (process.env.ROLE === 'init') { await ds.destroy(); return; }
    const claimService = new MessageClaimService(new InboxMessageRepository(ds.getRepository(InboxMessageModel)));
    const stored = { id: 'global', name: 'Global', configs: { conversation: { implicitReplies: true } }, repositories: [{ id: '123', name: 'athena', configs: { kodusConfigFileOverridesWebPreferences: true }, directories: [] }] };
    const cfgCode = {
        getTypeIntegration: async () => 'GITHUB',
        getDefaultBranch: async () => 'main',
        getRepositoryContentFile: async () => {
            emit('file-read-start');
            if (process.env.ROLE === 'victim') await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
            emit('file-read-end');
            return { data: { content: Buffer.from('version: "1.2"\nconversation:\n  implicitReplies: false\n').toString('base64'), encoding: 'base64' } };
        },
    };
    const cbs = new CodeBaseConfigService({} as any, {} as any, {} as any, { findOne: async () => ({ configValue: stored }) } as any, {} as any, {} as any, cfgCode as any, {} as any, {} as any, {} as any);
    const MARKER = '<!-- kody-codereview -->';
    const root = { id: 555, body: `Off-by-one. ${MARKER}`, user: { login: 'kodus-ai[bot]', type: 'Bot' }, created_at: '2026-11-24T10:00:00Z' };
    const reply = { id: 900, in_reply_to_id: 555, body: 'Fixed in abc123.', user: { login: 'dev-one', type: 'User' }, created_at: '2026-11-24T10:01:00Z', updated_at: '2026-11-24T10:01:00Z' };
    const codeManagement = {
        findTeamAndOrganizationIdByConfigKey: async () => ({ integration: { organization: { uuid: '11111111-1111-4111-8111-111111111111' } }, team: { uuid: '22222222-2222-4222-8222-222222222222' } }),
        getPullRequestReviewComment: async () => [root, reply],
        addReactionToComment: async () => emit('provider-reaction'),
        removeReactionsFromComment: async () => undefined,
        createResponseToComment: async () => (emit('provider-answer'), { id: 1 }),
        updateResponseToComment: async () => ({}),
        getCloneParams: async () => undefined,
    };
    const useCase: any = new (ChatWithKodyFromGitUseCase as any)(codeManagement, { execute: async () => (emit('agent-called'), 'a') }, { execute: async () => undefined },
        { validateExecutionPermissions: async () => (emit('permission-called'), { allowed: true }), resolveTaskSlot: async () => undefined },
        { acquire: async () => (emit('sandbox-acquire'), { sandbox: { type: 'null' }, leaseId: 'l' }), release: async () => undefined },
        { findByNumberAndRepositoryId: async () => null }, claimService, undefined, undefined, undefined, cbs);
    for (const lvl of ['log', 'warn', 'error']) useCase.logger[lvl] = (o: any) => emit('log', { level: lvl, message: o?.message, reason: o?.metadata?.implicitReplySilence, key: o?.metadata?.deliveryKey });
    emit('execute-start');
    await useCase.execute({ event: 'pull_request_review_comment', platformType: PlatformType.GITHUB, payload: { action: 'created', repository: { id: 123, name: 'athena', owner: { login: 'acme' }, html_url: 'https://github.com/acme/athena' }, pull_request: { number: 812, head: { ref: 'f' }, base: { ref: 'main' } }, comment: reply, sender: { id: 1, login: 'dev-one' } } });
    emit('execute-end');
    const rows = await ds.query(`select "messageId","status","lockedBy","lockedAt","attempts","processedAt" from kodus_workflow.inbox_messages`);
    emit('rows', { rows });
    await ds.destroy();
});
