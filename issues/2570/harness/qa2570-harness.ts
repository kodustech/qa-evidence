/* QA harness for kodus-ai #2570 / PR #2585. Same file runs in the merge tree and the first-parent tree.
 * Real: BitbucketService facade, BitbucketCloudService, BitbucketDataCenterService, CreateIntegrationUseCase,
 * CodeManagementService, Integration/AuthIntegration/IntegrationConfig services + TypeORM repositories on a
 * disposable local Postgres (migrations of the merge tree), crypto, logger.
 * Stubbed: DC = real local HTTP server; Cloud HTTP = nock on api.bitbucket.org; platform factory, telemetry,
 * ignore-bots, MCP transport. Run: node -r ts-node/register -r tsconfig-paths/register qa2570-harness.ts <case>
 */
import 'reflect-metadata';
import * as http from 'http';
import { randomUUID } from 'crypto';
import nock from 'nock';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpException } from '@nestjs/common';

import { ENTITIES } from '@libs/core/infrastructure/database/typeorm/entities';
import { IntegrationModel } from '@libs/integrations/infrastructure/adapters/repositories/schemas/integration.model';
import { AuthIntegrationModel } from '@libs/integrations/infrastructure/adapters/repositories/schemas/authIntegration.model';
import { IntegrationConfigModel } from '@libs/integrations/infrastructure/adapters/repositories/schemas/integrationConfig.model';
import { IntegrationRepository } from '@libs/integrations/infrastructure/adapters/repositories/integration.repository';
import { AuthIntegrationRepository } from '@libs/integrations/infrastructure/adapters/repositories/authIntegration.repository';
import { IntegrationConfigRepository } from '@libs/integrations/infrastructure/adapters/repositories/integrationConfig.repository';
import { IntegrationService } from '@libs/integrations/infrastructure/adapters/services/integration.service';
import { AuthIntegrationService } from '@libs/integrations/infrastructure/adapters/services/authIntegration.service';
import { IntegrationConfigService } from '@libs/integrations/infrastructure/adapters/services/integrationConfig.service';
import { BitbucketService } from '@libs/platform/infrastructure/adapters/services/bitbucket.service';
import { BitbucketCloudService } from '@libs/platform/infrastructure/adapters/services/bitbucket/bitbucket-cloud.service';
import { BitbucketDataCenterService } from '@libs/platform/infrastructure/adapters/services/bitbucket/bitbucket-data-center.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { CreateIntegrationUseCase } from '@libs/platform/application/use-cases/codeManagement/create-integration.use-case';
import { MCPManagerService } from '@libs/mcp-server/services/mcp-manager.service';
import { AuditLogEvents } from '@libs/ee/codeReviewSettingsLog/events/audit-log.events';
import { addLogProcessor, createLogger } from '@libs/core/log/logger';
import { decrypt } from '@libs/common/utils/crypto';

const PW = 'qa2570-MARKER-pw';
const USER = 'qa2570user';
const B64 = Buffer.from(`${USER}:${PW}`).toString('base64');
const TREE = process.cwd().split('/').pop();

// ---------- capture ----------
function safeJson(v: any) { const seen = new WeakSet(); try { return JSON.stringify(v, (_k, x) => { if (x && typeof x === 'object') { if (seen.has(x)) return '[circ]'; seen.add(x); } return x; }); } catch (e: any) { return 'unserializable:' + e?.message; } }
const logs: any[] = [];
addLogProcessor((level: any, message: any, service: any, metadata: any, error: any) => {
    logs.push({ level, message, service, context: metadata?.context, authMode: metadata?.authMode, host: metadata?.host,
        org: metadata?.organizationAndTeamData?.organizationId ?? metadata?.organizationId, errMsg: error?.message,
        _raw: safeJson({ metadata, error: error && { message: error.message, stack: error.stack, response: error.response, config: error.config } }) });
});
const stdoutChunks: string[] = [];
const origOut = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (c: any, ...a: any[]) => { stdoutChunks.push(String(c)); if (String(c).startsWith('@@')) return origOut(c, ...a); return true; };
const origErr = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (c: any, ...a: any[]) => { stdoutChunks.push(String(c)); return true; };
let unhandled: string[] = [];
process.on('unhandledRejection', (r: any) => unhandled.push(String(r?.message ?? r)));

// ---------- fake DC server ----------
const reqLog: any[] = [];
let expectedAuth: string | undefined;
const page = (mode: string, n = 2, extra: any = {}) => ({ size: n, limit: 1000, isLastPage: true, start: 0,
    values: Array.from({ length: n }, (_, i) => ({ id: 9000 + i, slug: `${mode}-repo${i}`, name: `${mode}-repo${i}`, public: false,
        project: { key: 'QA2570', id: 77, name: 'QA 2570' }, links: { clone: [{ name: 'http', href: `https://example.invalid/scm/qa2570/${mode}-repo${i}.git` }] } })), ...extra });
