/**
 * QA harness for #2428 / PR #2580. Runs the REAL KodyRulesAgentProvider.execute,
 * KodyRuleDetectorCompilerService.compileAndSave and a plain LLM.run (no
 * promptCache, the generateSummaryPR shape) against every BYOK provider, with
 * every outgoing request redirected to a local stub HTTP server that records the
 * body. Nothing leaves 127.0.0.1: net/tls connect to any other host throws.
 */
import * as http from 'http';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import * as path from 'path';
import { generateKeyPairSync } from 'crypto';
import { encrypt } from '@libs/common/utils/crypto';
import { LLM } from '@libs/llm/llm';
import { KodyRulesAgentProvider } from '@libs/code-review/infrastructure/agents/providers/kody-rules-agent.provider';
import { KodyRuleDetectorCompilerService } from '@libs/ee/kodyRules/service/kody-rule-detector-compiler.service';

const OUT = process.env.QA_OUT!;
const DELAY_MS = 400;

// ── network guard ───────────────────────────────────────────────────────────
const blocked: string[] = [];
const isLocal = (h?: string | null) =>
    !h || h === '127.0.0.1' || h === 'localhost' || h === '::1';
const origNetConnect = net.connect;
(net as any).connect = (net as any).createConnection = function (...a: any[]) {
    const o = typeof a[0] === 'object' ? a[0] : { port: a[0], host: a[1] };
    if (!isLocal(o.host)) {
        blocked.push(String(o.host));
        throw new Error(`QA guard: blocked connect to ${o.host}`);
    }
    return (origNetConnect as any).apply(net, a);
};
(tls as any).connect = function (...a: any[]) {
    const o = typeof a[0] === 'object' ? a[0] : { host: a[1] };
    blocked.push(String(o.host ?? o.servername));
    throw new Error(`QA guard: blocked tls connect to ${o.host}`);
};

// ── stub server ─────────────────────────────────────────────────────────────
type Rec = {
    t0: number;
    t1?: number;
    url: string;
    body: any;
    file: string | null;
};
let records: Rec[] = [];
let failFirstFor: string | null = null;
let failedOnce = false;
let port = 0;
let server: http.Server;

function fileOf(raw: string): string | null {
    const m = /<File path=\\?"([^"\\]+)/.exec(raw);
    return m ? m[1] : null;
}

function answer(url: string, body: any, raw: string): any {
    const isCompiler = raw.includes('mechanical');
    const json = isCompiler
        ? { mechanical: false, reason: 'semantic', contextNeed: 'diff-only' }
        : { violations: [] };
    const text = JSON.stringify(json);
    if (/oauth2|\/token/.test(url))
        return { access_token: 'fake', expires_in: 3600, token_type: 'Bearer' };
    if (/\/converse/.test(url)) {
        const tool = body.toolConfig?.tools?.[0]?.toolSpec?.name;
        return {
            output: {
                message: {
                    role: 'assistant',
                    content: tool
                        ? [{ toolUse: { toolUseId: 't1', name: tool, input: json } }]
                        : [{ text }],
                },
            },
            stopReason: tool ? 'tool_use' : 'end_turn',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
    }
    if (/messages|rawPredict/.test(url)) {
        const tool = body.tools?.[0]?.name;
        return {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: body.model ?? 'claude',
            content: tool
                ? [{ type: 'tool_use', id: 'tu_1', name: tool, input: json }]
                : [{ type: 'text', text }],
            stop_reason: tool ? 'tool_use' : 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
        };
    }
    if (/\/responses/.test(url)) {
        return {
            id: 'resp_1',
            object: 'response',
            created_at: 1,
            status: 'completed',
            model: body.model,
            output: [
                {
                    type: 'message',
                    id: 'm1',
                    status: 'completed',
                    role: 'assistant',
                    content: [{ type: 'output_text', text, annotations: [] }],
                },
            ],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        };
    }
    if (/chat\/completions/.test(url)) {
        const tool = body.tools?.[0]?.function?.name;
        return {
            id: 'c1',
            object: 'chat.completion',
            created: 1,
            model: body.model,
            choices: [
                {
                    index: 0,
                    finish_reason: tool ? 'tool_calls' : 'stop',
                    message: tool
                        ? {
                              role: 'assistant',
                              content: null,
                              tool_calls: [
                                  {
                                      id: 'tc1',
                                      type: 'function',
                                      function: { name: tool, arguments: text },
                                  },
                              ],
                          }
                        : { role: 'assistant', content: text },
                },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
    }
    if (/generateContent/.test(url)) {
        return {
            candidates: [
                {
                    content: { role: 'model', parts: [{ text }] },
                    finishReason: 'STOP',
                },
            ],
            usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 5,
                totalTokenCount: 15,
            },
        };
    }
    return { error: `unhandled ${url}` };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
    const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    const local = `http://127.0.0.1:${port}/${u.host}${u.pathname}${u.search}`;
    return realFetch(local, init);
}) as any;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            const url = req.url ?? '';
            let body: any = {};
            try {
                body = JSON.parse(raw);
            } catch {
                body = { raw };
            }
            const rec: Rec = { t0: Date.now(), url, body, file: fileOf(raw) };
            if (!/oauth2|\/token/.test(url)) records.push(rec);
            const fail =
                failFirstFor && rec.file === failFirstFor && !failedOnce;
            if (fail) failedOnce = true;
            setTimeout(() => {
                rec.t1 = Date.now();
                if (fail) {
                    res.writeHead(Number(process.env.QA_FAIL_STATUS ?? 429), { 'content-type': 'application/json', 'retry-after': '1' });
                    res.end(JSON.stringify({ type: 'error', error: { message: 'stub rate limit', type: 'rate_limit_error' } }));
                    return;
                }
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(answer(url, body, raw)));
            }, /oauth2|\/token/.test(url) ? 0 : DELAY_MS);
        });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as net.AddressInfo).port;
    fs.mkdirSync(OUT, { recursive: true });
});
afterAll(async () => {
    await new Promise((r) => server.close(r));
    fs.writeFileSync(path.join(OUT, '_blocked.json'), JSON.stringify(blocked));
});

