# #2589 rows 7-11: harness specs (dropped untracked into a worktree at each commit, run with jest --config jest.config.ts)

## qa-r711-row7.spec.ts
```ts
// QA #2589 row 7: real IntentJudge -> real agent harness -> real AI SDK OpenAI-compatible
// provider, against a local HTTP endpoint that accepts the request and never answers
// (only the LLM endpoint is stubbed). Does the analyzer timeout cut the HTTP call?
import * as http from 'http';
import { randomBytes } from 'crypto';

process.env.API_CRYPTO_KEY = randomBytes(32).toString('hex');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encrypt } = require('@libs/common/utils/crypto');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IntentJudge } = require('@libs/agents/business-validation/judge/intent-judge');

jest.setTimeout(60_000);

it('analyzer timeout vs the in-flight LLM HTTP request', async () => {
    const t0 = Date.now();
    const events: string[] = [];
    const log = (s: string) => events.push(`+${Date.now() - t0}ms ${s}`);
    let requests = 0;
    const server = http.createServer((req, res) => {
        requests += 1;
        log(`request #${requests} ${req.method} ${req.url}`);
        req.resume();
        res.on('close', () => log(`request #${requests} connection closed by client (aborted)`));
        // never answer
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    const judge = new IntentJudge(
        {
            provider: 'openai_compatible',
            apiKey: encrypt('stub-key'),
            model: 'stub-model',
            baseURL: `http://127.0.0.1:${port}/v1`,
        },
        { analyzerTimeoutMs: 3000, analyzerMaxIterations: 1 },
        { organizationId: 'qa-org' },
    );
    const result = await judge.judge({
        instructions: 'SYS',
        task: { tracker: 'Linear', id: 'PLAT-41', title: 'Scale servings' },
        taskText: 'Task ID: PLAT-41',
        taskQuality: 'COMPLETE',
        diff: '+ code',
        userLanguage: 'en-US',
    });
    log(`judge returned reason=${result.reason} missingInfo=${JSON.stringify(result.missingInfo)}`);
    await new Promise((r) => setTimeout(r, 7000));
    log(`7s after the verdict: requests=${requests}, open connections=${await new Promise((r) => server.getConnections((_e, n) => r(n)))}`);
    // eslint-disable-next-line no-console
    console.log('ROW7\n' + events.join('\n'));
    server.closeAllConnections();
    server.close();
});
```

## qa-r711-row8.spec.ts
```ts
// QA #2589 row 8: KODUS_GET_DIFF_FOR_FILE called through a real MCP server and client
// (the SDK validates structuredContent against the tool's outputSchema, as in prod).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerFactory } from '@libs/mcp-server/services/mcp-server.factory';
import { CodeManagementTools } from '@libs/mcp-server/tools';

const files = [
    { filename: 'src/changed.ts', patch: '@@ -1 +1 @@\n-a\n+b' },
    { filename: 'assets/logo.png' }, // binary: GitHub sends no patch
];

async function connect() {
    const cm = new CodeManagementTools({
        getFilesByPullRequestId: async () => files,
    } as any);
    const factory = new McpServerFactory(
        cm,
        { getAllTools: () => [] } as any,
        { getAllTools: () => [] } as any,
        { authorize: async (_n: string, a: unknown) => a } as any,
    );
    const server = new McpServer({ name: 'kodus-code-management', version: '1.0.0' }, { capabilities: { tools: {} } });
    for (const t of (factory as any).getRegisteredTools()) server.registerTool(t.name, t.config, t.execute);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'qa', version: '1' });
    await client.connect(b);
    return client;
}

const base = { organizationId: 'org', teamId: 'team', repository: { id: 'r', name: 'r' }, prNumber: 7 };

describe('QA row 8 KODUS_GET_DIFF_FOR_FILE over MCP', () => {
    for (const filePath of ['src/changed.ts', 'src/not-in-pr.ts', 'assets/logo.png']) {
        it(filePath, async () => {
            const client = await connect();
            let out: unknown;
            try {
                const r = await client.callTool({ name: 'KODUS_GET_DIFF_FOR_FILE', arguments: { ...base, filePath } });
                out = { ok: true, isError: r.isError ?? false, structuredContent: r.structuredContent, content: r.isError ? r.content : undefined };
            } catch (e: any) {
                out = { ok: false, error: e.message };
            }
            // eslint-disable-next-line no-console
            console.log(`ROW8 ${filePath} => ${JSON.stringify(out)}`);
        });
    }
});
```

## qa-r711-row10.spec.ts
```ts
// QA #2589 row 10: real DocumentationSearchExaService formatter -> real LLM.run -> real AI SDK
// OpenAI-compatible provider, against a local endpoint standing in for a model without native
// structured output: it answers every request with the plain markdown document.
import * as http from 'http';
import { randomBytes } from 'crypto';

process.env.API_CRYPTO_KEY = randomBytes(32).toString('hex');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encrypt } = require('@libs/common/utils/crypto');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DocumentationSearchExaService } = require('@libs/code-review/infrastructure/adapters/services/documentation-search-exa.service');

jest.setTimeout(120_000);

const DOC = '## express res.redirect\n\n- `res.redirect([status,] path)` sets `Location` to `path`.\n- An undefined path throws `TypeError`.';

