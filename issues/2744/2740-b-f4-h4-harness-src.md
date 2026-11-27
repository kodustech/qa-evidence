# H4 harness source

Bundled with esbuild from wt-m/wt-p (real libs, packages external); mutants via onLoad string replace (build.js).

## build.js
```
// node build.js <side: m|p> <variant> ; variant: base | nostrip | stripall
const esbuild = require('<main-checkout>/node_modules/esbuild');
const fs = require('fs'), path = require('path');
const [side, variant = 'base'] = process.argv.slice(2);
const WT = path.resolve(__dirname, '../../wt-' + side);
const mut = {
  name: 'mutant',
  setup(b) {
    b.onLoad({ filter: /compression\/context-(window-)?compressor\.ts$/ }, async (a) => {
      let src = fs.readFileSync(a.path, 'utf8');
      if (variant === 'nostrip' && a.path.endsWith('context-window-compressor.ts')) {
        const before = src;
        src = src.replace('compressed = withoutThinkingAfterFirstEdit(modelMsgs, compressed);', '/* MUTANT: strip removed */');
        if (before === src) throw new Error('nostrip mutant did not apply');
      }
      if (variant === 'stripall' && a.path.endsWith('context-compressor.ts')) {
        const before = src;
        src = src.replace("if (type !== 'reasoning' && type !== 'redacted-reasoning') return false;", "if (type !== 'reasoning' && type !== 'redacted-reasoning') return false; return true;");
        if (before === src) throw new Error('stripall mutant did not apply');
      }
      return { contents: src, loader: 'ts' };
    });
  },
};
esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.ts')],
  bundle: true, platform: 'node', target: 'node22', format: 'cjs',
  outfile: path.join(__dirname, `dist/h4-${side}-${variant}.js`),
  tsconfig: path.join(WT, 'tsconfig.json'),
  nodePaths: [path.join(WT, 'node_modules')],
  packages: 'external',
  alias: { '@wt': WT + '/libs' },
  plugins: [mut], logLevel: 'warning', sourcemap: false,
}).then(() => console.log('built', side, variant)).catch((e) => { console.error(e.message); process.exit(1); });
```

## entry.ts
```
// H4: real AiSdkAgentRunner -> real LLM.run -> real resolveModelConfig/BYOK build
// (real @ai-sdk providers, real gateway guard, real withThinkingSignatureRepair)
// -> fake provider HTTP servers. Only the provider endpoint is fake.
import '@libs/llm/providers';
import { AiSdkAgentRunner } from '@libs/agent-harness/infrastructure/ai-sdk/ai-sdk-agent-runner';
import { ContextWindowCompressor } from '@libs/agent-harness/infrastructure/compression/context-window-compressor';
import * as cc from '@libs/agent-harness/infrastructure/compression/context-compressor';
import { CompressionPolicy } from '@libs/agent-harness/infrastructure/policies/compression.policy';
import { InMemoryToolRegistry } from '@libs/agent-harness/infrastructure/tools/in-memory-tool-registry';
import { encrypt } from '@libs/common/utils/crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fake = require(process.env.FAKE_JS as string);

const LINES = (seed: number) =>
    Array.from({ length: 560 }, (_, i) => `export const v${seed}_${i} = compute(${i}, "src/mod${seed}/file${i}.ts"); // ${'x'.repeat(i % 7)}`).join('\n');

