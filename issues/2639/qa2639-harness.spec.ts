// QA #2639 harness H: real SimpleLogger + real deepSanitize + real MongoDBExporter,
// fake collections.logs.insertMany. Identical file runs at merge and first parent.
jest.mock('@libs/core/log/logger', () => jest.requireActual('@libs/core/log/logger'));

import * as fs from 'fs';
import {
    addLogProcessor,
    createLogger,
    removeLogProcessor,
} from '@libs/core/log/logger';
import { MongoDBExporter } from '@libs/core/observability/exporters/mongodb-exporter';

const OUT = process.env.QA2639_OUT || '/tmp/qa2639-out.json';
const results: Record<string, any> = {};
const A = { organizationId: 'qa2639-org-a', teamId: 'qa2639-team-a' };
const B = { organizationId: 'qa2639-org-b', teamId: 'qa2639-team-b' };
const repository = { id: 'qa2639-repo', name: 'claude-athena' };

function proj(r: any) {
    return {
        message: r.message,
        component: r.component,
        level: r.level,
        metaLevel: r.metadata?.level,
        org: r.metadata?.organizationId,
        team: r.metadata?.teamId,
        metaTenant: r.metadata?.tenantId,
        tenant: r.tenantId,
        attrOrg: r.attributes?.organizationId,
        attrTeam: r.attributes?.teamId,
        paramsPair: r.attributes?.params?.organizationAndTeamData,
        topPair: r.attributes?.organizationAndTeamData,
        correlationId: r.correlationId,
        correlationIdSynthetic: r.correlationIdSynthetic,
        executionId: r.executionId,
        sessionId: r.sessionId,
        errorName: r.error?.name,
        errorMessage: r.error?.message,
        timestampIsDate: r.timestamp instanceof Date,
        createdAtIsDate: r.createdAt instanceof Date,
    };
}

type Sink = { inserts: any[][]; insertMany: jest.Mock };
function makeSink(): Sink {
    const sink: any = { inserts: [] };
    sink.insertMany = jest.fn(async (docs: any[]) => {
        sink.inserts.push(docs.map((d) => d));
        return { insertedCount: docs.length };
    });
    return sink;
}

function makeExporter(cfg: any = {}, sink = makeSink()) {
    const exporter = new MongoDBExporter({
        batchSize: 500,
        flushIntervalMs: 60_000,
        bucketKeys: ['organizationId', 'teamId', 'tenantId'],
        ...cfg,
    });
    (exporter as any).collections = {
        logs: { insertMany: sink.insertMany },
        telemetry: { insertMany: jest.fn(async () => ({})) },
    };
    return { exporter, sink };
}

const qaRecords = (sink: Sink) =>
    sink.inserts
        .flat()
        .filter((r) => String(r.message).startsWith('qa2639'));

async function withExporter(
    fn: (log: ReturnType<typeof createLogger>, exporter: MongoDBExporter, seen: any[]) => Promise<void> | void,
    cfg: any = {},
    sink?: Sink,
) {
    const made = makeExporter(cfg, sink);
    const seen: any[] = [];
    const spy = (level: any, message: any, _svc: any, ctx: any) => {
        if (String(message).startsWith('qa2639')) seen.push({ message, ctx: JSON.parse(JSON.stringify(ctx)) });
    };
    addLogProcessor(spy as any);
    addLogProcessor(made.exporter as any);
    try {
        await fn(createLogger('qa2639-harness'), made.exporter, seen);
        await made.exporter.flush();
    } finally {
        removeLogProcessor(made.exporter as any);
        removeLogProcessor(spy as any);
    }
    return { ...made, seen };
}

beforeAll(() => {
    process.env.API_LOG_LEVEL = 'info';
});
afterAll(() => {
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
});

