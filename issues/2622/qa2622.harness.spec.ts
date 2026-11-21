/**
 * QA harness for #2622 / PR #2609. Runs unchanged at the merge commit and at
 * its first parent against a local docker MongoDB; prints JSON lines
 * prefixed with QA2622 for the report.
 */
import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Connection, Model } from 'mongoose';
import { calculateObjectSize } from 'bson';

import { KodyRulesStatus } from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import {
    KodyRulesModel,
    KodyRulesSchema,
} from '@libs/kodyRules/infrastructure/adapters/repositories/schemas/kodyRules.model';
import { KodyRulesRepository } from '@libs/ee/kodyRules/repository/kodyRules.repository';
import { KodyRulesService } from '@libs/ee/kodyRules/service/kodyRules.service';
import { KodyRulesValidationService } from '@libs/ee/kodyRules/service/kody-rules-validation.service';
import { MongooseFactory } from '@libs/core/infrastructure/database/mongodb/mongoose.factory';
import { KodusCreditsSweepCronProvider } from '../apps/api/src/cron/kodusCreditsSweep.cron';

const URI = process.env.TEST_MONGODB_URI as string;
const out = (k: string, v: unknown) =>
    // eslint-disable-next-line no-console
    console.log(`QA2622 ${k} ${JSON.stringify(v)}`);

const ROOT = path.resolve(__dirname, '..');
const reviewReadMethod = (file: string) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return /kodyRulesService\.(\w+)\(\s*organizationAndTeamData\.organizationId/.exec(
        src,
    )?.[1];
};

const rule = (uuid: string, status: KodyRulesStatus, over = {}) => ({
    uuid,
    title: uuid,
    rule: `text of ${uuid} `.repeat(60),
    status,
    lockedByPlan: false,
    repositoryId: 'repo',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Number(uuid.replace(/\D/g, '') || 0))),
    ...over,
});

