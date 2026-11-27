import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
// @ts-ignore side-resolved
import { GlobalCacheModule } from '@side/libs/core/cache/cache.module';
// @ts-ignore
import { CacheService, cacheFootprint } from '@side/libs/core/cache/cache.service';

const SIDE = process.env.SIDE || '?';
const TOTAL = Number(process.env.TOTAL_CHARS || 3e9);
const HEAP_CAP = Number(process.env.HEAP_CAP_MB || 1e9);
const out: any = { side: SIDE, checkpoints: [], assertions: {}, errorLogs: [] };
const origErr = console.error;
// capture pino/logger error output written via stdout/stderr
const ow = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (c: any, ...a: any[]) => { const s = String(c); if (/"level":\s*("error"|50)|Error adding item|Error retrieving/.test(s)) out.errorLogs.push(s.slice(0, 300)); return ow(c, ...a); };
const ew = process.stderr.write.bind(process.stderr);
(process.stderr as any).write = (c: any, ...a: any[]) => { const s = String(c); if (/error/i.test(s)) out.errorLogs.push(s.slice(0, 300)); return ew(c, ...a); };

@Module({ imports: [GlobalCacheModule] })
class AppModule {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function hex(n: number) { let s = ''; while (s.length < n) s += Math.random().toString(16).slice(2); return s.slice(0, n); }
const BASE = hex(1 << 20) + hex(1 << 20) ; // 2M chars pool

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const cache: CacheService = app.get(CacheService);
    const cm: any = app.get(CACHE_MANAGER);
    const store: any = cm?.stores?.[0]?.store;
    out.storeClass = store?.constructor?.name;
    out.bounds = store?.bounds ?? null;
    const held = () => (typeof store?.heldChars === 'number' ? store.heldChars : null);
    const g: any = global as any;
    g.gc(); g.gc();
    const base0 = process.memoryUsage().heapUsed;
    out.baselineHeapMb = Math.round(base0 / 1048576);

    // S9/S10 probes
    await cache.addToCache('cli:trial:fp-qa2744', { timestamps: [Date.now()] }, 3600_000);
    await cache.addToCache('notice:no-license:org-qa2744:2026-11-27', true, 24 * 3600_000);
    await cache.addToCache('ttl1s:qa2744', { v: 1 }, 1000);
    const ttlSetAt = Date.now();
    out.assertions.ttl1s = null;

    let inserted = 0, sets = 0, nextCp = 100 * 1048576, n = 0;
    let limiterMisses = 0, flagMisses = 0, stoppedByHeapCap = false;
    const t0 = Date.now();
    while (inserted < TOTAL) {
        const size = 20_000 + Math.floor(Math.random() * 380_000);
        const off = Math.floor(Math.random() * (BASE.length - size));
        const sha = hex(40);
        const value = { sha, path: `src/module${n % 97}/file${n}.ts`, content: BASE.slice(off, off + size) };
        await cache.addToCache(`gh:org-qa2744:repo:${n}:${sha}`, value, 3600_000);
        inserted += JSON.stringify(value).length; // the length addToCache stores
        sets++; n++;
        if (sets % 100 === 0) { const v = await cache.getFromCache('cli:trial:fp-qa2744'); if (!v) limiterMisses++; }
        if (sets % 10_000 === 0) { const v = await cache.getFromCache('notice:no-license:org-qa2744:2026-11-27'); if (!v) flagMisses++; }
        if (out.assertions.ttl1s === null && Date.now() - ttlSetAt >= 2000) {
            out.assertions.ttl1s = { readAfterMs: Date.now() - ttlSetAt, value: await cache.getFromCache('ttl1s:qa2744') };
        }
        if (inserted >= nextCp) {
            g.gc();
            const mu = process.memoryUsage();
            const fp = cacheFootprint(cm);
            const cp = { insertedMb: Math.round(inserted / 1048576), heapUsedAfterGcMb: Math.round(mu.heapUsed / 1048576), rssMb: Math.round(mu.rss / 1048576), entries: fp.entries, expired: fp.expired, valueMb: fp.valueMb, heldChars: held(), sec: Math.round((Date.now() - t0) / 1000) };
            out.checkpoints.push(cp);
            console.log(JSON.stringify(cp));
            nextCp += 100 * 1048576;
            if (mu.heapUsed / 1048576 > HEAP_CAP) { stoppedByHeapCap = true; break; }
        }
    }
    out.totalInsertedMb = Math.round(inserted / 1048576); out.sets = sets; out.stoppedByHeapCap = stoppedByHeapCap;
    if (out.assertions.ttl1s === null) { await sleep(2100); out.assertions.ttl1s = { readAfterMs: Date.now() - ttlSetAt, value: await cache.getFromCache('ttl1s:qa2744') }; }
    out.assertions.limiter = { readEvery: 100, misses: limiterMisses, presentAtEnd: !!(await cache.getFromCache('cli:trial:fp-qa2744')) };
    out.assertions.dailyFlag = { readEvery: 10000, misses: flagMisses, presentAtEnd: !!(await cache.getFromCache('notice:no-license:org-qa2744:2026-11-27')) };

    // S10: 9M-char value
    const heldBefore = held(); const errsBefore = out.errorLogs.length;
    const big = 'x'.repeat(9_000_000);
    await cache.addToCache('big:9m:qa2744', big, 3600_000);
    const bigRead = await cache.getFromCache<string>('big:9m:qa2744');
    out.assertions.big9m = { readIsNull: bigRead === null, readLength: bigRead ? (bigRead as any).length : 0, heldBefore, heldAfter: held(), newErrorLogs: out.errorLogs.length - errsBefore };

    // S9 extra: 60k distinct small keys churned while one limiter key is read every 1,000 sets
    await cache.addToCache('cli:auth:team-qa2744', { timestamps: [1] }, 3600_000);
    await cache.addToCache('small:oldest-unread:qa2744', { a: 1 }, 3600_000);
    let authMisses = 0;
    for (let i = 0; i < 60_000; i++) {
        await cache.addToCache(`small:churn:${i}`, { i, t: Date.now() }, 3600_000);
        if (i % 1000 === 0) { if (!(await cache.getFromCache('cli:auth:team-qa2744'))) authMisses++; }
    }
    const fpEnd = cacheFootprint(cm);
    out.assertions.smallChurn60k = {
        readKeyMisses: authMisses,
        readKeyPresentAtEnd: !!(await cache.getFromCache('cli:auth:team-qa2744')),
        oldestUnreadPresentAtEnd: !!(await cache.getFromCache('small:oldest-unread:qa2744')),
        firstChurnKeyPresent: !!(await cache.getFromCache('small:churn:0')),
        lastChurnKeyPresent: !!(await cache.getFromCache('small:churn:59999')),
        entriesAtEnd: fpEnd.entries, valueMbAtEnd: fpEnd.valueMb,
        limiterFromMainPhasePresent: !!(await cache.getFromCache('cli:trial:fp-qa2744')),
        dailyFlagFromMainPhasePresent: !!(await cache.getFromCache('notice:no-license:org-qa2744:2026-11-27')),
    };
    g.gc();
    out.finalHeapUsedMb = Math.round(process.memoryUsage().heapUsed / 1048576);
    await app.close();
    require('fs').writeFileSync(process.env.OUT!, JSON.stringify(out, null, 1));
    process.exit(0);
}
main().catch((e) => { origErr(e); process.exit(1); });
