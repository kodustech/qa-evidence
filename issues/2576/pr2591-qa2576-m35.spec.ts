// QA #2576 M35: centralized-config sync writes through the real UpdateOrCreateCodeReviewParameterUseCase (actor.source='sync');
// the conversation gate then reads the stored row through the real CodeBaseConfigService.getSimpleConfig.
import * as fs from 'fs';
import { UpdateOrCreateCodeReviewParameterUseCase } from '../update-or-create-code-review-parameter-use-case';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';

const OUT: any = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(OUT, null, 1)));

it('M35 sync then removal', async () => {
    let stored: any = { id: 'global', name: 'Global', isSelected: true, configs: {}, repositories: [
        { id: 'r1', name: 'athena', isSelected: true, configs: {}, directories: [] },
        { id: 'r2', name: 'ares', isSelected: true, configs: {}, directories: [] }] };
    const saves: any[] = [];
    const save = jest.fn(async (...a: any[]) => { const v = a.find((x) => x && typeof x === 'object' && 'repositories' in x); if (v) stored = JSON.parse(JSON.stringify(v)); saves.push(a.map((x) => (typeof x === 'object' ? '[obj]' : x))); return true; });
    const useCase = new UpdateOrCreateCodeReviewParameterUseCase(
        { findByKey: jest.fn(async () => ({ configValue: JSON.parse(JSON.stringify(stored)) })) } as any,
        { execute: save } as any,
        { findIntegrationConfigFormatted: async () => [{ id: 'r1', name: 'athena', directories: [] }, { id: 'r2', name: 'ares', directories: [] }] } as any,
        { emit: jest.fn() } as any,
        { ensure: jest.fn() } as any,
        { detectAndSaveReferences: jest.fn() } as any,
        { buildConfigKey: () => 'key' } as any,
        { getCentralizedRepositoryIfEnabled: jest.fn(async () => null), getScopedKodusConfigFileContent: jest.fn(async () => null), createMutationPullRequestIfEnabled: jest.fn(), buildCentralizedPath: (p: any) => p } as any,
        { find: async () => [] } as any,
        { getBYOKConfig: jest.fn(), getSubscriptionStatus: jest.fn() } as any,
        { execute: jest.fn() } as any,
        { validateOrganizationLicense: async () => ({ valid: true, subscriptionStatus: 'active', planType: 'teams_byok' }) } as any,
        { codeReviewSettingsUpdated: jest.fn() } as any,
        { getTypeIntegration: jest.fn(async () => PlatformType.GITHUB) } as any,
    );
    const sync = (configValue: object, repositoryId?: string) => useCase.execute({ organizationAndTeamData: { organizationId: 'org', teamId: 'team' }, configValue, repositoryId,
        actor: { source: 'sync', organizationId: 'org', userEmail: 'sync', userId: 'sync' }, skipAuthorization: true } as any);
    const cbs = new CodeBaseConfigService({} as any, {} as any, {} as any, { findOne: async () => ({ configValue: JSON.parse(JSON.stringify(stored)) }) } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const gate = async (rid: string) => ((await cbs.getSimpleConfig({ organizationId: 'org', teamId: 'team' }, { repositoryId: rid })) as any).conversation;
    const snap = async (label: string) => { OUT[label] = { global: stored.configs?.conversation, r1: stored.repositories.find((r: any) => r.id === 'r1')?.configs?.conversation, r2: stored.repositories.find((r: any) => r.id === 'r2')?.configs?.conversation, gate_r1: await gate('r1'), gate_r2: await gate('r2') }; };
    let err: any;
    try {
        await sync({ conversation: { implicitReplies: false } });
        await sync({ conversation: { implicitReplies: true }, reviewOptions: { bug: true } }, 'r1');
        await snap('after_sync_root_false_repo_true');
        await sync({ reviewOptions: { bug: true } }, 'r1');
        await snap('after_repo_key_removed');
        await sync({ conversation: { implicitReplies: 'false' } }, 'r2');
        await snap('after_sync_string_false_r2');
    } catch (e: any) { err = e.message + ' | cause: ' + (e.cause?.message ?? '') + ' | ' + String(e.cause?.stack ?? e.stack).split('\n').slice(0,6).join(' << '); }
    OUT.error = err; OUT.saves = saves.length;
});