for (const fenced of [false, true]) {
    it(`formatter, model answers plain markdown${fenced ? ' wrapped in a ```markdown fence' : ''}`, async () => {
        const reqs: string[] = [];
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                const b = JSON.parse(body || '{}');
                reqs.push(`${req.url} response_format=${JSON.stringify(b.response_format?.type ?? null)} tools=${(b.tools || []).map((t: any) => t.function?.name).join(',') || 'none'} tool_choice=${JSON.stringify(b.tool_choice ?? null)}`);
                const content = fenced ? '```markdown\n' + DOC + '\n```' : DOC;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({
                    id: 'x', object: 'chat.completion', created: 1, model: 'stub-model',
                    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
                    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                }));
            });
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
        const port = (server.address() as any).port;
        const svc = new DocumentationSearchExaService({ get: () => undefined } as any, {} as any, {} as any);
        const warns: string[] = [];
        const orig = svc.logger.warn.bind(svc.logger);
        svc.logger.warn = (o: any) => { warns.push(o.message); return orig(o); };
        const out = await svc.formatDocumentationForPrompt({
            packageName: 'express',
            query: 'res.redirect undefined url',
            rawSearchContent: 'Express 4.x API. res.redirect([status,] path) Redirects to the URL derived from the specified path ...',
            organizationAndTeamData: { organizationId: 'qa-org', teamId: 'qa-team' },
            prNumber: 1,
            byokConfig: { provider: 'openai_compatible', apiKey: encrypt('stub-key'), model: 'stub-model', baseURL: `http://127.0.0.1:${port}/v1` },
        });
        // eslint-disable-next-line no-console
        console.log(`ROW10 fenced=${fenced}\n  requests=${reqs.length}\n  ${reqs.join('\n  ')}\n  service warnings=${JSON.stringify(warns)}\n  formatter output=${JSON.stringify(out)}`);
        server.close();
    });
}
```

## qa-r711-row11.spec.ts
```ts
// QA #2589 row 11: the real KodyLearningCronProvider inside a real Nest application, shut down
// mid-run. Only the database is stubbed: a provider that, like TypeORM, closes its connection in
// onApplicationShutdown and fails every later query with "Driver not Connected".
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Test } from '@nestjs/testing';

process.env.API_CRON_KODY_LEARNING = '0 0 * * *';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { KodyLearningCronProvider } = require('../apps/api/src/cron/kodyLearning.cron');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TEAM_SERVICE_TOKEN } = require('@libs/organization/domain/team/contracts/team.service.contract');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PARAMETERS_SERVICE_TOKEN } = require('@libs/organization/domain/parameters/contracts/parameters.service.contract');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenerateKodyRulesUseCase } = require('@libs/kodyRules/application/use-cases/generate-kody-rules.use-case');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GenerateInitialKodyRulesUseCase } = require('@libs/kodyRules/application/use-cases/generate-initial-kody-rules.use-case');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DistributedLockService } = require('@libs/core/workflow/infrastructure/distributed-lock.service');

let shutdownHook: unknown[] = [];
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    shutdownHook = [require('@libs/core/infrastructure/services/cron-run-gate').CronShutdownService];
} catch {
    shutdownHook = [];
}

jest.setTimeout(60_000);
const t0 = Date.now();
const events: string[] = [];
const log = (s: string) => events.push(`+${String(Date.now() - t0).padStart(5)}ms ${s}`);

@Injectable()
class FakeDb implements OnApplicationShutdown {
    connected = true;
    ok = 0;
    failed = 0;
    async query(what: string) {
        await new Promise((r) => setTimeout(r, 150));
        if (!this.connected) {
            this.failed += 1;
            log(`query ${what} -> Driver not Connected`);
            throw new Error('Driver not Connected');
        }
        this.ok += 1;
    }
    onApplicationShutdown() {
        this.connected = false;
        log('database connection closed (onApplicationShutdown)');
    }
}

it('kody learning cron run during shutdown', async () => {
    const db = new FakeDb();
    const teams = Array.from({ length: 30 }, (_, i) => ({ uuid: `team-${i}`, organization: { uuid: `org-${i}` } }));
    const moduleRef = await Test.createTestingModule({
        providers: [
            KodyLearningCronProvider,
            ...shutdownHook,
            { provide: FakeDb, useValue: db },
            { provide: TEAM_SERVICE_TOKEN, useValue: { findTeamsWithIntegrations: async () => { await db.query('teams'); return teams; } } },
            { provide: PARAMETERS_SERVICE_TOKEN, useValue: { findByKey: async (_k: string, o: any) => { await db.query(`platform_configs ${o.teamId}`); return { configValue: { kodyLearningStatus: 'disabled' } }; } } },
            { provide: GenerateKodyRulesUseCase, useValue: {} },
            { provide: GenerateInitialKodyRulesUseCase, useValue: {} },
            { provide: DistributedLockService, useValue: { acquire: async () => ({ release: async () => { await db.query('release lock'); } }) } },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const cron = app.get(KodyLearningCronProvider);
    log(`cron run starts (shutdown hook provided: ${shutdownHook.length > 0})`);
    const run = cron.handleCron().then(() => log('cron run ended'));
    await new Promise((r) => setTimeout(r, 1000));
    log('app.close() (SIGTERM at rollout)');
    await app.close();
    log('app closed');
    await run;
    log(`queries ok=${db.ok} failed after close=${db.failed}`);
    // eslint-disable-next-line no-console
    console.log('ROW11\n' + events.join('\n'));
});
```