async function main() {
    const srv = await fake.start(0);
    const port = srv.address().port;
    const base = `http://127.0.0.1:${port}`;

    // Bedrock has no base URL: redirect only the AWS endpoint host to the fake.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('bedrock-runtime.us-east-1.amazonaws.com')) {
            const u = new URL(url);
            return realFetch(`${base}/bedrock${u.pathname}`, init);
        }
        return realFetch(input, init);
    }) as any;

    const K = encrypt('fake-key-not-a-secret');
    const slots: Record<string, any> = {
        anthropic: { provider: 'anthropic', apiKey: K, model: 'claude-sonnet-4-5', baseURL: `${base}/anthropic/v1`, reasoningEffort: 'low' },
        bedrock: { provider: 'amazon_bedrock', apiKey: '', model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', awsRegion: 'us-east-1', awsBearerToken: K, reasoningEffort: 'low' },
        gateway: { provider: 'anthropic_compatible', apiKey: K, model: 'claude-sonnet-4-5', baseURL: `${base}/gw`, reasoningEffort: 'low' },
        'deepseek-openai': { provider: 'openai_compatible', apiKey: K, model: 'deepseek-v4-flash', baseURL: `${base}/oc/v1`, reasoningEffort: 'low' },
        'deepseek-anthropic': { provider: 'anthropic_compatible', apiKey: K, model: 'deepseek-v4-flash', baseURL: `${base}/dsa`, reasoningEffort: 'low' },
        'kimi-anthropic': { provider: 'anthropic_compatible', apiKey: K, model: 'kimi-k2.7-code', baseURL: `${base}/kimi`, reasoningEffort: 'low' },
        'openai-responses': { provider: 'openai', apiKey: K, model: 'gpt-5.2', baseURL: `${base}/oai/v1`, reasoningEffort: 'low' },
    };
    const only = (process.env.ONLY || '').split(',').filter(Boolean);
    const window = Number(process.env.WINDOW || 60000);
    const results: any[] = [];
    for (const [name, slot] of Object.entries(slots)) {
        if (only.length && !only.includes(name)) continue;
        fake.reset({ enforceFinalThinking: process.env.ENFORCE_FINAL === '1' });
        const tools = new InMemoryToolRegistry([
            {
                name: 'readFile',
                description: 'read a file',
                inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
                execute: async (input: any) => ({ output: input?.path === 'small.ts' ? 'export const ok = 1;' : LINES(Number(String(input?.path).replace(/\D/g, '')) || 0) }),
            },
        ] as any);
        const spec: any = {
            id: 'generalist',
            systemPrompt: 'review the diff',
            tools,
            policies: [new CompressionPolicy(new ContextWindowCompressor(window))],
            maxSteps: 20,
        };
        const started = Date.now();
        let state: any;
        try {
            state = await new AiSdkAgentRunner(slot).run(spec, { prompt: 'review this PR' } as any, { runId: `h4-${name}` } as any);
        } catch (e: any) {
            state = { status: 'thrown', error: String(e?.message ?? e).slice(0, 400) };
        }
        const r = fake.state.routes[name] || { n: 0, requests: [], violations: [], errors: [] };
        const errEv = (state.trace || []).find((e: any) => e.kind === 'error' || e.kind === 'run.error');
        results.push({
            provider: name,
            status: state.status,
            stopReason: state.stopReason,
            steps: state.steps?.length,
            compressions: (state.trace || []).filter((e: any) => e.kind === 'context.compress').length,
            requests: r.n,
            firstError: r.errors[0] ?? (state.error ? { err: state.error } : errEv ? { err: JSON.stringify(errEv.detail ?? errEv).slice(0, 300) } : null),
            violationsByRule: r.violations.reduce((a: any, v: any) => ((a[v.rule] = (a[v.rule] || 0) + 1), a), {}),
            replayedPerRequest: r.requests.map((q: any) => q.replayedThinking ?? q.replayedReasoning),
            thinkingParam: r.requests[0]?.thinkingParam ?? r.requests[0]?.thinkingOn ?? null,
            ms: Date.now() - started,
            requestLog: r.requests,
            finalText: (state.output ?? state.finalText ?? '').toString().slice(0, 40),
        });
    }

    // S6 "no edit": the strip returns the very same window when nothing changed.
    const fn = (cc as any).withoutThinkingAfterFirstEdit;
    let noEdit: any = 'absent at this side';
    if (fn) {
        const msgs: any[] = [
            { role: 'user', content: 'go' },
            { role: 'assistant', content: [{ type: 'reasoning', text: 't', providerOptions: { anthropic: { signature: 's' } } }, { type: 'tool-call', toolCallId: 'a', toolName: 'x', input: {} }] },
        ];
        const w = [...msgs];
        noEdit = { sameObjectReturned: fn(msgs, w) === w };
        // Compressor below the threshold: no compression result at all.
    }
    const small = new ContextWindowCompressor(1_000_000).maybeCompress([{ role: 'user', content: 'hi' } as any]);
    require('fs').writeFileSync(process.env.RESULT_FILE as string, JSON.stringify({ side: process.env.SIDE, variant: process.env.VARIANT, window, enforceFinal: process.env.ENFORCE_FINAL === '1', results, noEdit, compressorBelowThresholdReturnsNull: small === null }, null, 1));
    srv.close();
    process.exit(0);
}
main().catch((e) => {
    console.error('HARNESS FAILURE', e);
    process.exit(2);
});
```

## fake.js
```
// Fake provider servers for H4. One process, one port, routes by path prefix.
// Each wire enforces the replay rule the real provider enforces; violations are
// recorded, and the "enforced" ones answer 400 like the provider does.
const http = require('http');
const crypto = require('crypto');

