// H5: real KodyRulesAgentProvider.execute -> real runJudge -> real LLM.run -> AI SDK
// openai-compatible -> local fake HTTP server. Only the provider endpoint is fake.
import * as http from 'node:http';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { encrypt } from '@libs/common/utils/crypto';
import { KodyRulesAgentProvider } from '@libs/code-review/infrastructure/agents/providers/kody-rules-agent.provider';
import { convertToUnifiedDiffWithLineNumbers } from '@libs/common/utils/patch';
import {
    KodyRulesScope,
    KodyRulesType,
} from '@libs/kodyRules/domain/interfaces/kodyRules.interface';

type Reply = { status: number; body: any; delayMs?: number };
type Script = (n: number, req: { body: any; isPr: boolean }) => Reply;

interface Rec { t: number; server: string; n: number; isPr: boolean; status: number; file?: string }

function startServer(name: string, script: Script, log: Rec[]) {
    let n = 0;
    const srv = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', async () => {
            if (!req.url?.includes('chat/completions')) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ data: [{ id: 'fake-model' }] }));
                return;
            }
            const body = JSON.parse(raw || '{}');
            const sys = String(body.messages?.[0]?.content ?? '');
            const user = JSON.stringify(body.messages?.slice(1) ?? []);
            const isPr = /must explain the grade-write change/.test(user);
            const fileM = /## file: '([^']+)'/.exec(user);
            const my = ++n;
            const r = script(my, { body, isPr });
            log.push({ t: Date.now(), server: name, n: my, isPr, status: r.status, file: fileM?.[1] });
            if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
            res.writeHead(r.status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(r.body));
        });
    });
    return new Promise<{ url: string; close: () => void }>((ok) =>
        srv.listen(0, '127.0.0.1', () => {
            const port = (srv.address() as any).port;
            ok({ url: `http://127.0.0.1:${port}/v1`, close: () => srv.close() });
        }),
    );
}

