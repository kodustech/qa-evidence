/**
 * QA harness for #2619 / PR #2604. Runs the real repository code against a
 * local throwaway MongoDB and records, through driver command monitoring,
 * the maxTimeMS each read sends to the server. Then turns on the mongod
 * failpoint `maxTimeAlwaysTimeOut` (affects only ops that carry maxTimeMS)
 * to show the server cuts the bounded reads.
 */
import mongoose, { Connection } from 'mongoose';
import * as fs from 'fs';

import { PullRequestsRepository } from '@libs/platformData/infrastructure/adapters/repositories/pullRequests.repository';
import {
    PullRequestsModel,
    PullRequestsSchema,
} from '@libs/platformData/infrastructure/adapters/repositories/schemas/pullRequests.model';
import { IssuesRepository } from '@libs/issues/infrastructure/adapters/repositories/issues.repository';
import {
    IssuesModel,
    IssuesSchema,
} from '@libs/issues/infrastructure/adapters/repositories/schemas/issues.model';
import { RuleLikesRepository } from '@libs/kodyRules/infrastructure/adapters/repositories/ruleLike.repository';
import {
    RuleLikeModel,
    RuleLikeSchema,
} from '@libs/kodyRules/infrastructure/adapters/repositories/schemas/mongoose/rulesLikes.model';
import { KodyRulesRepository } from '@libs/ee/kodyRules/repository/kodyRules.repository';
import {
    KodyRulesModel,
    KodyRulesSchema,
} from '@libs/kodyRules/infrastructure/adapters/repositories/schemas/kodyRules.model';
import { TokenUsageRepository } from '@libs/analytics/infrastructure/adapters/repositories/tokenUsage.repository';
import {
    ObservabilityTelemetryModel,
    ObservabilityTelemetryModelSchema,
} from '@libs/analytics/infrastructure/adapters/repositories/schemas/observabilityTelemetry.model';

const URI = process.env.QA_HARNESS_MONGO_URI!;
const OUT = process.env.QA_HARNESS_OUT!;
const ORG = 'qa-2619-org';

describe('qa2619 harness', () => {
    let conn: Connection;
    const seen: Array<{ cmd: string; coll: unknown; maxTimeMS: unknown }> = [];
    const results: Record<string, unknown> = {};

    beforeAll(async () => {
        conn = await mongoose
            .createConnection(URI, { dbName: 'qa2619', monitorCommands: true })
            .asPromise();
        await conn.dropDatabase();
        conn.getClient().on('commandStarted', (e: any) => {
            if (['aggregate', 'count', 'find', 'getMore'].includes(e.commandName))
                seen.push({
                    cmd: e.commandName,
                    coll: e.command[e.commandName],
                    maxTimeMS: e.command.maxTimeMS,
                });
        });
        await conn.collection('pullRequests').insertMany([
            { organizationId: ORG, number: 1, user: { id: '42', username: 'a' }, repository: { id: 'r1', fullName: 'o/r1' }, status: 'open', files: [] },
            { organizationId: ORG, number: 2, user: { id: '42', username: 'a' }, repository: { id: 'r1', fullName: 'o/r1' }, status: 'open', files: [] },
            { organizationId: ORG, number: 3, user: { id: '42', username: 'a' }, repository: { id: 'r1', fullName: 'o/r1' }, status: 'open', files: [] },
        ]);
    });

    afterAll(async () => {
        fs.writeFileSync(OUT, JSON.stringify({ results, seen }, null, 1));
        await conn.close();
    });

    const repos = () => ({
        pr: new PullRequestsRepository(conn.model(PullRequestsModel.name, PullRequestsSchema) as any),
        issues: new IssuesRepository(conn.model(IssuesModel.name, IssuesSchema) as any),
        likes: new RuleLikesRepository(conn.model(RuleLikeModel.name, RuleLikeSchema) as any),
        rules: new KodyRulesRepository(conn.model(KodyRulesModel.name, KodyRulesSchema) as any, {} as any),
        tu: new TokenUsageRepository(
            conn.model(ObservabilityTelemetryModel.name, ObservabilityTelemetryModelSchema) as any,
            {} as any,
        ),
    });

    const calls = (r: ReturnType<typeof repos>): Record<string, () => Promise<unknown>> => ({
        'issues.count': () => r.issues.count({ organizationId: ORG } as any),
        'ruleLikes.countByRule': () => r.likes.countByRule('x'),
        'kodyRules.findById': () => r.rules.findById('x', ORG),
        'tokenUsage.getModelCredentialPairs': () =>
            r.tu.getModelCredentialPairs({ organizationId: ORG, start: new Date(0), end: new Date(), byok: true } as any),
        'pullRequests.findSuggestionsByRuleId': () => r.pr.findSuggestionsByRuleId('x', ORG),
        'pullRequests.findByOrganizationAndRepositoryWithStatusAndSyncedFlag (cursor)': () =>
            r.pr.findByOrganizationAndRepositoryWithStatusAndSyncedFlag(ORG, { id: 'r1', fullName: 'o/r1' } as any),
        'pullRequests.countByAuthor(limit 2)': async () =>
            typeof (r.pr as any).countByAuthor === 'function'
                ? (r.pr as any).countByAuthor(ORG, '42', 2)
                : 'n/a (method absent)',
    });

    it('records maxTimeMS per read, then reads under maxTimeAlwaysTimeOut', async () => {
        const r = repos();
        for (const [name, fn] of Object.entries(calls(r))) {
            const before = seen.length;
            let value: unknown;
            try {
                value = await fn();
            } catch (e: any) {
                value = `error ${e.code ?? ''} ${e.codeName ?? e.message}`;
            }
            results[name] = {
                value: Array.isArray(value) ? `array(${value.length})` : value,
                maxTimeMS: seen.slice(before).map((s) => s.maxTimeMS ?? null),
            };
        }
        await conn.db.admin().command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'alwaysOn' });
        try {
            for (const [name, fn] of Object.entries(calls(r))) {
                let outcome: string;
                try {
                    await fn();
                    outcome = 'completed (no server-side bound)';
                } catch (e: any) {
                    outcome = `cut by server: ${e.code} ${e.codeName}`;
                }
                (results[name] as any).underFailpoint = outcome;
            }
        } finally {
            await conn.db.admin().command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'off' });
        }
    });
});