// ── slots ───────────────────────────────────────────────────────────────────
const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const fakeSa = Buffer.from(
    JSON.stringify({
        type: 'service_account',
        project_id: 'qa-fake',
        private_key_id: 'x',
        private_key: privateKey,
        client_email: 'qa@qa-fake.iam.gserviceaccount.com',
        client_id: '1',
        token_uri: 'https://oauth2.googleapis.com/token',
    }),
).toString('base64');

// google-auth-library: hand back a fake token without a JWT exchange.
try {
    const vdir = path.dirname(require.resolve('@ai-sdk/google-vertex/package.json'));
    const ga = require(require.resolve('google-auth-library', { paths: [vdir] }));
    ga.GoogleAuth.prototype.getClient = async function () {
        return {
            getAccessToken: async () => ({ token: 'fake' }),
            getRequestHeaders: async () => ({ Authorization: 'Bearer fake' }),
        };
    };
    ga.GoogleAuth.prototype.getAccessToken = async () => 'fake';
    ga.GoogleAuth.prototype.getProjectId = async () => 'qa-fake';
} catch (e) {
    // eslint-disable-next-line no-console
    console.warn('vertex auth patch failed', e);
}

const SLOTS: Record<string, any> = {
    anthropic: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    bedrock_claude: {
        provider: 'amazon_bedrock',
        model: 'us.anthropic.claude-sonnet-5-5',
        region: 'us-east-1',
        awsRegion: 'us-east-1',
    },
    bedrock_nova: {
        provider: 'amazon_bedrock',
        model: 'us.amazon.nova-pro-v1:0',
        region: 'us-east-1',
        awsRegion: 'us-east-1',
    },
    vertex_claude: {
        provider: 'google_vertex',
        model: 'claude-sonnet-5-5',
        vertexLocation: 'us-east5',
        key: fakeSa,
    },
    openai_gpt56: { provider: 'openai', model: 'gpt-5.6-terra' },
    openai_gpt61: { provider: 'openai', model: 'gpt-6.1-sol' },
    openai_gpt55: { provider: 'openai', model: 'gpt-5.5' },
    azure_gpt61: {
        provider: 'openai',
        model: 'gpt-6.1-sol',
        baseURL: 'https://qa-fake.openai.azure.com/openai/v1',
    },
    azure_module: {
        provider: 'azure',
        model: 'gpt-6-1-deploy',
        baseURL: 'https://qa-fake.openai.azure.com/openai',
    },
    openai_compatible_deepseek: {
        provider: 'openai_compatible',
        model: 'accounts/fireworks/models/deepseek-v4p1-flash',
        baseURL: 'https://api.fireworks.ai/inference/v1',
    },
    open_router_claude: {
        provider: 'open_router',
        model: 'anthropic/claude-sonnet-5-5',
    },
    gemini: { provider: 'google_gemini', model: 'gemini-3-pro' },
    kodus_deepseek: {
        provider: 'kodus',
        model: 'fireworks/accounts/fireworks/models/deepseek-v4p1-flash',
    },
    anthropic_compatible: {
        provider: 'anthropic_compatible',
        model: 'claude-sonnet-5-5',
        baseURL: 'https://qa-fake-gateway.example/anthropic',
    },
};

