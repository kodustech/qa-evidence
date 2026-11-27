// QA #2639 retest harness (PR #2750). Real SimpleLogger + real deepSanitize +
// real MongoDBExporter, only collections.logs.insertMany faked. The producers
// are the real KodyLearningCronProvider (+ real GenerateKodyRulesUseCase for
// the QA failure) and the real SaveCodeReviewFeedbackUseCase with a real
// ReactionSyncAbortedError. Identical file runs at merge and first parent.
jest.mock('@libs/core/log/logger', () => jest.requireActual('@libs/core/log/logger'));

import * as fs from 'fs';
import { addLogProcessor, createLogger, removeLogProcessor } from '@libs/core/log/logger';
import { MongoDBExporter } from '@libs/core/observability/exporters/mongodb-exporter';
import { KodyLearningCronProvider } from '../kodyLearning.cron';
import { MAX_STUCK_RETRIES } from '../kody-learning-staleness';
import { GenerateKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/generate-kody-rules.use-case';
import { SaveCodeReviewFeedbackUseCase } from '@libs/code-review/application/use-cases/codeReviewFeedback/save-feedback.use-case';
import { ReactionSyncAbortedError } from '@libs/code-review/domain/codeReviewFeedback/errors/reaction-sync-aborted.error';
import { ParametersKey } from '@libs/core/domain/enums/parameters-key.enum';
import { KodyLearningStatus } from '@libs/organization/domain/parameters/types/configValue.type';

const OUT = process.env.QA2639_OUT || '/tmp/qa2639r-out.json';
const results: Record<string, any> = {};
const O1 = 'qa2639r-org-1', T1 = 'qa2639r-team-1';
const O2 = 'qa2639r-org-2', T2 = 'qa2639r-team-2';

const proj = (r: any) => ({
    message: r.message,
    component: r.component,
    level: r.level,
    org: r.metadata?.organizationId,
    team: r.metadata?.teamId,
    metaTenant: r.metadata?.tenantId,
    tenant: r.tenantId,
    attrParams: r.attributes?.params,
    attrPayload: r.attributes?.payload,
    attrOrg: r.attributes?.organizationId,
    errorName: r.error?.name,
    errorMessage: r.error?.message,
});

async function withExporter(fn: () => Promise<void>) {
    const inserts: any[] = [];
    const exporter = new MongoDBExporter({
        batchSize: 500,
        flushIntervalMs: 60_000,
        bucketKeys: ['organizationId', 'teamId', 'tenantId'],
    } as any);
    (exporter as any).collections = {
        logs: { insertMany: jest.fn(async (docs: any[]) => { inserts.push(...docs); return { insertedCount: docs.length }; }) },
        telemetry: { insertMany: jest.fn(async () => ({})) },
    };
    addLogProcessor(exporter as any);
    try {
        await fn();
        await exporter.flush();
    } finally {
        removeLogProcessor(exporter as any);
    }
    return inserts;
}

const lock = { release: jest.fn(async () => undefined) };
const team = { uuid: T1, organization: { uuid: O1 } };

function realGenerateUseCase(parametersService: any) {
    // Same collaborators as generate-kody-rules.use-case.spec.ts "throws (not
    // 200, 0 rules) when PR fetch fails": PR listing returns null, as on QA.
    return new GenerateKodyRulesUseCase(
        {} as any,
        {} as any,
        parametersService,
        { execute: jest.fn(async () => undefined) } as any,
        { getPullRequestsByRepository: jest.fn(async () => null) } as any,
        { processComments: jest.fn(), generateKodyRules: jest.fn() } as any,
        { resolve: jest.fn(async () => ({ execute: jest.fn(async () => []) })) } as any,
        { execute: jest.fn() } as any,
        { getSimpleConfig: jest.fn(async () => ({ kodyKnowledgeApproval: { enabled: true } })) } as any,
        {
            resolveTaskSlot: jest.fn(async () => ({ provider: 'anthropic', model: 'test-model' })),
            getSubscriptionStatus: jest.fn(async () => 'trial'),
        } as any,
        { kodyRuleChanged: jest.fn(), kodyRulesImported: jest.fn() } as any,
    );
}

function cronWith(platformConfigs: any, opts: { realUseCase?: boolean; codeReviewThrows?: boolean } = {}) {
    const codeReviewConfig = {
        configValue: {
            configs: { kodyRulesGeneratorEnabled: true },
            repositories: [{ id: 'qa2639r-repo', name: 'codex-athena', isSelected: true, directories: [] }],
        },
    };
    const parametersService = {
        findByKey: jest.fn(async (key: any) => {
            if (key === ParametersKey.PLATFORM_CONFIGS) return platformConfigs;
            if (key === ParametersKey.CODE_REVIEW_CONFIG) {
                if (opts.codeReviewThrows) throw new Error('qa2639r findByKey failure');
                return codeReviewConfig;
            }
            return null;
        }),
    };
    const generate = opts.realUseCase
        ? realGenerateUseCase(parametersService)
        : { execute: jest.fn(async () => { throw new Error('qa2639r boom'); }) };
    return new KodyLearningCronProvider(
        { findTeamsWithIntegrations: jest.fn(async () => [team]) } as any,
        parametersService as any,
        generate as any,
        { hasPastReviewRulesForRepos: jest.fn(async () => new Set(['qa2639r-repo'])) } as any,
        { acquire: jest.fn(async () => lock) } as any,
    );
}

beforeAll(() => { process.env.API_LOG_LEVEL = 'info'; });
afterAll(() => { fs.writeFileSync(OUT, JSON.stringify(results, null, 2)); });

const enabled = { configValue: { kodyLearningStatus: KodyLearningStatus.ENABLED } };
const byComponent = (rows: any[], c: string) => rows.filter((r) => r.component === c && r.level === 'error').map(proj);

describe('qa2639r', () => {
    it('R1 shape 1: cron catch "Error generating kody rules" (real use case, PR fetch null = QA cause)', async () => {
        const rows = await withExporter(() => (cronWith(enabled, { realUseCase: true }) as any).handleCron());
        results.R1_real = byComponent(rows, 'KodyLearningCronProvider');
        results.R1_real_useCaseRow = byComponent(rows, 'GenerateKodyRulesUseCase');
        const r = results.R1_real.find((x: any) => x.message === 'Error generating kody rules');
        expect(r?.errorMessage).toMatch(/Could not fetch pull requests from the code management integration/);
        expect([r.org, r.team, r.metaTenant, r.tenant]).toEqual([O1, T1, O1, O1]);
    });

    it('R1b shape 1: cron catch via generateKodyRulesUseCase rejecting / findByKey throwing', async () => {
        const a = await withExporter(() => (cronWith(enabled) as any).handleCron());
        const b = await withExporter(() => (cronWith(enabled, { codeReviewThrows: true }) as any).handleCron());
        results.R1_reject = byComponent(a, 'KodyLearningCronProvider');
        results.R1_findByKey = byComponent(b, 'KodyLearningCronProvider');
        for (const set of [results.R1_reject, results.R1_findByKey]) {
            const r = set.find((x: any) => x.message === 'Error generating kody rules');
            expect([r.org, r.team, r.metaTenant, r.tenant]).toEqual([O1, T1, O1, O1]);
        }
    });

    it('R2 shape 2: "Error save code review feedback" on ReactionSyncAbortedError and on a listing failure', async () => {
        const payload = {
            organizationId: O2,
            teamId: T2,
            automationExecutionsPRs: [11, 12],
            pullRequestRefs: [{ repositoryId: 'qa2639r-repo', number: 11 }],
        };
        const aborted = new ReactionSyncAbortedError({
            resetAt: new Date('2026-11-27T10:00:00Z'),
            message: 'Reaction sync aborted after 3 rate-limited PRs',
            partialReactions: [],
            context: { organizationId: O2, teamId: T2 },
        });
        const run = async (svc: any, getReactions: any) => {
            const uc = new SaveCodeReviewFeedbackUseCase(svc, getReactions);
            let thrown: any;
            const rows = await withExporter(async () => {
                try { await uc.execute(payload); } catch (e) { thrown = e; }
            });
            return { rows: byComponent(rows, 'SaveCodeReviewFeedbackUseCase'), rethrown: thrown?.name };
        };
        const svc = { getByOrganizationId: jest.fn(async () => []), bulkUpsertReactions: jest.fn(async () => 0) };
        results.R2_aborted = await run(svc, { execute: jest.fn(async () => { throw aborted; }) });
        results.R2_listing = await run(
            { ...svc, getByOrganizationId: jest.fn(async () => { throw new Error('qa2639r mongo listing failure'); }) },
            { execute: jest.fn() },
        );
        for (const k of ['R2_aborted', 'R2_listing']) {
            const r = results[k].rows.find((x: any) => x.message === 'Error save code review feedback');
            expect([r.org, r.team, r.metaTenant, r.tenant]).toEqual([O2, T2, O2, O2]);
        }
        expect(results.R2_aborted.rethrown).toBe('ReactionSyncAbortedError');
        expect(results.R2_listing.rethrown).toBe('Error');
    });

    it('R3 new top-level ids: platform configs missing; stuck exhausted', async () => {
        const a = await withExporter(() => (cronWith(null) as any).handleCron());
        const b = await withExporter(() =>
            (cronWith({
                updatedAt: new Date(0),
                configValue: { kodyLearningStatus: KodyLearningStatus.GENERATING_RULES, kodyLearningStuckRetries: MAX_STUCK_RETRIES },
            }) as any).handleCron(),
        );
        results.R3_platform = byComponent(a, 'KodyLearningCronProvider');
        results.R3_stuck = byComponent(b, 'KodyLearningCronProvider');
        expect(results.R3_platform.find((x: any) => x.message === 'Platform configs not found')).toMatchObject({ org: O1, team: T1 });
        expect(results.R3_stuck.find((x: any) => /exhausted retries/.test(x.message))).toMatchObject({ org: O1, team: T1 });
    });

    it('R6 precedence table (each case followed by a clean pair Z)', async () => {
        const Z = { organizationId: 'qa2639r-org-z', teamId: 'qa2639r-team-z' };
        const cases: Record<string, any> = {
            a_partialTop_paramsNested: { organizationAndTeamData: { teamId: 'TA' }, params: { organizationAndTeamData: { organizationId: 'B', teamId: 'TB' } } },
            b_emptyTop_paramsFlat: { organizationAndTeamData: {}, params: { organizationId: 'B', teamId: 'TB' } },
            c_topPair_payloadFlat: { organizationAndTeamData: { organizationId: 'A', teamId: 'TA' }, payload: { organizationId: 'B', teamId: 'TB' } },
            d_topScalar_paramsFlat: { organizationId: 'A', params: { organizationId: 'B', teamId: 'TB' } },
            e_paramsNested_paramsFlat: { params: { organizationAndTeamData: { organizationId: 'A', teamId: 'TA' }, organizationId: 'B', teamId: 'TB' } },
            f_paramsFlat_payloadFlat: { params: { organizationId: 'B', teamId: 'TB' }, payload: { organizationId: 'C', teamId: 'TC' } },
            g_paramsPayloadOrg_only: { params: { payload: { organizationId: 'B' } } },
            h_emptyParamsOrg_payload: { params: { organizationId: '' }, payload: { organizationId: 'C', teamId: 'TC' } },
            i1_numericIds: { params: { organizationId: 123, teamId: 456 } },
            i2_arrayParams: { params: ['B', 'TB'] },
            i3_stringParams: { params: 'B' },
            j_payloadNested: { payload: { organizationAndTeamData: { organizationId: 'B', teamId: 'TB' } } },
            k_teamOnlyParams_payloadOrg: { params: { teamId: 'TB' }, payload: { organizationId: 'C' } },
        };
        const log = createLogger('qa2639r-precedence');
        const rows = await withExporter(async () => {
            for (const [name, metadata] of Object.entries(cases)) {
                log.error({ message: `qa2639r-R6-${name}`, context: 'QA2639R', metadata });
                log.error({ message: `qa2639r-R6-${name}-Z`, context: 'QA2639R', metadata: { organizationAndTeamData: Z } as any });
            }
        });
        results.R6 = rows
            .filter((r) => String(r.message).startsWith('qa2639r-R6'))
            .map((r) => ({ message: r.message, org: r.metadata?.organizationId, team: r.metadata?.teamId, metaTenant: r.metadata?.tenantId, tenant: r.tenantId }));
        const get = (n: string) => results.R6.find((x: any) => x.message === `qa2639r-R6-${n}`);
        expect(get('a_partialTop_paramsNested')).toMatchObject({ org: 'B', team: 'TB' });
        expect(get('b_emptyTop_paramsFlat')).toMatchObject({ org: 'B', team: 'TB' });
        expect(get('c_topPair_payloadFlat')).toMatchObject({ org: 'A', team: 'TA' });
        expect(get('d_topScalar_paramsFlat').org).toBe('A');
        expect(get('e_paramsNested_paramsFlat')).toMatchObject({ org: 'A', team: 'TA' });
        expect(get('f_paramsFlat_payloadFlat')).toMatchObject({ org: 'B', team: 'TB' });
        expect(get('g_paramsPayloadOrg_only').org).toBe('unknown');
        expect(get('h_emptyParamsOrg_payload')).toMatchObject({ org: 'C', team: 'TC' });
        for (const n of ['i1_numericIds', 'i2_arrayParams', 'i3_stringParams']) expect(get(n).org).toBe('unknown');
        expect(get('j_payloadNested')).toMatchObject({ org: 'B', team: 'TB' });
        for (const n of Object.keys(cases)) expect(get(`${n}-Z`)).toMatchObject({ org: 'qa2639r-org-z', team: 'qa2639r-team-z' });
    });

    it('R6b teamId-only shapes (no org anywhere) keep the team', async () => {
        const Z = { organizationId: 'qa2639r-org-z', teamId: 'qa2639r-team-z' };
        const cases: Record<string, any> = {
            l_paramsNested_teamOnly: { params: { organizationAndTeamData: { teamId: 'TL' } } },
            m_topPair_teamOnly: { organizationAndTeamData: { teamId: 'TM' } },
            n_paramsFlat_teamOnly: { params: { teamId: 'TN' } },
            o_payloadFlat_teamOnly: { payload: { teamId: 'TO' } },
        };
        const log = createLogger('qa2639r-teamonly');
        const rows = await withExporter(async () => {
            for (const [name, metadata] of Object.entries(cases)) {
                log.error({ message: `qa2639r-R6b-${name}`, context: 'QA2639R', metadata });
                log.error({ message: `qa2639r-R6b-${name}-Z`, context: 'QA2639R', metadata: { organizationAndTeamData: Z } as any });
            }
        });
        results.R6b = rows
            .filter((r) => String(r.message).startsWith('qa2639r-R6b'))
            .map((r) => ({ message: r.message, org: r.metadata?.organizationId, team: r.metadata?.teamId, metaTenant: r.metadata?.tenantId, tenant: r.tenantId }));
        const get = (n: string) => results.R6b.find((x: any) => x.message === `qa2639r-R6b-${n}`);
        expect(get('l_paramsNested_teamOnly')).toMatchObject({ org: 'unknown', team: 'TL' });
        expect(get('m_topPair_teamOnly')).toMatchObject({ org: 'unknown', team: 'TM' });
        expect(get('n_paramsFlat_teamOnly')).toMatchObject({ org: 'unknown', team: 'TN' });
        expect(get('o_payloadFlat_teamOnly')).toMatchObject({ org: 'unknown', team: 'TO' });
        for (const n of Object.keys(cases)) expect(get(`${n}-Z`)).toMatchObject({ org: 'qa2639r-org-z', team: 'qa2639r-team-z' });
    });

    it('R13 secrets in a flat payload stay redacted', async () => {
        const log = createLogger('qa2639r-secrets');
        const rows = await withExporter(async () => {
            log.error({
                message: 'qa2639r-R13',
                context: 'SaveCodeReviewFeedbackUseCase',
                metadata: { payload: { organizationId: O2, teamId: T2, token: 'qa2639r-dummy-token', password: 'qa2639r-dummy-password', marker: 'qa2639r-benign' } } as any,
            });
        });
        const r = rows.find((x) => x.message === 'qa2639r-R13');
        const s = JSON.stringify(r);
        results.R13 = { org: r.metadata?.organizationId, payload: r.attributes?.payload, hasTokenLiteral: s.includes('qa2639r-dummy-token'), hasPasswordLiteral: s.includes('qa2639r-dummy-password') };
        expect(r.metadata.organizationId).toBe(O2);
        expect(s).not.toContain('qa2639r-dummy-token');
        expect(s).not.toContain('qa2639r-dummy-password');
        expect(s).toContain('qa2639r-benign');
    });
});