describe('QA #2622 harness', () => {
    let conn: Connection;
    let model: Model<KodyRulesModel>;
    let repo: KodyRulesRepository;
    let validation: KodyRulesValidationService;
    let limited = true;
    const cmds: Array<{ name: string; bytes?: number }> = [];

    const service = () =>
        new (KodyRulesService as any)(
            repo,
            { emit: () => undefined },
            {},
            {},
            validation,
            {},
            {},
            { shouldLimitResources: async () => limited },
            {},
            {},
        ) as KodyRulesService;

    beforeAll(async () => {
        conn = await mongoose
            .createConnection(URI, {
                dbName: 'qa2622_harness',
                monitorCommands: true,
            })
            .asPromise();
        await conn.dropDatabase();
        conn.getClient().on('commandStarted', (e) => {
            if (e.command[e.commandName] === 'kodyRules')
                cmds.push({ name: e.commandName });
        });
        conn.getClient().on('commandSucceeded', (e: any) => {
            if (
                (e.commandName === 'find' || e.commandName === 'aggregate') &&
                e.reply?.cursor
            ) {
                const last = [...cmds].reverse().find((c) => c.bytes === undefined);
                if (last) last.bytes = calculateObjectSize(e.reply);
            }
        });
        model = conn.model<KodyRulesModel>(KodyRulesModel.name, KodyRulesSchema);
        await model.init();
        validation = new KodyRulesValidationService({} as any);
        repo = new KodyRulesRepository(model as any, validation);
    }, 60_000);

    afterAll(async () => {
        await conn.dropDatabase();
        await conn.close();
    });

    it('review read: what codeBaseConfig and the CLI review load', async () => {
        const ORG = 'org-read';
        await model.create({
            organizationId: ORG,
            rules: [
                rule('r1', KodyRulesStatus.ACTIVE),
                rule('r2', KodyRulesStatus.PAUSED, { lockedByPlan: true }),
                rule('r3', KodyRulesStatus.REJECTED),
                ...Array.from({ length: 5000 }, (_, i) =>
                    rule(`d${i + 10}`, KodyRulesStatus.DELETED),
                ),
            ],
        });
        const result: Record<string, unknown> = {};
        for (const file of [
            'libs/ee/codeBase/codeBaseConfig.service.ts',
            'libs/cli-review/application/use-cases/execute-cli-review.use-case.ts',
        ]) {
            const method = reviewReadMethod(file) as string;
            cmds.length = 0;
            const t0 = Date.now();
            const entity: any = await (service() as any)[method](ORG);
            const ms = Date.now() - t0;
            const rules = entity.toObject().rules;
            const paid = validation.filterKodyRules(rules, 'repo', undefined, false);
            const free = validation.filterKodyRules(rules, 'repo', undefined, true);
            result[file.split('/').pop() as string] = {
                method,
                rulesReturned: rules.length,
                deletedReturned: rules.filter((r: any) => r.status === 'deleted').length,
                replyBytes: cmds.map((c) => c.bytes),
                ms,
                appliedPaid: paid.standardRules.map((r) => r.uuid),
                appliedFree: free.standardRules.map((r) => r.uuid),
            };
        }
        out('read', result);
    }, 60_000);

    it('plan sync: lock on a limited plan, unlock on a paid one', async () => {
        const ORG = 'org-sync';
        await model.create({
            organizationId: ORG,
            rules: [
                ...Array.from({ length: 15 }, (_, i) =>
                    rule(`a${String(i + 1).padStart(2, '0')}`, KodyRulesStatus.ACTIVE),
                ),
                ...Array.from({ length: 100 }, (_, i) =>
                    rule(`d${i + 100}`, KodyRulesStatus.DELETED),
                ),
            ],
        });
        const state = async () => {
            const d: any = await model.findOne({ organizationId: ORG }).lean();
            return {
                total: d.rules.length,
                lockedPaused: d.rules
                    .filter((r: any) => r.status === 'paused' && r.lockedByPlan)
                    .map((r: any) => r.uuid),
                active: d.rules.filter((r: any) => r.status === 'active').length,
                textIntact: d.rules.every((r: any) => r.rule.includes(`text of ${r.uuid}`)),
            };
        };
        const res: Record<string, unknown> = {};
        limited = true;
        cmds.length = 0;
        await service().syncRulesWithPlanLimit({ organizationId: ORG } as any);
        res.lock = { commands: cmds.map((c) => c.name), after: await state() };
        limited = false;
        cmds.length = 0;
        await service().syncRulesWithPlanLimit({ organizationId: ORG } as any);
        res.unlock = { commands: cmds.map((c) => c.name), after: await state() };
        out('sync', res);
    }, 60_000);

    it('find(): limited plan keeps rules locked across calls', async () => {
        const ORG = 'org-find';
        await model.create({
            organizationId: ORG,
            rules: [
                ...Array.from({ length: 10 }, (_, i) =>
                    rule(`f${String(i + 1).padStart(2, '0')}`, KodyRulesStatus.ACTIVE),
                ),
                rule('f11', KodyRulesStatus.PAUSED, { lockedByPlan: true }),
                rule('f12', KodyRulesStatus.PAUSED, { lockedByPlan: true }),
            ],
        });
        limited = true;
        const res: Record<string, unknown> = {};
        for (const call of ['limited: first call', 'limited: second call']) {
            cmds.length = 0;
            const r = await service().find({ organizationId: ORG } as any);
            const rules = (r[0] as any).rules ?? (r[0] as any).toObject().rules;
            res[call] = {
                commands: cmds.map((c) => c.name),
                lockedInResult: rules.filter((x: any) => x.lockedByPlan).length,
            };
        }
        limited = false;
        cmds.length = 0;
        const r = await service().find({ organizationId: ORG } as any);
        const rules = (r[0] as any).rules ?? (r[0] as any).toObject().rules;
        res['paid: unlocks'] = {
            commands: cmds.map((c) => c.name),
            lockedInResult: rules.filter((x: any) => x.lockedByPlan).length,
        };
        out('find', res);
    }, 60_000);

    it('mongoose connection options per component', () => {
        const res: Record<string, unknown> = {};
        const keep = { ...process.env };
        for (const [component, autoIndex] of [
            ['api', undefined],
            ['webhook', undefined],
            ['worker', undefined],
            ['api', 'false'],
            ['api-bad-env', 'x'],
        ] as const) {
            process.env.COMPONENT_TYPE = component === 'api-bad-env' ? 'api' : component;
            if (component === 'api-bad-env') {
                process.env.MG_POOL_MAX_API = '0';
                process.env.MG_WAIT_QUEUE_TIMEOUT_MS = 'abc';
            }
            if (autoIndex) process.env.MONGO_AUTO_INDEX = autoIndex;
            else delete process.env.MONGO_AUTO_INDEX;
            const f = new MongooseFactory({
                get: () => ({ url: 'mongodb://example:27017/db' }),
            } as any);
            const o: any = f.createMongooseOptions();
            res[`${component}${autoIndex ? ` MONGO_AUTO_INDEX=${autoIndex}` : ''}`] = {
                minPoolSize: o.minPoolSize,
                maxPoolSize: o.maxPoolSize,
                serverSelectionTimeoutMS: o.serverSelectionTimeoutMS,
                waitQueueTimeoutMS: o.waitQueueTimeoutMS,
                autoIndex: o.autoIndex,
            };
            process.env = { ...keep };
        }
        out('pool', res);
    });
});