const state = { routes: {} };
function reset(cfg) {
  state.cfg = cfg || {};
  state.routes = {};
}
reset();
function route(name) {
  return (state.routes[name] ||= { n: 0, requests: [], violations: [], errors: [] });
}

function strip(v) {
  if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === 'object' && 'cachePoint' in x)).map(strip);
  if (!v || typeof v !== 'object') return v;
  const o = {};
  for (const k of Object.keys(v).sort()) {
    if (k === 'cache_control' || k === 'cacheControl') continue;
    o[k] = strip(v[k]);
  }
  return o;
}
const h = (x) => crypto.createHash('sha256').update(JSON.stringify(strip(x))).digest('hex').slice(0, 32);

const toolOut = (turn) => (turn >= 13 ? null : { name: 'readFile', input: { path: turn === 1 ? 'small.ts' : `f${turn}.ts` } });

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

// ---------- Anthropic Messages (native, gateway, Anthropic-compatible) ----------
function anthropic(name, req, res, body, { signed }) {
  const r = route(name);
  r.n += 1;
  const turn = r.n;
  const msgs = body.messages || [];
  const tools = body.tools || [];
  const rec = { turn, replayedThinking: 0, assistantTurns: 0, msgCount: msgs.length, shape: msgs.map((m) => m.role[0] + ':' + (Array.isArray(m.content) ? m.content.map((p) => p.type === 'tool_result' ? 'tool_result(' + JSON.stringify(p.content).length + ')' : p.type).join('+') : 'str')) };
  let err = null;
  const lastAssistant = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'assistant') return i; return -1; })();
  msgs.forEach((m, i) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return;
    rec.assistantTurns++;
    const first = m.content[0];
    m.content.forEach((p, j) => {
      if (p.type !== 'thinking') return;
      rec.replayedThinking++;
      if (signed) {
        const expect = h({ system: body.system, tools, messages: msgs.slice(0, i), thinking: p.thinking });
        if (p.signature !== expect) {
          const msg = `messages.${i}.content.${j}: Invalid \`signature\` in \`thinking\` block`;
          r.violations.push({ turn, rule: 'signature', at: i });
          err ||= msg;
        }
      }
    });
    // Documented rule: with thinking on, the final assistant turn of a tool loop starts with thinking.
    if (i === lastAssistant && body.thinking && body.thinking.type !== 'disabled' && first && first.type !== 'thinking' && first.type !== 'redacted_thinking') {
      r.violations.push({ turn, rule: 'final-assistant-thinking', at: i });
      if (state.cfg.enforceFinalThinking) err ||= `messages.${i}.content.0.type: Expected \`thinking\` or \`redacted_thinking\`, but found \`${first.type}\`. When \`thinking\` is enabled, a final \`assistant\` message must start with a thinking block`;
    }
    // Compatible upstreams (DeepSeek/Kimi): a tool_use turn that thought must replay its reasoning.
    if (!signed && m.content.some((p) => p.type === 'tool_use') && !m.content.some((p) => p.type === 'thinking')) {
      r.violations.push({ turn, rule: 'compat-missing-thinking', at: i });
      err ||= `messages.${i}: thinking is enabled but reasoning content of the assistant tool call was not passed back`;
    }
  });
  rec.thinkingParam = body.thinking ? body.thinking.type : null;
  r.requests.push(rec);
  if (err) {
    r.errors.push({ turn, err });
    return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: err } });
  }
  const thinking = `thinking ${turn}`;
  const block = { type: 'thinking', thinking };
  if (signed) block.signature = h({ system: body.system, tools, messages: msgs, thinking });
  const tc = toolOut(turn);
  const content = [block, tc ? { type: 'tool_use', id: `toolu_${turn}`, name: tc.name, input: tc.input } : { type: 'text', text: 'review done' }];
  send(res, 200, { id: `msg_${turn}`, type: 'message', role: 'assistant', model: body.model, content, stop_reason: tc ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 100, output_tokens: 10 } });
}

