// QA #2576 retest R9 (M35): real CentralizedConfigService.synchronizeConfigs -> real CodeBaseConfigService.getKodusConfigFile (YAML)
// -> real UpdateOrCreateCodeReviewParameterUseCase (in-memory parameters row, actor sync) -> real getSimpleConfig (gate read).
// Stubbed: parameters storage, provider file reads, integration repo list, PR-messages persistence, license.
import * as fs from 'fs';
import { CentralizedConfigService } from '@libs/centralized-config/infrastructure/adapters/services/centralized-config.service';
import { UpdateOrCreateCodeReviewParameterUseCase } from '@libs/code-review/application/use-cases/configuration/update-or-create-code-review-parameter-use-case';
import CodeBaseConfigService from '@libs/ee/codeBase/codeBaseConfig.service';
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';

const OUT: any = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT!, JSON.stringify(OUT, null, 1)));
const ORGT = { organizationId: 'org', teamId: 'team' };
const yml = (s: string) => `version: "1.2"\n${s}`;
const Q = yml('conversation:\n  implicitReplies: "false"\nreviewOptions:\n  bug: true\n');
const OMIT = yml('reviewOptions:\n  bug: true\n');
const OFF = yml('conversation: "off"\nreviewOptions:\n  bug: true\n');
const clone = (x: any) => JSON.parse(JSON.stringify(x));

function world(initial: any, files: Record<string, string | Error>) {
    let stored = clone(initial);
    const writes: any[] = [];
    const save = jest.fn(async (...a: any[]) => { const v = a.find((x) => x && typeof x === 'object' && 'repositories' in x); if (v) stored = clone(v); return true; });
    const repos = [{ id: 'r1', name: 'athena', directories: [] }, { id: 'r2', name: 'ares', directories: [] }];
    const params = { findByKey: jest.fn(async (key: string) => key === 'centralized_config' ? { configValue: { repository: { id: 'cfg', name: 'kodus-config' } } } : { configValue: clone(stored) }) };
    const useCase = new UpdateOrCreateCodeReviewParameterUseCase(
        params as any, { execute: save } as any,
        { findIntegrationConfigFormatted: async () => repos } as any,
        { emit: jest.fn() } as any, { ensure: jest.fn() } as any, { detectAndSaveReferences: jest.fn() } as any, { buildConfigKey: () => 'key' } as any,
        { getCentralizedRepositoryIfEnabled: jest.fn(async () => null), getScopedKodusConfigFileContent: jest.fn(async () => null), createMutationPullRequestIfEnabled: jest.fn(), buildCentralizedPath: (p: any) => p } as any,
        { find: async () => [] } as any, { getBYOKConfig: jest.fn(), getSubscriptionStatus: jest.fn() } as any, { execute: jest.fn() } as any,
        { validateOrganizationLicense: async () => ({ valid: true, subscriptionStatus: 'active', planType: 'teams_byok' }) } as any,
        { codeReviewSettingsUpdated: jest.fn() } as any, { getTypeIntegration: jest.fn(async () => PlatformType.GITHUB) } as any,
    );
    const realExec = useCase.execute.bind(useCase);
    (useCase as any).execute = async (body: any) => { const rec: any = { repositoryId: body.repositoryId, directoryPaths: body.directoryPaths, directoryPath: body.directoryPath, conversationSent: body.configValue?.conversation === undefined ? '<absent>' : clone(body.configValue.conversation) }; writes.push(rec); try { return await realExec(body); } catch (e: any) { rec.error = e.message; throw e; } };
    const reads: string[] = [];
    const cm = {
        getTypeIntegration: async () => 'GITHUB', getDefaultBranch: async () => 'main',
        getRepositoryContentFile: async (p: any) => { const f = p.file.filename; reads.push(f); const v = files[f]; if (v instanceof Error) throw v; if (v == null) return null; return { data: { content: Buffer.from(v).toString('base64'), encoding: 'base64' } }; },
    };
    const cbs = new CodeBaseConfigService({} as any, {} as any, {} as any, { findOne: async () => ({ configValue: clone(stored) }) } as any, {} as any, {} as any, cm as any, {} as any, {} as any, {} as any);
    const warns: any[] = [];
    (cbs as any).logger.warn = (o: any) => warns.push({ message: o?.message, valueType: o?.metadata?.valueType });
    const svc = new CentralizedConfigService(params as any, { findIntegrationConfigFormatted: async () => repos } as any, {} as any, useCase as any, {} as any, {} as any,
        { execute: jest.fn(async () => undefined) } as any, { findOne: jest.fn(async () => null), find: jest.fn(async () => []), deleteByFilter: jest.fn(async () => undefined) } as any,
        cbs as any, {} as any, {} as any, {} as any, {} as any);
    const svcLogs: any[] = [];
    for (const l of ['warn', 'error']) (svc as any).logger[l] = (o: any) => svcLogs.push({ level: l, message: o?.message, err: o?.error?.message });
    const gate = async (rid?: string, dir?: string) => { try { return ((await cbs.getSimpleConfig(ORGT as any, rid ? { repositoryId: rid, ...(dir ? { directoryId: dir } : {}) } as any : undefined as any)) as any).conversation; } catch (e: any) { return 'err:' + e.message; } };
    return { svc, get stored() { return stored; }, writes, reads, warns, svcLogs, gate };
}
const row = (g: any, r1: any = {}, r2: any = {}, r1dirs: any[] = []) => ({ id: 'global', name: 'Global', isSelected: true, configs: g,
    repositories: [{ id: 'r1', name: 'athena', isSelected: true, configs: r1, directories: r1dirs }, { id: 'r2', name: 'ares', isSelected: true, configs: r2, directories: [] }] });