describe('QA #2622 credits sweep (fake clock)', () => {
    afterEach(() => jest.useRealTimers());

    const run = async (opts: {
        orgs: number;
        sweepMs: number;
        ticks: number;
    }) => {
        jest.useFakeTimers({ now: Date.parse('2026-11-21T00:00:00Z') });
        let held: { until: number; released: boolean } | null = null;
        const lockSvc = {
            acquire: async (_k: string, { ttl }: { ttl: number }) => {
                if (held && !held.released) return null;
                const l = { until: Date.now() + ttl, released: false };
                held = l;
                const timer = setTimeout(() => (l.released = true), ttl);
                return {
                    release: async () => {
                        clearTimeout(timer);
                        l.released = true;
                    },
                    ttl,
                };
            },
        };
        let inFlight = 0;
        let maxInFlight = 0;
        const startedTicks = new Set<number>();
        let sweepingRuns = 0;
        let maxSweepingRuns = 0;
        const swept = new Map<string, number>();
        let tick = 0;
        let ttlSeen = 0;
        const orgIds = Array.from({ length: opts.orgs }, (_, i) => `org-${String(i).padStart(3, '0')}`);
        const metering = {
            listOrganizationsWithKodusCredential: async () => {
                startedTicks.add(tick);
                sweepingRuns++;
                maxSweepingRuns = Math.max(maxSweepingRuns, sweepingRuns);
                return orgIds;
            },
            sweepOrganization: async (id: string) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((r) => setTimeout(r, opts.sweepMs));
                inFlight--;
                if (!swept.has(id)) swept.set(id, tick);
                return { debited: 0, debitedUsd: 0 };
            },
        };
        const cron = new KodusCreditsSweepCronProvider(metering as any, {
            acquire: async (k: string, o: any) => {
                ttlSeen = o.ttl;
                return lockSvc.acquire(k, o);
            },
        } as any);
        const runs: Promise<void>[] = [];
        for (tick = 1; tick <= opts.ticks; tick++) {
            runs.push(
                (async (t: number) => {
                    await cron.handleCron();
                    if (startedTicks.has(t)) sweepingRuns--;
                })(tick),
            );
            await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
        }
        await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
        await Promise.all(runs);
        const ticksToCoverAll =
            swept.size === opts.orgs ? Math.max(...swept.values()) : null;
        return {
            lockTtlMin: ttlSeen / 60000,
            maxConcurrentSweeps: maxInFlight,
            runsThatSwept: startedTicks.size,
            maxOverlappingRuns: maxSweepingRuns,
            sweptOrgs: swept.size,
            ticksToCoverAll,
        };
    };

    it('slow sweeps (6 min each, 40 orgs): overlap and concurrency', async () => {
        out('sweep-slow', await run({ orgs: 40, sweepMs: 6 * 60 * 1000, ticks: 4 }));
    });

    it('5 s sweeps, 200 orgs: ticks until every org is swept (20 runs)', async () => {
        const all: Array<number | null> = [];
        let maxC = 0;
        for (let i = 0; i < 20; i++) {
            const r = await run({ orgs: 200, sweepMs: 5_000, ticks: 6 });
            all.push(r.ticksToCoverAll);
            maxC = Math.max(maxC, r.maxConcurrentSweeps);
        }
        out('sweep-coverage-5s', { ticksToCoverAll: all, maxConcurrentSweeps: maxC });
    });

    it('30 s sweeps, 100 orgs: ticks until every org is swept (20 runs)', async () => {
        const all: Array<number | null> = [];
        let maxC = 0;
        for (let i = 0; i < 20; i++) {
            const r = await run({ orgs: 100, sweepMs: 30_000, ticks: 24 });
            all.push(r.ticksToCoverAll);
            maxC = Math.max(maxC, r.maxConcurrentSweeps);
        }
        out('sweep-coverage', { ticksToCoverAll: all, maxConcurrentSweeps: maxC });
    });
});
