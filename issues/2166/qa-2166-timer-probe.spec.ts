import * as http from 'http';
import { AddressInfo } from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

type Live = { kind: string; where: string };
const live = new Map<any, Live>();
const origST = global.setTimeout, origSI = global.setInterval, origCT = global.clearTimeout, origCI = global.clearInterval;
function where() {
    const s = new Error().stack || '';
    const m = s.match(/qa2166\/(before|after|issuesha)\/([\w-]+\.ts):(\d+)/);
    return m ? `${m[2]}:${m[3]}` : '';
}
(global as any).setTimeout = function (fn: any, ms?: number, ...a: any[]) {
    const w = where();
    let h: any;
    h = origST(function (this: any, ...x: any[]) { live.delete(h); return fn.apply(this, x); }, ms, ...a);
    if (w) live.set(h, { kind: `timeout(${ms}ms)`, where: w });
    return h;
};
(global as any).setInterval = function (fn: any, ms?: number, ...a: any[]) {
    const w = where();
    const h = origSI(fn, ms, ...a);
    if (w) live.set(h, { kind: `interval(${ms}ms)`, where: w, stack: (new Error().stack||'').split('\n').filter(l=>l.includes('qa2166')).slice(0,8).join(' | ') } as any);
    return h;
};
(global as any).clearTimeout = (h: any) => { live.delete(h); return origCT(h); };
(global as any).clearInterval = (h: any) => { live.delete(h); return origCI(h); };

function summary() {
    const by: Record<string, number> = {};
    for (const v of live.values()) { by[`${v.kind} @ ${v.where}`] = (by[`${v.kind} @ ${v.where}`] || 0) + 1;  }
    return { total: live.size, by };
}

let server: http.Server; let url: string;
beforeAll(async () => {
    server = http.createServer(async (req, res) => {
        const mcp = new McpServer({ name: 'qa-2166', version: '1.0.0' });
        mcp.registerTool('ping', { description: 'ping' }, async () => ({ content: [{ type: 'text', text: 'pong' }] }));
        mcp.registerTool('hang', { description: 'never returns' }, () => new Promise<never>(() => {}));
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => { t.close(); mcp.close(); });
        await mcp.connect(t);
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => t.handleRequest(req, res, body ? JSON.parse(body) : undefined));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); });

const VARIANT = process.env.QA2166_VARIANT || 'after';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createMCPAdapter } = require(`./${VARIANT}/index`);
const cfg = (u: string) => ({ servers: [{ name: 'qa', type: 'http', url: u }], defaultTimeout: 60_000, maxRetries: 1 });
const out: any = { variant: VARIANT };

it('connect -> getTools -> executeTool -> disconnect, 20 cycles', async () => {
    live.clear();
    const results: string[] = [];
    const perCycle: number[] = [];
    for (let i = 0; i < 20; i++) {
        const a = createMCPAdapter(cfg(url));
        await a.connect();
        const tools = await a.getTools();
        if (i === 0) out.tools = tools.map((t: any) => t.name);
        const r = await a.executeTool('ping', {});
        results.push(JSON.stringify(r));
        await a.disconnect();
        perCycle.push(live.size);
    }
    out.perCycle = perCycle;
    const immediately = summary().total;
    await new Promise((r) => origST(r, 1000));
    out.cycles = { results: [...new Set(results)], liveImmediatelyAfterLastDisconnect: immediately, liveAfter1s: summary() };
});

it('failed connect, 5 clients', async () => {
    live.clear();
    let errors = 0;
    for (let i = 0; i < 5; i++) {
        const a = createMCPAdapter(cfg('http://127.0.0.1:1/mcp'));
        try { await a.connect(); } catch { errors++; }
        await a.disconnect().catch(() => undefined);
    }
    out.failedConnect = { errors, liveAfter: summary() };
});

it('disconnect while a tool call is pending', async () => {
    live.clear();
    const a = createMCPAdapter(cfg(url));
    await a.connect();
    const call = a.executeTool('hang', {}).then((r: any) => ({ ok: r }), (e: any) => ({ err: String(e?.message || e) }));
    await new Promise((r) => origST(r, 200));
    const during = summary();
    await a.disconnect();
    const settled = await Promise.race([call, new Promise((r) => origST(() => r('still pending after 2s'), 2000))]);
    out.pendingCall = { during, settled, liveAfter: summary() };
});

afterAll(() => { console.log('QA2166_RESULT ' + JSON.stringify(out, null, 2)); });