const conv = (s: any) => ({ global: s.configs?.conversation ?? '<absent>', r1: s.repositories.find((r: any) => r.id === 'r1')?.configs?.conversation ?? '<absent>', r2: s.repositories.find((r: any) => r.id === 'r2')?.configs?.conversation ?? '<absent>',
    r1dirs: (s.repositories.find((r: any) => r.id === 'r1')?.directories ?? []).map((d: any) => ({ id: d.id, paths: (d.folders ?? []).map((f: any) => f.path), conversation: d.configs?.conversation ?? '<absent>', reviewOptionsBug: d.configs?.reviewOptions?.bug })) });
const anyString = (s: any) => /"implicitReplies":"/.test(JSON.stringify(s)) || /"conversation":"/.test(JSON.stringify(s));

async function scenario(name: string, initial: any, files: Record<string, string | Error>, metas: any[], gates: Array<[string | undefined, string?]> = [['r1']]) {
    const w = world(initial, files);
    let res: any, err: any;
    try { res = await w.svc.synchronizeConfigs({ organizationAndTeamData: ORGT as any, configFiles: metas, actor: { organizationId: 'org', source: 'sync', userEmail: 'sync', userId: 'sync' } }); } catch (e: any) { err = e.message; }
    const g: any = {}; for (const [rid, dir] of gates) g[`${rid ?? 'global'}${dir ? '/' + dir : ''}`] = await w.gate(rid, dir);
    OUT[name] = { result: res, err, before: conv(initial), after: conv(w.stored), stringStored: anyString(w.stored), writes: w.writes, reads: w.reads, loaderWarns: w.warns.filter((x) => /implicitReplies/.test(x.message || '')), syncLogs: w.svcLogs, gate: g };
}

const dir = (id: string, paths: string[], v?: boolean) => ({ id, name: id, path: paths[0], isSelected: true, folders: paths.map((p) => ({ path: p })), configs: v === undefined ? {} : { conversation: { implicitReplies: v } } });

it('R9 sync matrix', async () => {
    await scenario('a_root_quoted_stored_global_false', row({ conversation: { implicitReplies: false } }), { 'kodus-config.yml': Q }, [{}], [[undefined], ['r1']]);
    await scenario('b_repo_quoted_stored_repo_false', row({}, { conversation: { implicitReplies: false } }), { 'athena/kodus-config.yml': Q }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }]);
    await scenario('c_repo_quoted_no_repo_key_global_false', row({ conversation: { implicitReplies: false } }), { 'athena/kodus-config.yml': Q }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }]);
    await scenario('d_repo_omits_key_stored_repo_true', row({ conversation: { implicitReplies: false } }, { conversation: { implicitReplies: true } }), { 'athena/kodus-config.yml': OMIT }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }]);
    await scenario('e_two_files_first_rejected_second_omits', row({}, { conversation: { implicitReplies: false } }, { conversation: { implicitReplies: false } }), { 'athena/kodus-config.yml': Q, 'ares/kodus-config.yml': OMIT },
        [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }, { repositoryId: 'r2', centralizedDirectoryPath: 'ares' }], [['r1'], ['r2']]);
    const groups = [dir('g1', ['/src', '/lib'], false)];
    await scenario('f1_dir_quoted_equal_paths', row({}, {}, {}, groups), { 'athena/src/kodus-config.yml': Q }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena/src', directoryPaths: ['/lib', '/src'] }], [['r1'], ['r1', 'g1']]);
    await scenario('f2_dir_quoted_superset_paths', row({}, {}, {}, groups), { 'athena/src/kodus-config.yml': Q }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena/src', directoryPaths: ['/src', '/lib', '/docs'] }], [['r1'], ['r1', 'g1']]);
    await scenario('f3_dir_quoted_overlapping_paths', row({}, {}, {}, [dir('g1', ['/src', '/lib'], false), dir('g2', ['/src', '/other'])]), { 'athena/src/kodus-config.yml': Q }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena/src', directoryPaths: ['/src', '/other'] }], [['r1'], ['r1', 'g1'], ['r1', 'g2']]);
    await scenario('g_loader_throws_one_file', row({}, { conversation: { implicitReplies: false } }, { conversation: { implicitReplies: false } }), { 'athena/kodus-config.yml': new Error('provider 500'), 'ares/kodus-config.yml': Q },
        [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }, { repositoryId: 'r2', centralizedDirectoryPath: 'ares' }], [['r1'], ['r2']]);
    await scenario('h_repo_conversation_off_stored_repo_false', row({}, { conversation: { implicitReplies: false } }), { 'athena/kodus-config.yml': OFF }, [{ repositoryId: 'r1', centralizedDirectoryPath: 'athena' }]);
});
