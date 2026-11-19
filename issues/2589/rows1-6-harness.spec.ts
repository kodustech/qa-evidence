/**
 * QA harness for #2589 rows 1-6. Runs the real code at whatever commit is
 * checked out; only the external dependency (TypeORM repository, AMQP
 * channel, LLM/analysis service, repo lookup) is stubbed. Each test prints a
 * RESULT line instead of asserting, so the same file runs at the merge commit
 * and at its first parent.
 */
const out = (row: string, what: string, value: unknown) =>
    // eslint-disable-next-line no-console
    console.log(`RESULT ${row} | ${what} | ${JSON.stringify(value)}`);

describe('#2589 rows 1-6 harness', () => {
    it('row 1: GET /team (ListTeamsUseCase) for an owner with no active/pending team', async () => {
        const { TeamDatabaseRepository } = require('@libs/organization/infrastructure/adapters/repositories/team.repository');
        const { TeamService } = require('@libs/organization/infrastructure/adapters/services/team.service');
        const { ListTeamsUseCase } = require('@libs/organization/application/use-cases/team/list.use-case');
        const typeormRepo = { find: async () => [] };
        const repo = new TeamDatabaseRepository(typeormRepo as any, {} as any);
        const service = new TeamService(repo);
        const useCase = new ListTeamsUseCase(service, {
            user: { uuid: 'u', organization: { uuid: 'o' }, role: 'owner' },
        } as any);
        try {
            out('row1', 'GET /team use case', await useCase.execute());
        } catch (e) {
            out('row1', 'GET /team use case THREW', (e as Error).message);
        }
    });

    it('row 1: GET /cli-reviews/:id for a CLI execution with no code_review_execution', async () => {
        const { CodeReviewExecutionRepository } = require('@libs/automation/infrastructure/adapters/repositories/codeReviewExecution.repository');
        const { CodeReviewExecutionService } = require('@libs/automation/infrastructure/adapters/services/codeReviewExecution.service');
        const { GetCliReviewByIdUseCase } = require('@libs/cli-review/application/use-cases/dashboard/get-cli-review-by-id.use-case');
        const qb: any = {};
        for (const m of ['leftJoin', 'select', 'where', 'andWhere', 'orderBy']) qb[m] = () => qb;
        qb.getMany = async () => [];
        const creRepo = new CodeReviewExecutionRepository({ createQueryBuilder: () => qb } as any);
        const creService = new CodeReviewExecutionService(creRepo);
        const execution = { uuid: 'e1', origin: 'cli', status: 'success', dataExecution: {}, createdAt: new Date(), updatedAt: new Date() };
        const useCase = new GetCliReviewByIdUseCase({ find: async () => [execution], findById: async () => execution } as any, creService);
        try {
            const r = await useCase.execute({ executionUuid: 'e1', organizationId: 'o' });
            out('row1', 'GET /cli-reviews/:id use case timeline', r.timeline);
        } catch (e) {
            out('row1', 'GET /cli-reviews/:id use case THREW', (e as Error).message);
        }
    });

    it('row 2: real golevelup consumer + RabbitMQErrorHandler, republish fails with Channel closed', async () => {
        const { AmqpConnection } = require('@golevelup/nestjs-rabbitmq');
        const { RabbitMQErrorHandler, createRabbitMQErrorHandlerWithFallback } = require('@libs/core/infrastructure/queue/rabbitmq-error.handler');
        const rejections: string[] = [];
        const onRej = (r: any) => rejections.push(String(r?.message ?? r));
        process.on('unhandledRejection', onRej);

        const handler = new RabbitMQErrorHandler(
            { publish: async () => { throw new Error('Channel closed'); } } as any,
            { get: () => undefined } as any,
        );
        handler.onModuleInit();

        let consumer: (msg: any) => void = () => undefined;
        const acks: string[] = [];
        const channel = {
            consume: async (_q: string, cb: any) => { consumer = cb; return { consumerTag: 't' }; },
            ack: () => acks.push('ack'),
            nack: () => acks.push('nack'),
        };
        const fakeConn: any = Object.create(AmqpConnection.prototype);
        fakeConn.outstandingMessageProcessing = new Set();
        fakeConn.logger = { error: () => undefined, warn: () => undefined, log: () => undefined };
        fakeConn.setupQueue = async () => 'q';
        fakeConn.deserializeMessage = () => ({ message: {}, headers: {} });
        fakeConn.registerConsumerForQueue = () => undefined;
        await AmqpConnection.prototype.setupSubscriberChannel.call(
            fakeConn,
            async () => { throw new Error('handler failed'); },
            { errorHandler: createRabbitMQErrorHandlerWithFallback('dlq.key') },
            channel,
            'qa2589',
        );
        consumer({
            content: Buffer.from('{}'),
            properties: { messageId: 'm-1', headers: {} },
            fields: { exchange: 'workflow.exchange', routingKey: 'rk' },
        });
        await new Promise((r) => setTimeout(r, 200));
        process.off('unhandledRejection', onRej);
        out('row2', 'unhandled rejections', rejections);
        out('row2', 'ack/nack calls on the original delivery', acks);
    });

    it('row 3: two logins persist the same refresh token (unique violation)', async () => {
        const logger = require('@libs/core/log/logger');
        const logged: Array<{ level: string; message: string; hasError: boolean }> = [];
        const spy = jest.spyOn(logger, 'createLogger');
        const fake = (level: string) => (e: any) => logged.push({ level, message: e?.message, hasError: !!e?.error });
        spy.mockReturnValue({ log: fake('log'), debug: fake('debug'), warn: fake('warn'), error: fake('error') } as any);
        jest.isolateModules(() => {
            const { AuthService } = require('@libs/identity/infrastructure/adapters/services/auth/auth.service');
            const dup = Object.assign(new Error('duplicate key value violates unique constraint "UQ_5fb5d6abb950a839551fe3c5de9"'), {
                driverError: { code: '23505', constraint: 'UQ_5fb5d6abb950a839551fe3c5de9' },
            });
            const svc = new AuthService(
                { get: () => ({ secret: 's', refreshSecret: 'r', expiresIn: '15m', refreshExpiresIn: '7d' }) } as any,
                {} as any,
                { saveRefreshToken: async () => { throw dup; } } as any,
                {} as any,
                {} as any,
            );
            (globalThis as any).__p = (svc as any).createAuth(
                { uuid: 'u', organization: { uuid: 'o' } },
                { accessToken: 'a', refreshToken: 'r' },
                'credentials',
            );
        });
        await (globalThis as any).__p;
        spy.mockRestore();
        out('row3', 'AuthService log entries for the duplicate insert', logged);
    });

    it('row 5: model returns a mangled / unknown issue id (resolve and merge paths)', async () => {
        const mod = require('@libs/issues/infrastructure/adapters/service/kodyIssuesManagement.service');
        const Svc = mod.KodyIssuesManagementService;
        const shown = '6a96d2e89ea5d12c21545480';
        const mangled = '6a96d2e89ea5d12c2154548'; // 23 chars, as in prod
        const calls: Array<[string, string]> = [];
        const issuesService: any = new Proxy({}, {
            get: (_t, name: string) => async (...args: any[]) => {
                if (typeof args[0] === 'string') calls.push([name, args[0]]);
                if (name === 'findByFileAndStatus') return [{ uuid: shown, title: 't', description: 'd' }];
                if (name === 'findById' && args[0] === mangled) throw new Error('Cast to ObjectId failed for value "' + mangled + '"');
                return null;
            },
        });
        // Inject by constructor position is brittle across commits: build bare and set the fields.
        const svc: any = Object.create(Svc.prototype);
        const warns: string[] = [];
        svc.logger = { warn: (e: any) => warns.push(e.message), error: (e: any) => warns.push('ERROR ' + e.message), log: () => undefined, debug: () => undefined };
        svc.issuesService = issuesService;
        svc.pullRequestsService = { findByNumberAndRepositoryName: async () => ({}) };
        svc.kodyIssuesAnalysisService = {
            resolveExistingIssues: async () => ({ issueVerificationResults: [{ issueId: mangled, isIssuePresentInCode: false }] }),
        };
        const ctx = { organizationAndTeamData: { organizationId: 'o', teamId: 't' }, repository: { id: 'r', name: 'r' }, pullRequest: { number: 1 } };
        // Merge path: the model matched a new suggestion to a mangled existing id.
        svc.createNewIssues = async (_c: any, s: any[]) => calls.push(['createNewIssues', s.map((x) => x.id).join(',')]);
        try {
            const arity = Svc.prototype.processMergeResult.length;
            const args: any[] = [ctx, { matches: [{ suggestionId: 's1', existingIssueId: mangled }] }, [{ id: 's1' }]];
            if (arity >= 4) args.push(new Set([shown]));
            await svc.processMergeResult(...args);
            out('row5', 'merge path: calls', calls.splice(0));
        } catch (e) {
            out('row5', 'merge path THREW', (e as Error).message);
            calls.splice(0);
        }
        out('row5', 'merge path: warn/error logs', warns.splice(0));
        svc.getChangedFiles = async () => [{ filename: 'src/a.ts', fileContent: 'code' }];
        try {
            await svc.resolveExistingIssues(ctx, [{ path: 'src/a.ts', status: 'modified', suggestions: [] }], undefined);
            out('row5', 'resolve path: issuesService calls with an id', calls.filter(([n]) => n !== 'findByFileAndStatus'));
        } catch (e) {
            out('row5', 'resolve path THREW', (e as Error).message);
        }
        out('row5', 'resolve path: warn/error logs', warns.splice(0));
    });

    it('row 6: symbol-references rule on a hunk that defines no symbol', async () => {
        const { retrieveForShard } = require('@libs/code-review/infrastructure/agents/collaborators/rule-context.retriever');
        const rule = (uuid: string) => ({ uuid, title: uuid, rule: 'x', contextNeed: { need: 'symbol-references', sourceHash: 'h', source: 'compiler', inferredAt: new Date(0) } });
        const file = (added: string[]) => ({
            filename: 'src/invoice.ts', status: 'modified', content: null, sha: 's', additions: 1, deletions: 0, changes: 1, blob_url: '', raw_url: '', contents_url: '',
            patch: ['@@ -10,2 +10,4 @@', ' const a = 1;', ...added].join('\n'),
        });
        const grepCalls: string[] = [];
        const lookup = () => ({ available: true, unavailableReason: '', grep: async (p: string) => { grepCalls.push(p); return 'src/other.ts:3: renderInvoice(x)'; }, read: async () => '', exists: async () => false, probe: async () => undefined, stats: { grep: 0, read: 0, exists: 0, failures: 0 } });
        const cases: Array<[string, string[]]> = [
            ['statements only (the prod case)', ['+  if (a > 0) {', '+    total += charge(a);']],
            ['adds a nameable function', ['+export function renderInvoice(order) {}']],
            ['adds a definition the extractor cannot name (async fn)', ['+export async function charge(amount) {']],
        ];
        for (const [label, added] of cases) {
            grepCalls.length = 0;
            const r = await retrieveForShard({ file: file(added), rules: [rule('r1')], lookup: lookup(), logger: { warn: () => undefined } });
            out('row6', label, { unmet: r.unmet.map((x: any) => x.uuid), slices: r.slices.map((s: any) => s.kind), grepCalls: grepCalls.length });
        }
    });
});