// ---------- Bedrock Converse ----------
function bedrock(name, req, res, body) {
  const r = route(name);
  r.n += 1;
  const turn = r.n;
  const msgs = body.messages || [];
  const rec = { turn, replayedThinking: 0, msgCount: msgs.length };
  let err = null;
  let lastAssistant = -1;
  msgs.forEach((m, i) => { if (m.role === 'assistant') lastAssistant = i; });
  const thinkingOn = !!(body.additionalModelRequestFields && (body.additionalModelRequestFields.thinking || body.additionalModelRequestFields.reasoning_config || body.additionalModelRequestFields.reasoningConfig));
  rec.thinkingOn = thinkingOn;
  msgs.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    const content = (m.content || []).filter((p) => !('cachePoint' in p));
    content.forEach((p, j) => {
      const rt = p.reasoningContent && p.reasoningContent.reasoningText;
      if (!rt) return;
      rec.replayedThinking++;
      const expect = h({ system: body.system, tools: body.toolConfig && body.toolConfig.tools, messages: msgs.slice(0, i), thinking: rt.text });
      if (rt.signature !== expect) {
        r.violations.push({ turn, rule: 'signature', at: i });
        err ||= `messages.${i}.content.${j}: Invalid \`signature\` in \`thinking\` block`;
      }
    });
    if (i === lastAssistant && thinkingOn && content[0] && !content[0].reasoningContent) {
      r.violations.push({ turn, rule: 'final-assistant-thinking', at: i });
      if (state.cfg.enforceFinalThinking) err ||= `messages.${i}.content.0.type: Expected \`thinking\` or \`redacted_thinking\`, but found \`tool_use\`. When \`thinking\` is enabled, a final \`assistant\` message must start with a thinking block`;
    }
  });
  r.requests.push(rec);
  if (err) {
    r.errors.push({ turn, err });
    return send(res, 400, { message: err }, { 'x-amzn-errortype': 'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/' });
  }
  const thinking = `thinking ${turn}`;
  const sig = h({ system: body.system, tools: body.toolConfig && body.toolConfig.tools, messages: msgs, thinking });
  const tc = toolOut(turn);
  const content = [{ reasoningContent: { reasoningText: { text: thinking, signature: sig } } }, tc ? { toolUse: { toolUseId: `tu_${turn}`, name: tc.name, input: tc.input } } : { text: 'review done' }];
  send(res, 200, { output: { message: { role: 'assistant', content } }, stopReason: tc ? 'tool_use' : 'end_turn', usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 }, metrics: { latencyMs: 1 } });
}

// ---------- OpenAI-compatible chat (DeepSeek) ----------
function chat(name, req, res, body) {
  const r = route(name);
  r.n += 1;
  const turn = r.n;
  const msgs = body.messages || [];
  const rec = { turn, replayedReasoning: 0, msgCount: msgs.length };
  let err = null;
  msgs.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    if (m.reasoning_content) rec.replayedReasoning++;
    if (m.tool_calls && m.tool_calls.length && !m.reasoning_content) {
      r.violations.push({ turn, rule: 'deepseek-reasoning_content', at: i });
      err ||= `Missing \`reasoning_content\` field in the assistant message at message index ${i}`;
    }
  });
  r.requests.push(rec);
  if (err) {
    r.errors.push({ turn, err });
    return send(res, 400, { error: { message: err, type: 'invalid_request_error' } });
  }
  const tc = toolOut(turn);
  const message = { role: 'assistant', content: tc ? null : 'review done', reasoning_content: `thinking ${turn}` };
  if (tc) message.tool_calls = [{ id: `call_${turn}`, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } }];
  send(res, 200, { id: `cmpl_${turn}`, object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message, finish_reason: tc ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } });
}