const okBody = (content: string) => ({
    id: 'x', object: 'chat.completion', created: 0, model: 'fake-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const OK = (): Reply => ({ status: 200, body: okBody(JSON.stringify({ violations: [] })) });
const OK_VIOL = (): Reply => ({
    status: 200,
    body: okBody(JSON.stringify({ violations: [{ ruleId: 1, suggestionContent: 'Grade write without owner check', relevantLinesStart: 3, relevantLinesEnd: 3, needsRepositoryEvidence: false }] })),
});
const err = (status: number, message: string, extra: any = {}): Reply => ({ status, body: { error: { message, ...extra } } });
const CAP = () => err(429, 'Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.');
const RATE = () => err(429, 'Rate limit reached for requests');
const AUTH = () => err(401, 'Incorrect API key provided: sk-fake***. You can find your API key at https://platform.openai.com/account/api-keys.');
const NOTFOUND = () => err(404, 'No endpoints found for fake-model.');
const MOD = () => ({ status: 403, body: { error: { message: 'fake-model requires moderation on OpenRouter. Your input was flagged for "violence".', code: 403, metadata: { reasons: ['violence'], flagged_input: 'grade...' } } } });
const KEYLIM = () => ({ status: 403, body: { error: { message: 'Key limit exceeded (monthly limit). Manage it using https://openrouter.ai/workspaces/default/keys/<key> $10.02 of $10.00 used; resets 2026-12-01T00:00:00.000Z.', code: 403 } } });
const WEEKLY = () => err(429, 'you (someone) have reached your weekly usage limit, resets in 3 days');
const TOKENPLAN = () => err(429, 'Token Plan rate limit reached: Upgrade your Token Plan or switch to pay-as-you-go API usage. (2062)');
const QUOTA_TEXT = (): Reply => ({ status: 200, body: okBody('Your quota exceeded for this class; the model not found the teacher check. legacyBilling does not exist.') });

// Real producer for the changed files: a real git repo, real `git diff`, real line-number conversion.
function realChangedFiles(count: number) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h5repo-'));
    const g = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
    g('init', '-q'); g('config', 'user.email', 'h@x'); g('config', 'user.name', 'h');
    fs.mkdirSync(path.join(dir, 'qa2744/rules'), { recursive: true });
    for (let i = 0; i < count; i++)
        fs.writeFileSync(path.join(dir, `qa2744/rules/grade-service-${i}.ts`), `export class GradeService${i} {\n  constructor(private repo: any) {}\n}\n`);
    g('add', '.'); g('commit', '-qm', 'base');
    for (let i = 0; i < count; i++)
        fs.writeFileSync(path.join(dir, `qa2744/rules/grade-service-${i}.ts`), `export class GradeService${i} {\n  constructor(private repo: any) {}\n  async writeGrade(classId: string, studentId: string, value: number) {\n    return this.repo.save({ classId, studentId, value });\n  }\n}\n`);
    const files = [];
    for (let i = 0; i < count; i++) {
        const f = `qa2744/rules/grade-service-${i}.ts`;
        const patch = g('diff', '--', f).split('\n').slice(4).join('\n');
        files.push({ filename: f, status: 'modified', patch, patchWithLinesStr: convertToUnifiedDiffWithLineNumbers(patch, { filename: f }) });
    }
    fs.rmSync(dir, { recursive: true, force: true });
    return files;
}

const ORG = { organizationId: '11111111-1111-1111-1111-111111111111', teamId: '22222222-2222-2222-2222-222222222222' };

function slotFor(url: string, fallbackUrl?: string): any {
    const s: any = {
        provider: 'openai_compatible', apiKey: encrypt('fake-not-a-key'), model: 'fake-model', baseURL: url,
        byokModelId: 'm-main', credentialId: 'c-main', maxInputTokens: 128000,
    };
    if (fallbackUrl) s.fallback = { ...s, baseURL: fallbackUrl, apiKey: encrypt('fake-fallback'), byokModelId: 'm-fb', credentialId: 'c-fb', model: 'fake-model' };
    return s;
}

const rules = (layout: 'shared' | 'distinct', files: any[], withPr: boolean) => {
    const base = { type: KodyRulesType.STANDARD, status: 'active', severity: 'high', origin: 'manual', scope: KodyRulesScope.FILE };
    const out: any[] = layout === 'shared'
        ? [{ ...base, uuid: 'r-owner', title: 'Check teacher owns the class', rule: 'Every service method that writes a grade must check the teacher owns the class.', path: 'qa2744/**' }]
        : files.map((f, i) => ({ ...base, uuid: `r-owner-${i}`, title: `Owner check ${i}`, rule: `Rule variant ${i}: every service method that writes a grade must check the teacher owns the class.`, path: f.filename }));
    if (withPr) out.push({ ...base, uuid: 'r-pr', title: 'PR description', rule: 'The PR description must explain the grade-write change.', scope: KodyRulesScope.PULL_REQUEST });
    return out;
};

async function run(name: string, opts: { main: Script; fb?: Script; layout?: 'shared' | 'distinct'; files?: number; custom?: () => { files: any[]; rules: any[] } }) {
    const log: Rec[] = [];
    const main = await startServer('main', opts.main, log);
    const fb = opts.fb ? await startServer('fallback', opts.fb, log) : undefined;
    const custom = opts.custom?.();
    const files = custom?.files ?? realChangedFiles(opts.files ?? 12);
    const warns: any[] = [];
    const logs: any[] = [];
    const provider = new KodyRulesAgentProvider(
        { resolveTaskSlot: async () => slotFor(main.url, fb?.url) } as any,
        {} as any,
    );
    (provider as any).shardLogger = { warn: (e: any) => warns.push(e), log: (e: any) => logs.push(e), error: (e: any) => warns.push(e) };
    const t0 = Date.now();
    let outcome: any;
    try {
        const out = await provider.execute({
            prNumber: 2744, organizationAndTeamData: ORG, changedFiles: files, remoteCommands: undefined,
            prTitle: 'qa2744 grades', prBody: 'grade writes', kodyRules: custom?.rules ?? rules(opts.layout ?? 'shared', files, true),
        } as any);
        outcome = { ok: true, suggestions: out.suggestions?.length };
    } catch (e: any) {
        outcome = { ok: false, error: String(e?.message ?? e).slice(0, 200) };
    }
    const ms = Date.now() - t0;
    main.close(); fb?.close();
    const refusal = warns.find((w) => /the model provider refused/.test(w?.message ?? ''));
    const done = [...logs, ...warns].map((w) => w?.message ?? '').find((m) => /\(sharded\) done|shards,/.test(m));
    const shardFailed = warns.filter((w) => /file shard failed/.test(w?.message ?? '')).length;
    const byServer = (s: string) => log.filter((r) => r.server === s);
    const res = {
        name, ms,
        requests_main: byServer('main').length, requests_fallback: byServer('fallback').length,
        pr_shard_requests: log.filter((r) => r.isPr).length,
        statuses_main: byServer('main').map((r) => r.status).join(','),
        refusal_log: refusal ? { message: refusal.message, metadata: { category: refusal.metadata?.category, shardsRun: refusal.metadata?.shardsRun, shardsErrored: refusal.metadata?.shardsErrored } } : null,
        shard_failed_warns: shardFailed, done_line: done ?? null, outcome,
        timeline: log.map((r) => `${r.t - t0}ms ${r.server}#${r.n} ${r.status}${r.isPr ? ' PR' : ''}`),
    };
    console.log('RESULT ' + JSON.stringify(res));
    return res;
}

const scenarios: Record<string, () => Promise<any>> = {
    S21_shared: () => run('S21 spend cap, 12 files one rule (shared head) + PR rule', { main: () => CAP() }),
    S21_distinct: () => run('S21 spend cap, 12 files distinct rules + PR rule', { main: () => CAP(), layout: 'distinct' }),
    S24: () => run('S24 slow success in flight + 2 refusals', {
        layout: 'distinct',
        main: (n) => (n === 1 ? { ...OK_VIOL(), delayMs: 3000 } : n === 2 || n === 3 ? CAP() : OK_VIOL()),
    }),
    S24b: () => run('S24b two slow successes in flight + 2 refusals land first', {
        layout: 'distinct',
        main: (n) => (n === 1 || n === 4 ? { ...OK_VIOL(), delayMs: 3000 } : n === 2 || n === 3 ? CAP() : OK_VIOL()),
    }),
    S25a: () => run('S25a 3 moderation 403', { layout: 'distinct', main: (n) => (n <= 3 ? MOD() : OK()) }),
    S25b: () => run('S25b 3 schema-failed replies mentioning quota', { layout: 'distinct', main: (n) => (n <= 3 ? QUOTA_TEXT() : OK()) }),
    S25c: () => run('S25c 401, cap, 401 alternating', { layout: 'distinct', main: (n) => (n <= 3 ? [AUTH, CAP, AUTH][n - 1]() : OK()) }),
    S26: () => run('S26 main spend cap, fallback 200', { layout: 'distinct', main: () => CAP(), fb: () => OK() }),
    S28_401: () => run('S28 401 invalid key', { layout: 'distinct', main: () => AUTH() }),
    S28_404: () => run('S28 404 no endpoints', { layout: 'distinct', main: () => NOTFOUND() }),
    S34: () => run('S34 400 rules x 300 large files (SLOW-SYNC labels)', {
        main: () => AUTH(),
        custom: () => {
            const base = realChangedFiles(1)[0];
            const big = Array.from({ length: 2000 }, (_, i) => `+  const grade${i} = await this.repo.save({ classId, studentId, value: ${i} }); // SECRET-CONTENT-MARKER`).join('\n');
            const files = Array.from({ length: 600 }, (_, i) => ({ filename: `qa2744/rules/big-${i}.ts`, status: 'modified', patch: base.patch + '\n' + big, patchWithLinesStr: base.patchWithLinesStr + '\n' + big }));
            const b = { type: KodyRulesType.STANDARD, status: 'active', severity: 'high', origin: 'manual', scope: KodyRulesScope.FILE, path: 'qa2744/**' };
            const rules = Array.from({ length: 1600 }, (_, i) => i % 2
                ? { ...b, uuid: `sem-${i}`, title: `Semantic ${i}`, rule: `RULE-TEXT-MARKER ${i}: every service method that writes a grade must check the teacher owns the class.` }
                : { ...b, uuid: `det-${i}`, title: `Detector ${i}`, rule: `RULE-TEXT-MARKER ${i}: no grade${i}x writes`, detector: { type: 'regex', pattern: `grade${i}x\\s*=\\s*await\\s+this\\.repo\\.save\\(\\{[^}]*\\}\\)`, flags: '' } });
            return { files, rules };
        },
    }),
    S34b: () => run('S34b 6000 rules x 3000 files (format rules label)', {
        main: () => AUTH(),
        custom: () => {
            const base = realChangedFiles(1)[0];
            const files = Array.from({ length: 3000 }, (_, i) => ({ filename: `qa2744/rules/f-${i}.ts`, status: 'modified', patch: base.patch, patchWithLinesStr: base.patchWithLinesStr }));
            const b = { type: KodyRulesType.STANDARD, status: 'active', severity: 'high', origin: 'manual', scope: KodyRulesScope.FILE };
            const rules = Array.from({ length: 6000 }, (_, i) => ({ ...b, uuid: `sem-${i}`, title: `Semantic ${i}`, path: `qa2744/rules/f-${i % 3000}.ts`, rule: `RULE-TEXT-MARKER ${i}: every service method that writes a grade must check the teacher owns the class.` }));
            return { files, rules };
        },
    }),
    A_KEYLIM: () => run('a) 403 OpenRouter Key limit exceeded (monthly limit)', { layout: 'distinct', main: () => KEYLIM() }),
    B_WEEKLY: () => run('b) 429 reached your weekly usage limit', { layout: 'distinct', main: () => WEEKLY() }),
    C_TOKENPLAN: () => run('c) 429 Token Plan rate limit (MiniMax)', { layout: 'distinct', main: () => TOKENPLAN() }),
    RATE: () => run('control: plain 429 rate limit', { layout: 'distinct', main: () => RATE() }),
};

(async () => {
    const pick = process.argv.slice(2);
    for (const k of pick.length ? pick : Object.keys(scenarios)) await scenarios[k]();
    process.exit(0);
})();