const only = (process.env.QA_ONLY ?? '').split(',').filter(Boolean);
const slotFor = (name: string) => {
    const s = SLOTS[name];
    return {
        ...s,
        apiKey: encrypt(s.key ?? 'qa-fake-key'),
        fallback: undefined,
        ...(process.env.QA_OVERRIDE
            ? { reasoningConfigOverride: process.env.QA_OVERRIDE }
            : {}),
    };
};

const RULES = [
    {
        uuid: '11111111-0000-0000-0000-000000000001',
        title: 'No any in TypeScript',
        rule: 'Do not use the any type in TypeScript code. Use unknown or a precise type.',
        status: 'active',
        severity: 'high',
        path: '**/*.ts',
    },
    {
        uuid: '11111111-0000-0000-0000-000000000002',
        title: 'Markdown title case',
        rule: 'Markdown headings use title case.',
        status: 'active',
        severity: 'low',
        path: '**/*.md',
    },
    {
        uuid: '11111111-0000-0000-0000-000000000003',
        title: 'No print in Python',
        rule: 'Use logging instead of print in Python modules.',
        status: 'active',
        severity: 'medium',
        path: '**/*.py',
    },
];
const FILES = [
    ...Array.from({ length: 8 }, (_, i) => ({
        filename: `src/f${i + 1}.ts`,
        patch: `@@ -1,1 +1,2 @@\n const a = 1;\n+const x${i}: any = ${i};`,
        patchWithLinesStr: `1  const a = 1;\n2 +const x${i}: any = ${i};`,
    })),
    { filename: 'docs/a.md', patch: '@@ -1 +1 @@\n+# hello world', patchWithLinesStr: '1 +# hello world' },
    { filename: 'docs/b.md', patch: '@@ -1 +1 @@\n+# another one', patchWithLinesStr: '1 +# another one' },
    { filename: 'tools/run.py', patch: '@@ -1 +1 @@\n+print(1)', patchWithLinesStr: '1 +print(1)' },
];

function dump(name: string, extra: any = {}) {
    fs.writeFileSync(
        path.join(OUT, `${name}.json`),
        JSON.stringify({ ...extra, records }, null, 1),
    );
    records = [];
}

const names = Object.keys(SLOTS).filter((n) => !only.length || only.includes(n));

describe.each(names)('provider %s', (name) => {
    jest.setTimeout(120_000);

    it('kody rules review (real provider.execute)', async () => {
        records = [];
        failFirstFor = process.env.QA_FAIL_FILE ?? 'src/f5.ts'; // one sibling's first attempt gets a 429
        failedOnce = false;
        const slot = slotFor(name);
        const provider = new KodyRulesAgentProvider(
            { resolveTaskSlot: async () => slot } as any,
            {} as any,
        );
        const logs: any[] = [];
        const sl = (provider as any).shardLogger;
        if (sl?.log) {
            const orig = sl.log.bind(sl);
            sl.log = (e: any) => {
                logs.push(e);
                return orig(e);
            };
        }
        let err: string | undefined;
        try {
            await provider.execute({
                prNumber: 7,
                organizationAndTeamData: { organizationId: 'org-qa', teamId: 'team-qa' },
                changedFiles: FILES,
                prTitle: 'QA 2428 harness',
                prBody: 'Exercises the shard prompt cache.',
                remoteCommands: undefined,
                kodyRules: RULES,
            } as any);
        } catch (e: any) {
            err = String(e?.message ?? e);
        }
        failFirstFor = null;
        dump(`${name}.kody`, {
            err,
            cacheLog: logs.filter((l) => /prompt cache/.test(l?.message ?? '')).map((l) => l.message),
        });
    });

    it('detector compiler (real compileAndSave)', async () => {
        records = [];
        const slot = slotFor(name);
        const svc = new KodyRuleDetectorCompilerService(
            { resolveTaskSlot: async () => slot } as any,
            {} as any,
            { updateRuleDetector: async () => ({}), updateRuleCompileAttempt: async () => ({}) } as any,
        );
        let err: string | undefined;
        try {
            await svc.compileAndSave({ organizationId: 'org-qa', teamId: 'team-qa' } as any, 'r1', {
                uuid: 'r1',
                title: 'no console',
                rule: 'do not use console.log',
                examples: [{ isCorrect: false, snippet: 'console.log(x)' }],
            } as any);
        } catch (e: any) {
            err = String(e?.message ?? e);
        }
        dump(`${name}.compiler`, { err });
    });

    it('plain one-shot call without promptCache (generateSummaryPR shape)', async () => {
        records = [];
        let err: string | undefined;
        try {
            await LLM.run({
                byokConfig: slotFor(name),
                system: 'You summarize pull requests.',
                user: 'Summarize this PR: adds a thing.',
                runName: 'qa-2428.plain',
                organizationId: 'org-qa',
            } as any);
        } catch (e: any) {
            err = String(e?.message ?? e);
        }
        dump(`${name}.plain`, { err });
    });
});