describe('qa2639', () => {
    it('M2 SimpleLogger.error with metadata {params} and direct exportLog', async () => {
        const { sink, seen } = await withExporter(async (log, exporter) => {
            log.error({
                message: 'qa2639-M2-logger',
                context: 'BitbucketCloudService',
                serviceName: 'BitbucketCloudService getDefaultBranch',
                error: new Error('synthetic'),
                metadata: {
                    params: { organizationAndTeamData: A, repository },
                    correlationId: 'qa2639-M2',
                } as any,
            });
            await exporter.exportLog('error', 'qa2639-M2-direct', {
                component: 'BitbucketCloudService',
                params: { organizationAndTeamData: A, repository },
                correlationId: 'qa2639-M2-direct',
            } as any);
        });
        results.M2 = {
            processorInputKeys: seen.map((s) => ({ m: s.message, keys: Object.keys(s.ctx), hasMetadataWrapper: 'metadata' in s.ctx })),
            records: qaRecords(sink).map(proj),
        };
    });

    it('M3 real provider methods with stubbed SDK rejection', async () => {
        const { BitbucketCloudService } = require('@libs/platform/infrastructure/adapters/services/bitbucket/bitbucket-cloud.service');
        const { AzureReposService } = require('@libs/platform/infrastructure/adapters/services/azureRepos/azureRepos.service');
        const reject403 = () => {
            const e: any = new Error('qa2639 synthetic 403 Forbidden');
            e.name = 'HTTPError';
            e.status = 403;
            return Promise.reject(e);
        };
        const out: any = {};
        const { sink } = await withExporter(async () => {
            const bb = Object.create(BitbucketCloudService.prototype);
            bb.logger = createLogger(BitbucketCloudService.name);
            bb.getAuthDetails = async () => ({ authMode: 'token' });
            bb.getWorkspaceFromRepository = async () => 'qa2639-ws';
            bb.instanceBitbucketApi = () => ({ repositories: { get: reject403 } });
            out.bitbucketReturn = await bb.getDefaultBranch({ organizationAndTeamData: A, repository });

            const az = Object.create(AzureReposService.prototype);
            az.logger = createLogger(AzureReposService.name);
            az.getAuthDetails = async () => ({ orgName: 'qa2639-org', token: 'qa2639-dummy-token' });
            az.getProjectIdFromRepository = async () => 'qa2639-project';
            az.azureReposRequestHelper = { getLanguageRepository: reject403 };
            out.azureReturn = await az.getLanguageRepository({ organizationAndTeamData: B, repository });
        });
        out.records = sink.inserts
            .flat()
            .filter((r) => ['Error to get default branch', 'Failed to get language repository'].includes(r.message))
            .map(proj);
        results.M3 = out;
    });

    it('M11 precedence', async () => {
        const cases: Record<string, any> = {
            F1_direct_scalars_win: { organizationId: A.organizationId, teamId: A.teamId, tenantId: 'qa2639-tenant-explicit', organizationAndTeamData: B, params: { organizationAndTeamData: B } },
            F2_top_pair_wins: { organizationAndTeamData: A, params: { organizationAndTeamData: B } },
            F3_nested_with_pair_tenant: { params: { organizationAndTeamData: { ...A, tenantId: 'qa2639-pair-tenant' } } },
            F4_partial_top_teamOnly_plus_full_nested: { organizationAndTeamData: { teamId: A.teamId }, params: { organizationAndTeamData: B } },
            F5_empty_top_plus_full_nested: { organizationAndTeamData: {}, params: { organizationAndTeamData: A } },
        };
        const { sink } = await withExporter(async (log) => {
            for (const [k, md] of Object.entries(cases)) {
                log.error({ message: `qa2639-M11-${k}`, context: 'Svc', metadata: md as any });
            }
        });
        results.M11 = qaRecords(sink).map(proj);
    });

    it('M12 malformed inputs each followed by a clean pair B', async () => {
        const errors: any[] = [];
        const onRej = (e: any) => errors.push(String(e));
        process.on('unhandledRejection', onRej);
        const malformed: Array<[string, any]> = [
            ['empty_params', { params: {} }],
            ['params_repository_only', { params: { repository } }],
            ['nested_null', { params: { organizationAndTeamData: null } }],
            ['nested_string', { params: { organizationAndTeamData: 'qa2639-str' } }],
            ['nested_array', { params: { organizationAndTeamData: [] } }],
            ['top_null_nested_A', { organizationAndTeamData: null, params: { organizationAndTeamData: A } }],
            ['top_string_nested_A', { organizationAndTeamData: 'qa2639-str', params: { organizationAndTeamData: A } }],
            ['nested_org_only_A', { params: { organizationAndTeamData: { organizationId: A.organizationId } } }],
            ['nested_team_only_A', { params: { organizationAndTeamData: { teamId: A.teamId } } }],
            ['params_string', { params: 'qa2639-params-string' }],
        ];
        const { sink } = await withExporter(async (log, exporter) => {
            try {
                await exporter.exportLog('error', 'qa2639-M12-undefined_context', undefined as any);
                log.error({ message: 'qa2639-M12-undefined_context-then-B', context: 'Svc', metadata: { params: { organizationAndTeamData: B } } as any });
                await exporter.exportLog('error', 'qa2639-M12-string_context', 'LegacyComponent' as any);
                log.error({ message: 'qa2639-M12-string_context-then-B', context: 'Svc', metadata: { params: { organizationAndTeamData: B } } as any });
                for (const [k, md] of malformed) {
                    log.error({ message: `qa2639-M12-${k}`, context: 'Svc', metadata: md });
                    log.error({ message: `qa2639-M12-${k}-then-B`, context: 'Svc', metadata: { params: { organizationAndTeamData: B } } as any });
                }
            } catch (e) {
                errors.push('sync:' + String(e));
            }
        });
        await new Promise((r) => setTimeout(r, 50));
        process.off('unhandledRejection', onRej);
        results.M12 = { errors, records: qaRecords(sink).map(proj) };
    });

    it('M13 large params and sanitizer budget', async () => {
        const items = Array.from({ length: 80 }, (_, i) => ({ i, v: 'safe' }));
        const many: Record<string, any> = {};
        for (let i = 0; i < 100; i++) many['f' + i] = 'y'.repeat(4096);
        const { sink, seen } = await withExporter(async (log) => {
            log.error({ message: 'qa2639-M13-array80_unicode', context: 'Svc', metadata: { params: { organizationAndTeamData: A, repository: { id: 'r', name: 'claude-athena-ação' }, items } } as any });
            log.error({ message: 'qa2639-M13-100x4096_then_params', context: 'Svc', metadata: { ...many, params: { organizationAndTeamData: A } } as any });
            log.error({ message: 'qa2639-M13-big_field_first', context: 'Svc', metadata: { params: { bigField: 'x'.repeat(300000), organizationAndTeamData: A } } as any });
            log.error({ message: 'qa2639-M13-big_field_last', context: 'Svc', metadata: { params: { organizationAndTeamData: A, bigField: 'x'.repeat(300000) } } as any });
            log.error({ message: 'qa2639-M13-many_fields_inside_params_first', context: 'Svc', metadata: { params: { ...many, organizationAndTeamData: A } } as any });
        });
        results.M13 = {
            processorPair: seen.map((s) => ({ m: s.message, pairAtExporterInput: s.ctx?.params?.organizationAndTeamData ?? null })),
            records: qaRecords(sink).map((r) => ({ ...proj(r), bytes: JSON.stringify(r).length })),
            insertCalls: sink.insertMany.mock.calls.length,
        };
    });

    it('M14 secrets redacted, benign kept', async () => {
        const secrets = ['qa2639-dummy-password', 'qa2639-dummy-token', 'qa2639-dummy-nested-token', 'qa2639-dummy-array-password'];
        const md = {
            params: {
                organizationAndTeamData: A,
                repository,
                marker: 'qa2639-benign',
                password: 'qa2639-dummy-password',
                token: 'qa2639-dummy-token',
                nested: { token: 'qa2639-dummy-nested-token' },
                list: [{ password: 'qa2639-dummy-array-password' }],
            },
        };
        const { sink } = await withExporter(async (log, exporter) => {
            log.error({ message: 'qa2639-M14-logger', context: 'Svc', metadata: md as any });
            await exporter.exportLog('error', 'qa2639-M14-direct', { component: 'Svc', ...JSON.parse(JSON.stringify(md)) } as any);
        });
        results.M14 = qaRecords(sink).map((r) => {
            const s = JSON.stringify(r);
            return {
                ...proj(r),
                leaked: secrets.filter((x) => s.includes(x)),
                benignKept: s.includes('qa2639-benign') && s.includes('claude-athena'),
                passwordField: r.attributes?.params?.password,
                tokenField: r.attributes?.params?.token,
            };
        });
    });

    it('M15 first insert rejects with Mongo network error then succeeds', async () => {
        const sink = makeSink();
        let calls = 0;
        const accepted: any[] = [];
        sink.insertMany = jest.fn(async (docs: any[]) => {
            calls++;
            if (calls === 1) {
                const e: any = new Error('Topology is closed');
                e.name = 'MongoNetworkError';
                throw e;
            }
            accepted.push(...docs);
            return { insertedCount: docs.length };
        });
        const made = makeExporter({}, sink);
        const ex: any = made.exporter;
        ex.lastReconnectAt = Date.now(); // keep scheduleReconnect from dialling a real Mongo
        const log = createLogger('qa2639-harness');
        addLogProcessor(ex);
        let intermediate: any[] = [];
        try {
            log.error({ message: 'qa2639-M15-A', context: 'Svc', metadata: { params: { organizationAndTeamData: A }, correlationId: 'qa2639-M15-A' } as any });
            log.error({ message: 'qa2639-M15-B', context: 'Svc', metadata: { params: { organizationAndTeamData: B }, correlationId: 'qa2639-M15-B' } as any });
            await ex.flushLogs();
            intermediate = ex.logBuffer.filter((r: any) => String(r.message).startsWith('qa2639')).map(proj);
            ex.collections = { logs: { insertMany: sink.insertMany }, telemetry: { insertMany: jest.fn() } };
            await ex.flush();
        } finally {
            removeLogProcessor(ex);
        }
        results.M15 = {
            insertCalls: calls,
            intermediateBuffered: intermediate,
            accepted: accepted.filter((r) => String(r.message).startsWith('qa2639')).map(proj),
            finalBufferQa: ex.logBuffer.filter((r: any) => String(r.message).startsWith('qa2639')).length,
            activeFlush: !!ex.activeLogFlush,
        };
    });

    it('M16 20 alternating records during a held flush', async () => {
        const sink = makeSink();
        let release: () => void = () => {};
        let first = true;
        const accepted: any[][] = [];
        sink.insertMany = jest.fn(async (docs: any[]) => {
            if (first) {
                first = false;
                await new Promise<void>((r) => (release = r));
            }
            accepted.push(docs);
            return { insertedCount: docs.length };
        });
        const made = makeExporter({}, sink);
        const ex: any = made.exporter;
        const log = createLogger('qa2639-harness');
        addLogProcessor(ex);
        try {
            log.error({ message: 'qa2639-M16-seed', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
            const held = ex.flushLogs();
            await new Promise((r) => setTimeout(r, 10));
            for (let i = 0; i < 20; i++) {
                const pair = i % 2 ? B : A;
                log.error({ message: `qa2639-M16-${i}`, context: 'Svc', metadata: { params: { organizationAndTeamData: pair }, correlationId: `qa2639-M16-${i}`, expectOrg: pair.organizationId } as any });
            }
            log.error({ message: 'qa2639-M16-unattributed', context: 'Svc', metadata: { params: { repository } } as any });
            const second = ex.flush();
            release();
            await held;
            await second;
            await ex.flush();
        } finally {
            removeLogProcessor(ex);
        }
        const recs = accepted.flat().filter((r) => String(r.message).startsWith('qa2639'));
        results.M16 = {
            batches: accepted.length,
            records: recs.map((r) => ({ m: r.message, org: r.metadata.organizationId, team: r.metadata.teamId, tenant: r.tenantId, expect: r.attributes?.expectOrg })),
            finalBufferQa: ex.logBuffer.filter((r: any) => String(r.message).startsWith('qa2639')).length,
            activeFlush: !!ex.activeLogFlush,
        };
    });

    it('M17 configuration variants', async () => {
        const out: any = {};
        process.env.API_LOG_LEVEL = 'error';
        try {
            const r1 = await withExporter(async (log) => {
                log.log({ message: 'qa2639-M17-info-at-error', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
                log.error({ message: 'qa2639-M17-error-at-error', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
            });
            out.levelError = qaRecords(r1.sink).map(proj);
        } finally {
            process.env.API_LOG_LEVEL = 'info';
        }
        const r2 = await withExporter(async (log) => {
            log.error({ message: 'qa2639-M17-disabled', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
        }, { enableObservability: false });
        out.disabled = { inserts: r2.sink.insertMany.mock.calls.length, buffer: (r2.exporter as any).logBuffer.length };
        const r3 = await withExporter(async (log) => {
            log.error({ message: 'qa2639-M17-default-keys', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
        });
        out.defaultKeys = qaRecords(r3.sink).map((r) => ({ ...proj(r), metadataKeys: Object.keys(r.metadata) }));
        const r4 = await withExporter(async (log) => {
            log.error({ message: 'qa2639-M17-custom-keys', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
        }, { bucketKeys: ['component', 'level', 'tenantId'] });
        out.customKeys = qaRecords(r4.sink).map((r) => ({ ...proj(r), metadataKeys: Object.keys(r.metadata) }));
        results.M17 = out;
    });

    it('M18 correlation and schema', async () => {
        const historical = Object.freeze({ message: 'qa2639-historical', metadata: { organizationId: 'unknown' } });
        const before = JSON.stringify(historical);
        const sink = makeSink();
        sink.inserts.push([historical]);
        const { seen } = await withExporter(async (log) => {
            log.error({ message: 'qa2639-M18-explicit', context: 'Svc', metadata: { params: { organizationAndTeamData: A }, correlationId: 'qa2639-M18', executionId: 'qa2639-exec', sessionId: 'qa2639-session' } as any });
            log.error({ message: 'qa2639-M18-no-correlation', context: 'Svc', metadata: { params: { organizationAndTeamData: A } } as any });
            log.error({ message: 'qa2639-M18-top-level', context: 'Svc', metadata: { organizationAndTeamData: A, correlationId: 'qa2639-M18-top' } as any });
        }, {}, sink);
        results.M18 = {
            records: qaRecords(sink).filter((r) => r.message !== 'qa2639-historical').map(proj),
            historicalUnchanged: JSON.stringify(sink.inserts[0][0]) === before,
            seen: seen.length,
        };
    });
});
