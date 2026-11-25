/* Real RabbitMQ (repo image, delayed-message plugin) + real WorkflowJobConsumer + real JobProcessorRouterService
 * + real InboxMessageRepository / WorkflowJobRepository on disposable Postgres. Roles: setup | worker. */
import { build, note, sleep, e2bState, providerCtl, ts } from './lib';
import { memRepos, cliTransport, buildGraphStack, pgDs } from './graph';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { WorkflowJobModel } from '@libs/core/workflow/infrastructure/repositories/schemas/workflow-job.model';
import { InboxMessageModel } from '@libs/core/workflow/infrastructure/repositories/schemas/inbox-message.model';
import { OutboxMessageModel } from '@libs/core/workflow/infrastructure/repositories/schemas/outbox-message.model';
import { WorkflowJobRepository } from '@libs/core/workflow/infrastructure/repositories/workflow-job.repository';
import { InboxMessageRepository } from '@libs/core/workflow/infrastructure/repositories/inbox-message.repository';
import { JobProcessorRouterService } from '@libs/core/workflow/infrastructure/job-processor-router.service';
import { WorkflowJobConsumer } from '@libs/core/workflow/infrastructure/workflow-job-consumer.service';
import { RabbitMQErrorHandler } from '@libs/core/infrastructure/queue/rabbitmq-error.handler';
import { WORKFLOW_JOB_QUEUE_ARGUMENTS } from '@libs/core/workflow/infrastructure/workflow-queue-arguments';
import { AstGraphBuildJobProcessor } from '@libs/code-review/workflow/ast-graph-build-job.processor';
import { AstGraphIncrementalJobProcessor } from '@libs/code-review/workflow/ast-graph-incremental-job.processor';
import { AstGraphRepository } from '@libs/code-review/infrastructure/adapters/repositories/astGraph.repository';
import { GraphIndexerService } from '@libs/code-review/infrastructure/adapters/services/graph/graph-indexer.service';
import { KodusGraphCli } from '@libs/code-review/infrastructure/adapters/services/graph/kodus-graph-cli';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const amqp = require('amqplib');
const FX = JSON.parse(fs.readFileSync(__dirname + '/fixtures.json', 'utf8'));
const ROLE = process.env.ROLE!; const NAME = process.env.ACTOR || ROLE;
const Q = { full: 'workflow.jobs.ast_graph_build.queue', incr: 'workflow.jobs.ast_graph_incremental.queue' } as any;
const RK = { full: 'AST_GRAPH_BUILD', incr: 'AST_GRAPH_INCREMENTAL' } as any;
async function wfDs() {
    const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 57127, username: 'postgres', password: 'qa2626', database: 'postgres', entities: [WorkflowJobModel, InboxMessageModel, OutboxMessageModel], synchronize: false });
    await ds.initialize(); return ds;
}
(async () => {
    const type = process.env.JOBTYPE || 'incr';
    const conn = await amqp.connect('amqp://qa:qa2626@localhost:57128'); const ch = await conn.createConfirmChannel();
    await ch.assertExchange('workflow.exchange', 'topic', { durable: true });
    await ch.assertExchange('workflow.exchange.delayed', 'x-delayed-message', { durable: true, arguments: { 'x-delayed-type': 'topic' } });
    await ch.assertExchange('workflow.exchange.dlx', 'topic', { durable: true });
    await ch.assertQueue(Q[type], { durable: true, arguments: (WORKFLOW_JOB_QUEUE_ARGUMENTS as any)[Q[type]] });
    for (const ex of ['workflow.exchange', 'workflow.exchange.delayed']) await ch.bindQueue(Q[type], ex, `workflow.jobs.*.${RK[type]}`);
    if (ROLE === 'setup') {
        const sds = await pgDs(); await sds.query('CREATE SCHEMA IF NOT EXISTS kodus_workflow'); await sds.destroy();
        const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 57127, username: 'postgres', password: 'qa2626', database: 'postgres', entities: [WorkflowJobModel, InboxMessageModel, OutboxMessageModel], synchronize: true });
        await ds.initialize();
        const jobRepo = new WorkflowJobRepository(ds.getRepository(WorkflowJobModel));
        const repoId = process.env.REPO_ID!; const org = process.env.ORG ?? '11111111-1111-4111-8111-111111111111';
        const payload: any = { repositoryId: repoId, cloneUrl: 'x', defaultBranch: 'main', fullName: 'org/athena', platform: 'github', changedFiles: FX.changed, newSha: 'beef' };
        if (process.env.NO_OTD !== '1') payload.organizationAndTeamData = { organizationId: org, teamId: 't' };
        const job: any = await jobRepo.create({ correlationId: 'qa2626', workflowType: RK[type], handlerType: 'SIMPLE_FUNCTION', payload, status: 'PENDING', priority: 0, retryCount: 0, maxRetries: 3, organizationId: process.env.NO_OTD === '1' ? undefined : org, teamId: 't' } as any);
        const messageId = randomUUID();
        ch.publish('workflow.exchange', `workflow.jobs.${org}.${RK[type]}`, Buffer.from(JSON.stringify({ jobId: job.uuid ?? job.id, correlationId: 'qa2626' })), { messageId, persistent: true, contentType: 'application/json' });
        await ch.waitForConfirms();
        note('setup.done', { jobId: job.uuid ?? job.id, messageId });
        await ch.close(); await conn.close(); await ds.destroy(); process.exit(0);
    }
    // worker
    const { mgr } = await build(process.env.DB!);
    const ds = await wfDs();
    const jobRepo = new WorkflowJobRepository(ds.getRepository(WorkflowJobModel));
    const inboxRepo = new InboxMessageRepository(ds.getRepository(InboxMessageModel));
    const gds = await pgDs();
    const mem = memRepos(process.env.REPO_ID!, type === 'incr' ? 'ready' : 'pending');
    const astRepo = new AstGraphRepository(null as any, null as any, gds);
    const indexer = new GraphIndexerService(astRepo, mem.repositoryService, new KodusGraphCli());
    const full = new AstGraphBuildJobProcessor(jobRepo, mgr, mem.codeManagementService, indexer, mem.repositoryService);
    const incr = new AstGraphIncrementalJobProcessor(jobRepo, mgr, mem.codeManagementService, indexer, mem.repositoryService);
    const stub: any = { process: async () => { throw new Error('not used'); } };
    const router = new JobProcessorRouterService(jobRepo, stub, stub, stub, full, incr, stub, stub);
    const obs: any = { setContext: () => {}, runInSpan: async (_n: string, fn: any) => fn({ setAttributes: () => {} }) };
    const prot: any = { protectTask: async () => {}, unprotectTask: async () => {} };
    const consumer = new WorkflowJobConsumer(router, inboxRepo, jobRepo, obs, prot);
    const pending: Promise<void>[] = [];
    const errh = new RabbitMQErrorHandler({ publish: async (ex: string, rk: string, c: Buffer, o: any) => { note('amqp.republish', { ex, rk, retry: o.headers?.['x-retry-count'], delay: o.headers?.['x-delay'] }); const target = ex === 'workflow.exchange.delayed' ? 'workflow.exchange' : ex; const d = ex === 'workflow.exchange.delayed' ? Number(o.headers?.['x-delay'] || 0) : 0;
            /* shim: the local delayed-message exchange (plugin 4.2.0 on 4.2.2) routed nothing in a probe, so the delay is applied here and the copy goes to the base exchange */
            pending.push((async () => { if (d) await sleep(d); ch.publish(target, rk, c, o); await ch.waitForConfirms(); note('amqp.republish.confirmed', { target, delayAppliedMs: d }); })()); } } as any,
        { get: (k: string) => (k.endsWith('RETRY_DELAY_MS') ? Number(process.env.RETRY_DELAY_MS || 1000) : k.endsWith('MAX_RETRIES') ? 3 : undefined) } as any);
    let failParseLeft = Number(process.env.FAIL_PARSE_TIMES || 0);
    providerCtl.run = cliTransport({ graph: () => (type === 'full' ? FX.F : FX.I_parse), onParse: () => {} });
    const baseRun = providerCtl.run;
    providerCtl.run = async (cmd: string, id: string) => { if (cmd.includes('parse') && failParseLeft > 0) { failParseLeft--; note('cli.parse.fail(503)', { id }); throw new Error('503 sandbox unavailable'); } return baseRun!(cmd, id); };
    providerCtl.readFile = async () => JSON.stringify(type === 'full' ? FX.F : FX.I_parse);
    if (process.env.KILL) { e2bState.killDefault = process.env.KILL as any; }
    await ch.prefetch(1);
    let handled = 0;
    let tag = '';
    const sub = await ch.consume(Q[type], async (msg: any) => {
        const body = JSON.parse(msg.content.toString());
        note('amqp.delivery', { actor: NAME, messageId: msg.properties.messageId, retry: msg.properties.headers?.['x-retry-count'] ?? 0, redelivered: msg.fields.redelivered });
        const t0 = Date.now();
        try {
            await (type === 'incr' ? (consumer as any).handleAstGraphIncrementalJob(body, msg) : (consumer as any).handleAstGraphBuildJob(body, msg));
            ch.ack(msg); note('amqp.acked', { actor: NAME, ms: Date.now() - t0 });
        } catch (e: any) {
            note('consumer.threw', { actor: NAME, err: String(e?.message).slice(0, 160), ms: Date.now() - t0 });
            await errh.handle(ch, msg, e);
        }
        handled++;
        if (process.env.EXIT_AFTER && handled >= Number(process.env.EXIT_AFTER)) { await ch.cancel(tag); note('consumer.cancelled', { actor: NAME }); await Promise.all(pending); note('worker.exit', { actor: NAME }); await sleep(200); process.exit(0); }
    });
    tag = sub.consumerTag;
    note('ready', { actor: NAME });
})().catch((e) => { console.error('QWORKER ERROR', e); process.exit(1); });