const server = http.createServer((req, res) => {
    const u = new URL(req.url!, 'http://x');
    const idx = u.pathname.indexOf('/rest/api/1.0');
    const prefix = idx >= 0 ? u.pathname.slice(0, idx) : u.pathname;
    const api = idx >= 0 ? u.pathname.slice(idx + '/rest/api/1.0'.length) : '';
    const mode = prefix.split('/').filter(Boolean).pop() || '';
    const auth = String(req.headers.authorization || '');
    reqLog.push({ t: new Date().toISOString(), pid: process.pid, prefix, mode, method: req.method, path: api + u.search,
        scheme: auth.split(' ')[0] || null, authMatches: expectedAuth === undefined ? null : auth === expectedAuth });
    const json = (s: number, b: any) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(typeof b === 'string' ? b : JSON.stringify(b)); };
    if (api.startsWith('/projects')) return mode === 'legacy' ? json(200, { values: [] }) : json(403, { errors: [{ message: 'no project permission' }] });
    if (!api.startsWith('/repos')) return json(404, { errors: [{ message: 'not found' }] });
    const start = Number(u.searchParams.get('start') || 0);
    switch (mode) {
        case 's401': return json(401, { errors: [{ message: 'Authentication failed' }] });
        case 's403': return json(403, { errors: [{ message: 'forbidden' }] });
        case 's429': return json(429, { errors: [{ message: 'rate limited' }] });
        case 's500': return json(500, { errors: [{ message: 'boom' }] });
        case 's404': return json(404, { errors: [{ message: 'nope' }] });
        case 'html': res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!DOCTYPE html><html><body>Sign in</body></html>');
        case 'errjson': return json(200, { errors: [{ message: 'x' }] });
        case 'nullbody': return json(200, 'null');
        case 'vnull': return json(200, { values: null });
        case 'vobj': return json(200, { values: {} });
        case 'vstr': return json(200, { values: 'abc' });
        case 'redirect': res.writeHead(302, { location: '/html/rest/api/1.0/repos?limit=1' }); return res.end();
        case 'empty': return json(200, { size: 0, limit: 1000, isLastPage: true, start: 0, values: [] });
        case 'hang': return; // never answers
        case 'reset': res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"values":[{"id":1,'); return setTimeout(() => req.socket.destroy(), 50);
        case 'slow': return setTimeout(() => json(200, page(mode)), Number(process.env.SLOW_MS || 1500));
        case 'bearer': return auth === expectedAuth ? json(200, page(mode)) : json(401, { errors: [{ message: 'bad token' }] });
        case 'page2':
            if (start === 0) return json(200, { ...page('p1', 2), isLastPage: false, nextPageStart: 1000 });
            return json(200, { ...page('p2', 2), start });
        default: return json(200, page(mode || 'root'));
    }
});

// ---------- cloud (nock) ----------
const cloudLog: any[] = [];
function cloudNock(mode: 'deny' | 'ok') {
    nock.cleanAll();
    const s = nock('https://api.bitbucket.org').persist();
    const rec = (m: string) => function (this: any, uri: string) { cloudLog.push({ t: new Date().toISOString(), method: m, path: uri }); };
    if (mode === 'deny') {
        s.get(/.*/).delay(Number(process.env.CLOUD_DELAY_MS || 0)).reply(function (uri) { rec('GET').call(this, uri); return [401, { error: { message: 'Unauthorized' } }]; });
    } else {
        s.get(/.*/).delay(Number(process.env.CLOUD_DELAY_MS || 0)).reply(function (uri) {
            rec('GET').call(this, uri);
            if (uri.startsWith('/2.0/user/workspaces')) return [200, { values: [{ workspace: { uuid: '{w1}', slug: 'qa2570ws' }, uuid: '{w1}', slug: 'qa2570ws' }] }];
            if (uri.startsWith('/2.0/user')) return [200, { uuid: '{u1}', username: 'qa2570', display_name: 'QA' }];
            if (uri.startsWith('/2.0/repositories')) return [200, { values: [{ uuid: '{r1}', name: 'cloud-repo', full_name: 'qa2570ws/cloud-repo', is_private: true, workspace: { uuid: '{w1}', slug: 'qa2570ws' }, mainbranch: { name: 'main' }, links: { html: { href: 'https://bitbucket.org/qa2570ws/cloud-repo' } }, project: { uuid: '{p1}', name: 'P' } }] }];
            return [200, { values: [] }];
        });
    }
}

// ---------- services ----------
let ds: DataSource;
let BASE = '';
const H = (mode: string) => `${BASE}/${mode}`;
const audit: any[] = [];
let mcpCalls = 0, telemetryCalls = 0;
let svc: any;

async function boot() {
    nock.disableNetConnect();
    nock.enableNetConnect((h) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h) || h.includes('.invalid'));
    await new Promise<void>((r) => server.listen(Number(process.env.DC_PORT || 0), '127.0.0.1', () => r()));
    BASE = `http://127.0.0.1:${(server.address() as any).port}`;
    ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port: 55432, username: 'postgres', password: 'qa2570', database: 'kodus',
        entities: ENTITIES as any, synchronize: false, logging: false, extra: { max: 4 } });
    await ds.initialize();
    const integrationConfigService = new IntegrationConfigService(new IntegrationConfigRepository(ds.getRepository(IntegrationConfigModel)) as any);
    const integrationService = new IntegrationService(new IntegrationRepository(ds.getRepository(IntegrationModel)) as any, integrationConfigService as any);
    const authIntegrationService = new AuthIntegrationService(new AuthIntegrationRepository(ds.getRepository(AuthIntegrationModel)) as any);
    const mcp: any = Object.create(MCPManagerService.prototype);
    mcp.logger = createLogger('MCPManagerService');
    mcp.jwt = { sign: () => 'jwt' };
    mcp.telemetry = { pluginChanged: async () => undefined };
    mcp.axiosMCPManagerService = { post: (..._a: any[]) => { mcpCalls++; return new Promise((_, rej) => setTimeout(() => rej(new Error('qa2570 MCP transport down')), Number(process.env.MCP_REJECT_MS || 2000))); } };
    const configService: any = { get: () => undefined };
    const dc = new BitbucketDataCenterService(integrationService as any, integrationConfigService as any, authIntegrationService as any, configService, mcp);
    const cloud = new BitbucketCloudService(integrationService as any, integrationConfigService as any, authIntegrationService as any, configService, mcp);
    const routingIntegrationService = new Proxy(integrationService, { get(t: any, p) {
        if (p === 'getPlatformAuthDetails') return async (...a: any[]) => { svc.lookups++; if (svc.lookupThrows) throw new Error('qa2570 lookup down'); return t.getPlatformAuthDetails(...a); };
        const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
    const facade = new BitbucketService(cloud as any, dc as any, routingIntegrationService as any, integrationConfigService as any, null as any);
    const factory: any = { getCodeManagementService: (t: any) => { if (String(t).toLowerCase() === 'bitbucket') return facade; throw new Error('unexpected type ' + t); } };
    const cms = new CodeManagementService(integrationService as any, factory);
    const ee = new EventEmitter2();
    ee.on(AuditLogEvents.INTEGRATION, (e: any) => audit.push({ t: new Date().toISOString(), org: e?.organizationAndTeamData?.organizationId, action: e?.actionType, hasAuth: !!e?.integration?.authIntegration }));
    const mkUseCase = (orgId: string) => new CreateIntegrationUseCase(cms, ee,
        { user: { organization: { uuid: orgId }, uuid: randomUUID(), email: 'qa2570@example.invalid' } } as any,
        authIntegrationService as any, { execute: async () => undefined } as any, { gitIntegrationChanged: async () => { telemetryCalls++; } } as any);
    svc = { integrationService, authIntegrationService, integrationConfigService, dc, cloud, facade, cms, mkUseCase, lookups: 0, lookupThrows: false };
}

async function tenant(label = 't') {
    const org = randomUUID(), team = randomUUID();
    await ds.query(`insert into organizations(uuid,name) values ($1,$2)`, [org, `qa2570-${label}`]);
    await ds.query(`insert into teams(uuid,name,organization_id,status) values ($1,$2,$3,'active')`, [team, `qa2570-${label}`, org]);
    return { organizationId: org, teamId: team };
}

async function rows(t: { organizationId: string }, token?: string) {
    const r = await ds.query(`select i.uuid as int_uuid, i.status as int_status, i.platform, i.team_id, i."createdAt" as int_created,
        a.uuid as auth_uuid, a.status as auth_status, a."authDetails" as d, a."createdAt" as auth_created, a."updatedAt" as auth_updated
        from auth_integrations a full join integrations i on i.auth_integration_id = a.uuid
        where coalesce(i.organization_id, a.organization_id) = $1 order by coalesce(a."createdAt", i."createdAt")`, [t.organizationId]);
    return r.map((x: any) => {
        const d = x.d || {};
        let dec: string | null = null; try { dec = decrypt(d.appPassword); } catch { dec = '<undecryptable>'; }
        return { int_uuid: x.int_uuid, int_status: x.int_status, platform: x.platform, auth_uuid: x.auth_uuid, auth_status: x.auth_status,
            host: d.host, authMode: d.authMode, username: d.username, email: d.email, appPasswordIsPlain: d.appPassword === token || d.appPassword === PW,
            decryptsToSubmitted: token !== undefined ? dec === token : null, int_created: x.int_created, auth_updated: x.auth_updated };
    });
}

async function call(fn: () => Promise<any>) {
    const t0 = Date.now();
    try {
        const r = await fn();
        return { ok: true, ms: Date.now() - t0, result: r };
    } catch (e: any) {
        const status = e instanceof HttpException ? e.getStatus() : 500;
        return { ok: false, ms: Date.now() - t0, httpStatus: status, name: e?.constructor?.name, message: String(e?.message).slice(0, 200),
            response: e instanceof HttpException ? e.getResponse() : undefined };
    }
}

function mark() { return { r: reqLog.length, c: cloudLog.length, l: logs.length, a: audit.length, m: mcpCalls, tl: telemetryCalls, lk: svc.lookups }; }
function since(m: any) {
    return { dcRequests: reqLog.slice(m.r).map(({ pid, prefix, ...x }) => x), cloudRequests: cloudLog.slice(m.c),
        logs: logs.slice(m.l).filter((x) => x.level === 'error' || x.level === 'warn').map(({ _raw, ...x }) => x),
        auditEvents: audit.length - m.a, mcpCalls: mcpCalls - m.m, telemetryCalls: telemetryCalls - m.tl, routingLookups: svc.lookups - m.lk };
}

const uc = (t: any, body: any) => svc.mkUseCase(t.organizationId).execute({ integrationType: 'bitbucket', organizationAndTeamData: { teamId: t.teamId }, ...body });
const dcBasic = (host: string, extra: any = {}) => ({ authMode: 'basic', host, username: USER, token: PW, ...extra });

async function attempt(label: string, t: any, fn: () => Promise<any>, token = PW) {
    const m = mark();
    const res = await call(fn);
    await new Promise((r) => setTimeout(r, 150));
    return { label, ...res, ...since(m), rows: await rows(t, token) };
}

// ---------- cases ----------
const cases: Record<string, () => Promise<any>> = {
    async m3() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const t = await tenant('m3');
        const a = await attempt('first-time Basic+host via use case', t, () => uc(t, dcBasic(H('ok'))));
        const m = mark();
        const repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
        return { a, repoListing: { ok: repos.ok, names: repos.ok ? repos.result.map((x: any) => x.name) : repos.message, ...since(m) } };
    },
    async m4() {
        cloudNock('deny');
        const out: any[] = [];
        for (const v of [{ k: 'basic', body: dcBasic(H('ok')), auth: `Basic ${B64}`, tok: PW }, { k: 'pat', body: { authMode: 'token', host: H('ok'), token: 'qa2570-PAT-sentinel' }, auth: 'Bearer qa2570-PAT-sentinel', tok: 'qa2570-PAT-sentinel' }]) {
            expectedAuth = v.auth;
            const t1 = await tenant('m4a');
            out.push(await attempt(`${v.k} first-time (nothing stored)`, t1, () => uc(t1, v.body), v.tok));
            const t2 = await tenant('m4b');
            await svc.dc.addAccessToken(t2, { username: USER, appPassword: require('@libs/common/utils/crypto').encrypt('old'), authMode: v.k === 'basic' ? 'basic' : 'token', host: H('ok') });
            out.push(await attempt(`${v.k} with a DC integration already stored (parent can reach DC)`, t2, () => uc(t2, v.body), v.tok));
        }
        return out;
    },
    async m5() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        let last: any;
        for (const [k, host] of [['401', H('s401')], ['403', H('s403')], ['429', H('s429')], ['500', H('s500')], ['404', H('s404')],
            ['dns', 'http://qa2570-nohost.invalid'], ['refused', 'http://127.0.0.1:1']]) {
            const t = await tenant('m5'); last = t;
            out.push(await attempt(`probe ${k}`, t, () => uc(t, dcBasic(host))));
        }
        out.push(await attempt('valid retry on the last tenant', last, () => uc(last, dcBasic(H('ok')))));
        return out;
    },
    async m6() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        for (const k of ['html', 'errjson', 'nullbody', 'vnull', 'vobj', 'vstr', 'redirect']) {
            const t = await tenant('m6');
            out.push(await attempt(`200 non-page: ${k}`, t, () => uc(t, dcBasic(H(k)))));
        }
        const t = await tenant('m6x');
        out.push(await attempt('seed: valid DC connect', t, () => uc(t, dcBasic(H('okA')))));
        out.push(await attempt('existing valid integration, then 200 HTML submit', t, () => uc(t, dcBasic(H('html')))));
        const m = mark();
        const repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
        out.push({ label: 'listing after the refused resubmit', names: repos.ok ? repos.result.map((x: any) => x.name) : repos.message, ...since(m) });
        return out;
    },
    async m7() {
        cloudNock('deny');
        const out: any[] = [];
        const cases7: [string, any, boolean][] = [
            ['Basic, no host (use case)', { authMode: 'basic', username: USER, token: PW }, true],
            ['token mode, no token', { authMode: 'token', email: 'x@example.invalid' }, true],
            ['token mode, token ""', { authMode: 'token', token: '', email: 'x@example.invalid' }, true],
            ['absent mode via use case (defaults to oauth)', { token: PW }, true],
            ['oauth', { authMode: 'oauth', code: 'abc' }, true],
            ['unknown mode', { authMode: 'foo', token: PW }, true],
        ];
        for (const [label, body] of cases7) { const t = await tenant('m7'); out.push(await attempt(label, t, () => uc(t, body))); }
        { const t = await tenant('m7'); out.push(await attempt('absent mode via facade (no use-case default)', t, () => svc.facade.createAuthIntegration({ organizationAndTeamData: t, token: PW }))); }
        { const t = await tenant('m7'); out.push(await attempt('undefined params via facade', t, () => svc.facade.createAuthIntegration(undefined))); }
        for (const o of out) o.responseHasPassword = JSON.stringify(o.response ?? '').includes(PW) || JSON.stringify(o.result ?? '').includes(PW);
        return out;
    },
    async m9() {
        cloudNock('deny');
        const out: any[] = [];
        for (const host of [undefined, '', '   ']) {
            for (const stored of ['none', 'cloudBlankHost', 'cloudNoHostKey', 'lookupThrows']) {
                const t = await tenant('m9');
                if (stored === 'cloudBlankHost') await svc.cloud.addAccessToken(t, { username: 'u', appPassword: require('@libs/common/utils/crypto').encrypt('old'), authMode: 'token', email: 'e', host: '' });
                if (stored === 'cloudNoHostKey') await svc.cloud.addAccessToken(t, { username: 'u', appPassword: require('@libs/common/utils/crypto').encrypt('old'), authMode: 'token', email: 'e' });
                svc.lookupThrows = stored === 'lookupThrows';
                const body: any = { organizationAndTeamData: t, authMode: 'token', token: 'qa2570-cloud-pat', email: 'x@example.invalid' };
                if (host !== undefined) body.host = host;
                const r = await attempt(`host=${JSON.stringify(host)} stored=${stored}`, t, () => svc.facade.createAuthIntegration(body), 'qa2570-cloud-pat');
                svc.lookupThrows = false;
                out.push({ label: r.label, ok: r.ok, httpStatus: r.httpStatus, dcRequests: r.dcRequests.length, cloudRequests: r.cloudRequests.map((x: any) => x.path), routingLookups: r.routingLookups, logs: r.logs.map((x: any) => `${x.context}: ${x.message}`) });
            }
        }
        return out;
    },
    async m12() {
        cloudNock('deny');
        const t = await tenant('m12');
        return attempt('DC host never answers (local hang)', t, () => uc(t, dcBasic(H('hang'))));
    },
    async m13() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        const fail = async (table: string, op: string, org: string) => { const id = 'qa2570_seq_' + randomUUID().replace(/-/g, ''); await ds.query(`create sequence ${id}`); await ds.query(`insert into qa2570_fail(tbl,op,org,seq) values ($1,$2,$3,$4)`, [table, op, org, id]); };
        for (const [label, tbl, op, seed] of [['auth insert fails', 'auth_integrations', 'INSERT', false], ['integration insert fails', 'integrations', 'INSERT', false],
            ['auth update fails (existing DC)', 'auth_integrations', 'UPDATE', true], ['integration update fails (existing DC)', 'integrations', 'UPDATE', true]] as any) {
            const t = await tenant('m13');
            if (seed) out.push(await attempt(`${label}: seed valid DC`, t, () => uc(t, dcBasic(H('okA')))));
            await fail(tbl, op, t.organizationId);
            out.push(await attempt(`${label}: first call`, t, () => uc(t, dcBasic(H('okB')))));
            out.push(await attempt(`${label}: retry`, t, () => uc(t, dcBasic(H('okB')))));
            const m = mark();
            const repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
            out.push({ label: `${label}: listing after retry`, names: repos.ok ? repos.result.map((x: any) => x.name) : repos.message, dcHosts: since(m).dcRequests.map((x: any) => x.mode) });
        }
        const t = await tenant('m13r');
        out.push(await attempt('socket reset mid-body', t, () => uc(t, dcBasic(H('reset')))));
        return out;
    },
    async m14() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        const t = await tenant('m14');
        out.push(await attempt('seed working DC (okA)', t, () => uc(t, dcBasic(H('okA')))));
        const [row] = await rows(t);
        await ds.query(`insert into integration_configs(uuid,"configKey","configValue",integration_id,team_id) values ($1,'repositories',$2,$3,$4) on conflict do nothing`,
            [randomUUID(), JSON.stringify([{ id: '9000', name: 'okA-repo0' }]), row.int_uuid, t.teamId]);
        for (const k of ['s401', 'html']) out.push(await attempt(`invalid reconnect ${k}`, t, () => uc(t, dcBasic(H(k)))));
        const m = mark();
        const repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
        out.push({ label: 'listing after the refused reconnects', names: repos.ok ? repos.result.map((x: any) => `${x.name}${x.selected ? '*' : ''}`) : repos.message, dcModes: since(m).dcRequests.map((x: any) => x.mode) });
        out.push({ label: 'selection rows', configs: await ds.query(`select "configKey", "configValue" from integration_configs where team_id=$1`, [t.teamId]) });
        const t2 = await tenant('m14c');
        cloudNock('ok');
        out.push(await attempt('seed Cloud via token (nock Cloud ok)', t2, () => uc(t2, { authMode: 'token', token: 'qa2570-cloud-pat', email: 'x@example.invalid' }), 'qa2570-cloud-pat'));
        out.push(await attempt('failed Cloud->DC conversion (401)', t2, () => uc(t2, dcBasic(H('s401')))));
        return out;
    },
    async m15() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        const t = await tenant('m15');
        out.push(await attempt('call 1 (response assumed lost by client)', t, () => uc(t, dcBasic(H('okA')))));
        out.push(await attempt('client retry with same body', t, () => uc(t, dcBasic(H('okA')))));
        const t2 = await tenant('m15b');
        process.env.SLOW_MS = '2500';
        const m = mark();
        const p = uc(t2, dcBasic(H('slow')));
        const raced = await Promise.race([p.then(() => 'server finished'), new Promise((r) => setTimeout(() => r('client gave up at 500ms'), 500))]);
        const rowsAtAbort = await rows(t2);
        const final = await call(() => p);
        await new Promise((r) => setTimeout(r, 200));
        out.push({ label: 'client abort during pending probe', raced, rowsAtAbort: rowsAtAbort.length, finalOk: final.ok, rowsAfter: (await rows(t2)).length, ...since(m) });
        return out;
    },
    // M16: run in N separate OS processes with TENANT=<org>:<team> and START_AT=<epoch ms>
    async race() {
        const [org, team] = String(process.env.TENANT).split(':');
        const t = { organizationId: org, teamId: team };
        const kind = process.env.RACE_KIND || 'dc';
        const token = process.env.RACE_TOKEN || PW;
        if (kind === 'cloud') cloudNock('ok'); else cloudNock('deny');
        expectedAuth = kind === 'dc' ? `Basic ${Buffer.from(`${USER}:${token}`).toString('base64')}` : undefined;
        const wait = Number(process.env.START_AT) - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const started = new Date().toISOString();
        const body = kind === 'cloud' ? { authMode: 'token', token, email: 'x@example.invalid' } : dcBasic(H(process.env.RACE_MODE || 'slow'), { token });
        const m = mark();
        const res = await call(() => uc(t, body));
        return { pid: process.pid, started, finished: new Date().toISOString(), ok: res.ok, result: res.result, httpStatus: (res as any).httpStatus, ...since(m) };
    },
    async m17() {
        expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        cloudNock('deny');
        const t = await tenant('m17');
        out.push(await attempt('DC host A', t, () => uc(t, dcBasic(H('okA')))));
        out.push(await attempt('DC host B on the same org', t, () => uc(t, dcBasic(H('okB')))));
        let m = mark();
        let repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
        out.push({ label: 'listing after A->B', names: repos.ok ? repos.result.map((x: any) => x.name) : repos.message, dcModes: since(m).dcRequests.map((x: any) => x.mode) });
        const t2 = await tenant('m17b');
        expectedAuth = 'Bearer qa2570-old-pat';
        out.push(await attempt('existing DC Bearer', t2, () => uc(t2, { authMode: 'token', host: H('bearer'), token: 'qa2570-old-pat' }), 'qa2570-old-pat'));
        expectedAuth = 'Bearer qa2570-new-pat';
        out.push(await attempt('resubmit with new PAT', t2, () => uc(t2, { authMode: 'token', host: H('bearer'), token: 'qa2570-new-pat' }), 'qa2570-new-pat'));
        m = mark();
        repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t2 }));
        out.push({ label: 'listing after PAT rotation', ok: repos.ok, n: repos.ok ? repos.result.length : repos.message, auth: since(m).dcRequests.map((x: any) => `${x.scheme}:${x.authMatches}`) });
        const t3 = await tenant('m17c');
        cloudNock('ok'); expectedAuth = `Basic ${B64}`;
        out.push(await attempt('Cloud connected (nock Cloud ok)', t3, () => uc(t3, { authMode: 'token', token: 'qa2570-cloud-pat', email: 'x@example.invalid' }), 'qa2570-cloud-pat'));
        out.push(await attempt('then DC submit on the Cloud org', t3, () => uc(t3, dcBasic(H('okC')))));
        return out;
    },
    async m18() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const t = await tenant('m18');
        return [await attempt('DC 401', t, () => uc(t, dcBasic(H('s401')))), await attempt('corrected DC', t, () => uc(t, dcBasic(H('ok'))))];
    },
    async m20() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const port = BASE.split(':').pop();
        const out: any[] = [];
        for (const [k, host] of [['trailing slash', H('ok') + '/'], ['double trailing slash', H('ok') + '//'], ['context path', `${BASE}/ctx/bitbucket/ok`],
            ['surrounding spaces', `  ${H('ok')}  `], ['no scheme', `127.0.0.1:${port}/ok`], ['/rest/api/1.0 appended', H('ok') + '/rest/api/1.0'],
            ['whitespace only', '   '], ['http + private IP (127.0.0.1 here)', H('ok')]]) {
            const t = await tenant('m20');
            const r = await attempt(k, t, () => uc(t, dcBasic(host)));
            out.push({ label: k, submitted: host.replace(BASE, '<base>'), ok: r.ok, httpStatus: r.httpStatus, dcPaths: r.dcRequests.map((x: any) => x.path), cloud: r.cloudRequests.length,
                storedHost: r.rows[0]?.host?.replace(BASE, '<base>'), logs: r.logs.map((x: any) => `${x.context}: ${x.message} ${x.errMsg ?? ''}`) });
        }
        return out;
    },
    async m21() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        const list: [string, any][] = [['host number', dcBasic(12345 as any)], ['host array', dcBasic([H('ok')] as any)], ['host object', dcBasic({ url: H('ok') } as any)],
            ['host ftp scheme', dcBasic('ftp://127.0.0.1/ok')], ['token number', dcBasic(H('ok'), { token: 12345 })], ['Basic without username', dcBasic(H('ok'), { username: undefined })],
            ['DC oauth', { authMode: 'oauth', host: H('ok'), code: 'x' }], ['DC missing token', { authMode: 'basic', host: H('ok'), username: USER }]];
        for (const [k, body] of list) { const t = await tenant('m21'); const r = await attempt(k, t, () => uc(t, body)); out.push({ label: k, ok: r.ok, httpStatus: r.httpStatus, name: (r as any).name, message: (r as any).message, rows: r.rows.length, dc: r.dcRequests.map((x: any) => `${x.path} ${x.scheme} match=${x.authMatches}`), logs: r.logs.map((x: any) => `${x.context}: ${x.message}`) }); }
        const t = await tenant('m21s');
        await attempt('seed DC', t, () => uc(t, dcBasic(H('okA'))));
        const r = await attempt('no-host re-create with stored DC', t, () => uc(t, { authMode: 'token', token: 'qa2570-x' }), 'qa2570-x');
        out.push({ label: r.label, ok: r.ok, httpStatus: r.httpStatus, message: (r as any).message, dc: r.dcRequests.length, cloud: r.cloudRequests.length, rows: r.rows.map((x: any) => ({ host: x.host?.replace(BASE, '<base>'), authMode: x.authMode })), logs: r.logs.map((x: any) => `${x.context}: ${x.message} ${x.errMsg ?? ''}`) });
        return out;
    },
    async m22() {
        cloudNock('deny');
        const out: any[] = [];
        for (const [k, pw, mode] of [['unicode', 'pä:ss/wörd🙂ç', 'basic'], ['colons', 'a:b:c', 'basic'], ['slashes', 'x/y\\z?&=', 'basic'], ['long PAT 4096', 'P'.repeat(4096), 'token']]) {
            expectedAuth = mode === 'basic' ? `Basic ${Buffer.from(`${USER}:${pw}`).toString('base64')}` : `Bearer ${pw}`;
            const t = await tenant('m22');
            const r = await attempt(k, t, () => uc(t, mode === 'basic' ? dcBasic(H('ok'), { token: pw }) : { authMode: 'token', host: H('ok'), token: pw }), pw);
            out.push({ label: k, ok: r.ok, header: r.dcRequests.map((x: any) => `${x.scheme} exact=${x.authMatches}`), stored: r.rows.map((x: any) => ({ plain: x.appPasswordIsPlain, roundtrip: x.decryptsToSubmitted })) });
        }
        return out;
    },
    async m23() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const out: any[] = [];
        for (const k of ['page2', 'empty']) {
            const t = await tenant('m23');
            const a = await attempt(`setup ${k}`, t, () => uc(t, dcBasic(H(k))));
            const m = mark();
            const repos = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t }));
            out.push({ setup: { ok: a.ok, result: (a as any).result, status: a.httpStatus, dc: a.dcRequests.map((x: any) => x.path) }, listing: { ok: repos.ok, names: repos.ok ? repos.result.map((x: any) => `${x.name}|id=${x.id}|org=${x.organizationName}|proj=${x.project?.name}|url=${x.http_url ? 'y' : 'n'}`) : repos.message, dc: since(m).dcRequests.map((x: any) => x.path) } });
        }
        return out;
    },
    async m24() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const t = await tenant('m24');
        const out: any = {};
        out.before = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: t }));
        out.setup = (await attempt('setup', t, () => uc(t, dcBasic(H('ok'))))).ok;
        out.afterSetup = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: t }));
        const [row] = await rows(t);
        await ds.query(`insert into integration_configs(uuid,"configKey","configValue",integration_id,team_id) values ($1,'repositories',$2,$3,$4)`,
            [randomUUID(), JSON.stringify([{ id: '9000', name: 'ok-repo0' }]), row.int_uuid, t.teamId]);
        out.afterSelection = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: t }));
        const otherTeam = randomUUID();
        await ds.query(`insert into teams(uuid,name,organization_id,status) values ($1,'qa2570-other',$2,'active')`, [otherTeam, t.organizationId]);
        out.otherTeamSameOrg = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: { organizationId: t.organizationId, teamId: otherTeam } }));
        const t2 = await tenant('m24f');
        out.failedSetup = (await attempt('failed setup', t2, () => uc(t2, dcBasic(H('s401'))))).httpStatus;
        out.afterFailed = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: t2 }));
        for (const k of Object.keys(out)) if (out[k]?.result?.config?.host) out[k].result.config.host = out[k].result.config.host.replace(BASE, '<base>');
        return out;
    },
    async m25() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        process.env.MCP_REJECT_MS = '2000';
        const t = await tenant('m25');
        const m = mark();
        const r = await call(() => uc(t, dcBasic(H('ok'))));
        const returnedMs = r.ms;
        await new Promise((res) => setTimeout(res, 3000));
        const after = since(m);
        const t2 = await tenant('m25b');
        const bad = await attempt('invalid probe', t2, () => uc(t2, dcBasic(H('s401'))));
        return { valid: { ok: r.ok, returnedMs, mcpCalls: after.mcpCalls, mcpErrorLogged: after.logs.filter((x: any) => /MCP/.test(x.message)).map((x: any) => x.message), unhandledRejections: [...unhandled], auditEvents: after.auditEvents, telemetry: after.telemetryCalls },
            invalid: { httpStatus: bad.httpStatus, mcpCalls: bad.mcpCalls, auditEvents: bad.auditEvents, telemetry: bad.telemetryCalls } };
    },
    async m26() {
        const out: any[] = [];
        expectedAuth = `Basic ${B64}`;
        cloudNock('deny');
        for (const [k, body] of [['401', dcBasic(H('s401'))], ['html', dcBasic(H('html'))], ['reset', dcBasic(H('reset'))], ['dns', dcBasic('http://qa2570-nohost.invalid')], ['refused', dcBasic('http://127.0.0.1:1')],
            ['500', dcBasic(H('s500'))], ['ok', dcBasic(H('ok'))], ['cloud basic no host', { authMode: 'basic', username: USER, token: PW }]] as [string, any][]) {
            const t = await tenant('m26');
            const l0 = logs.length, o0 = stdoutChunks.length;
            const r = await attempt(k, t, () => uc(t, body));
            const logText = logs.slice(l0).map((x) => JSON.stringify(x)).join('\n') + stdoutChunks.slice(o0).join('');
            const respText = JSON.stringify({ response: (r as any).response, result: (r as any).result, message: (r as any).message });
            out.push({ label: k, httpStatus: r.httpStatus ?? 200, logLevels: r.logs.map((x: any) => `${x.level}:${x.context}: ${x.message}`), responseMessage: (r as any).response,
                pwInLogs: logText.includes(PW), b64InLogs: logText.includes(B64), pwInResponse: respText.includes(PW), b64InResponse: respText.includes(B64) });
        }
        // cloud token path with nock ok, to look for the Cloud PAT in its own logs (checkRepositoryPermissions logs metadata: params)
        cloudNock('deny');
        const t = await tenant('m26c');
        const l0 = logs.length, o0 = stdoutChunks.length;
        await attempt('cloud token refused', t, () => uc(t, { authMode: 'token', token: 'qa2570-CLOUD-MARKER', email: 'x@example.invalid' }), 'qa2570-CLOUD-MARKER');
        const txt = logs.slice(l0).map((x) => JSON.stringify(x)).join('\n') + stdoutChunks.slice(o0).join('');
        out.push({ label: 'cloud token refused (out of PR scope)', cloudPatInLogs: txt.includes('qa2570-CLOUD-MARKER') });
        return out;
    },
    async m28() {
        cloudNock('deny');
        const seen: string[] = [];
        const out: any[] = [];
        for (const host of ['http://bitbucket.corp.internal:7990', 'http://10.20.30.40/bitbucket', 'https://192.168.10.5:8443']) {
            const s = nock(host).get(/.*/).reply(function (uri) { seen.push(`${host}${uri} auth=${String(this.req.headers.authorization || '').split(' ')[0]}`); return [200, page('int', 1)]; });
            const t = await tenant('m28');
            const r = await attempt(host, t, () => uc(t, dcBasic(host)));
            out.push({ host, ok: r.ok, httpStatus: r.httpStatus, storedHost: r.rows[0]?.host });
            s.done?.();
        }
        return { out, interceptedRequests: seen };
    },
    async m30() {
        cloudNock('deny'); expectedAuth = `Basic ${B64}`;
        const t = await tenant('m30');
        const r = await attempt('explicit host', t, () => uc(t, dcBasic(H('ok'))));
        const t2 = await tenant('m30b');
        const r2 = await attempt('no host, stored none', t2, () => uc(t2, { authMode: 'token', token: 'qa2570-cloud-pat', email: 'x@example.invalid' }), 'qa2570-cloud-pat');
        return { explicitHost: { ms: r.ms, routingLookups: r.routingLookups, dcRequests: r.dcRequests.map((x: any) => x.path) }, cloudNoHost: { routingLookups: r2.routingLookups, dcRequests: r2.dcRequests.length, cloudRequests: r2.cloudRequests.length } };
    },
    async x1() {
        // Cloud token path where listing repositories fails: checkRepositoryPermissions logs `metadata: params` (holds auth.token)
        nock.cleanAll();
        nock('https://api.bitbucket.org').persist().get(/.*/).reply(function (uri) {
            cloudLog.push({ t: new Date().toISOString(), method: 'GET', path: uri });
            if (uri.startsWith('/2.0/user/workspaces')) return [200, { values: [{ workspace: { uuid: '{w1}', slug: 'w' }, uuid: '{w1}', slug: 'w' }] }];
            if (uri.startsWith('/2.0/user')) return [200, { uuid: '{u1}', username: 'qa2570' }];
            return [500, { error: { message: 'boom' } }];
        });
        const t = await tenant('x1');
        const l0 = logs.length;
        const r = await attempt('cloud token, repo listing 500', t, () => uc(t, { authMode: 'token', token: 'qa2570-CLOUD-MARKER', email: 'x@example.invalid', username: 'u' }), 'qa2570-CLOUD-MARKER');
        const meta = logs.slice(l0).map((x) => x._raw).join('\n');
        return { ok: r.ok, result: (r as any).result, httpStatus: r.httpStatus, logs: r.logs.map((x: any) => x.message), tokenInProcessorMetadata: meta.includes('qa2570-CLOUD-MARKER') };
    },
    async m31() {
        cloudNock('deny');
        const enc = require('@libs/common/utils/crypto').encrypt;
        const out: any[] = [];
        const t1 = await tenant('m31a');
        await svc.cloud.addAccessToken(t1, { username: 'u', appPassword: enc('legacy-cloud'), email: 'e' }); // Cloud, no host key, no authMode
        let m = mark();
        let r = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t1 }));
        out.push({ label: 'legacy Cloud (no host key): getRepositories', ok: r.ok, ...(({ dcRequests, cloudRequests }) => ({ dc: dcRequests.length, cloud: cloudRequests.map((x: any) => x.path) }))(since(m)) });
        m = mark();
        r = await call(() => svc.facade.verifyConnection({ organizationAndTeamData: t1 }));
        out.push({ label: 'legacy Cloud: verifyConnection', ok: r.ok, host: r.ok ? r.result?.config?.host : r.message, dc: since(m).dcRequests.length });
        const t2 = await tenant('m31b');
        expectedAuth = 'Bearer legacy-dc';
        await svc.dc.addAccessToken(t2, { username: '', appPassword: enc('legacy-dc'), host: H('legacy') }); // DC, no authMode
        m = mark();
        r = await call(() => svc.facade.getRepositories({ organizationAndTeamData: t2 }));
        out.push({ label: 'legacy DC (no authMode): getRepositories', ok: r.ok, n: r.ok ? r.result.length : r.message, dc: since(m).dcRequests.map((x: any) => `${x.path} ${x.scheme} match=${x.authMatches}`) });
        m = mark();
        r = await call(() => svc.facade.createAuthIntegration({ organizationAndTeamData: t2, authMode: 'token', token: 'legacy-dc' }));
        out.push({ label: 'legacy DC: create without host (stored routing)', ok: r.ok, httpStatus: (r as any).httpStatus, message: (r as any).message, ...(({ dcRequests, cloudRequests, routingLookups }) => ({ dc: dcRequests.length, cloud: cloudRequests.length, routingLookups }))(since(m)) });
        return out;
    },
};

async function main() {
    const name = process.argv[2];
    await boot();
    let result: any;
    try { result = await cases[name](); } catch (e: any) { result = { harnessError: String(e?.stack || e).slice(0, 1500) }; }
    const scrub = (s: string) => s.split(BASE).join('<dc>');
    origOut('@@RESULT ' + scrub(JSON.stringify({ tree: TREE, case: name, result })) + '\n');
    if (process.env.DUMP_STDOUT) require('fs').writeFileSync(process.env.DUMP_STDOUT, stdoutChunks.join(''));
    await ds.destroy(); server.close(); process.exit(0);
}
main();