// ---------- OpenAI Responses ----------
function responses(name, req, res, body) {
  const r = route(name);
  r.n += 1;
  const turn = r.n;
  const input = body.input || [];
  const rec = { turn, replayedReasoning: 0, items: input.length, store: body.store, include: body.include };
  let err = null;
  input.forEach((it, i) => {
    if (it.type === 'reasoning') rec.replayedReasoning++;
    if (it.type === 'function_call') {
      const n = String(it.call_id).replace('call_', '');
      const prev = input[i - 1];
      if (!prev || prev.type !== 'reasoning' || prev.encrypted_content !== `enc_${n}`) {
        r.violations.push({ turn, rule: 'responses-reasoning-item', at: i });
        err ||= `Item 'fc_${n}' of type 'function_call' was provided without its required 'reasoning' item: 'rs_${n}'.`;
      }
    }
  });
  r.requests.push(rec);
  if (err) {
    r.errors.push({ turn, err });
    return send(res, 400, { error: { message: err, type: 'invalid_request_error', param: 'input', code: null } });
  }
  const tc = toolOut(turn);
  const output = [{ type: 'reasoning', id: `rs_${turn}`, encrypted_content: `enc_${turn}`, summary: [] }];
  if (tc) output.push({ type: 'function_call', id: `fc_${turn}`, call_id: `call_${turn}`, name: tc.name, arguments: JSON.stringify(tc.input), status: 'completed' });
  else output.push({ type: 'message', id: `msg_${turn}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'review done', annotations: [] }] });
  send(res, 200, { id: `resp_${turn}`, object: 'response', created_at: 1, status: 'completed', model: body.model, output, incomplete_details: null, usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 5 } } });
}

function start(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        let body = {};
        try { body = JSON.parse(data || '{}'); } catch {}
        const u = req.url;
        (state.raw ||= []).push({ url: u, bytes: data.length });
        if (u.startsWith('/anthropic/') && u.endsWith('/messages')) return anthropic('anthropic', req, res, body, { signed: true });
        if (u.startsWith('/gw/') && u.endsWith('/messages')) return anthropic('gateway', req, res, body, { signed: true });
        if (u.startsWith('/dsa/') && u.endsWith('/messages')) return anthropic('deepseek-anthropic', req, res, body, { signed: false });
        if (u.startsWith('/kimi/') && u.endsWith('/messages')) return anthropic('kimi-anthropic', req, res, body, { signed: false });
        if (u.startsWith('/bedrock/') && u.includes('/converse')) return bedrock('bedrock', req, res, body);
        if (u.startsWith('/oc/') && u.endsWith('/chat/completions')) return chat('deepseek-openai', req, res, body);
        if (u.startsWith('/oai/') && u.endsWith('/responses')) return responses('openai-responses', req, res, body);
        send(res, 404, { error: { message: 'no route ' + u } });
      });
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
module.exports = { start, reset, state };
```

## s34.ts
```
import { ContextWindowCompressor } from '@libs/agent-harness/infrastructure/compression/context-window-compressor';
const N = Number(process.env.CHARS || 2_000_000);
const secret = 'SENTINEL_TEXT_qa2744';
let s = secret + '\n';
let i = 0;
while (s.length < N) s += `const v${i} = await repo.find({ where: { id: ${i}, name: "röw-${i % 97}" } }); // 🙂 ${i++}\n`;
s = s.slice(0, N);
const msgs: any[] = [
    { role: 'user', content: 'review' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'readFile', input: { path: 'x' } }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'readFile', output: { type: 'text', value: s } }] },
];
for (const wc of [false, true]) {
    const t = Date.now();
    const r = new ContextWindowCompressor(200_000, { countAtWorstCase: wc }).maybeCompress(msgs);
    console.error(JSON.stringify({ marker: 'S34', worstCase: wc, chars: N, ms: Date.now() - t, compressed: !!r }));
}
```
