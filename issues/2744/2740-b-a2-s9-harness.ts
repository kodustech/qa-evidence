import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
// @ts-ignore
import { GlobalCacheModule } from '@side/libs/core/cache/cache.module';
// @ts-ignore
import { CacheService } from '@side/libs/core/cache/cache.service';
// @ts-ignore
import { NotificationRateLimiter } from '@side/libs/notifications/application/notification-rate-limiter.service';

const SIDE = process.env.SIDE || '?';
@Module({ imports: [GlobalCacheModule] })
class AppModule {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function hex(n: number) { let s = ''; while (s.length < n) s += Math.random().toString(16).slice(2); return s.slice(0, n); }
const DAY = 24 * 3600_000;

async function ctx() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const cache: CacheService = app.get(CacheService);
    const rl: NotificationRateLimiter = new NotificationRateLimiter(cache);
    const cm: any = app.get(CACHE_MANAGER);
    const store: any = cm?.stores?.[0]?.store;
    return { app, cache, rl, store };
}
// small writers shaped like production: gh:contents of small files (blob sha, 24h), gh:user (24h),
// etag entries (24h), azure webhook dedupe (60s), cli trial limiter (window), byok errors (window)
function smallKey(i: number) {
    const k = i % 6;
    const sha = hex(40);
    switch (k) {
        case 0: return { key: `gh:contents:org/repo:${sha}:src/small/file${i}.ts`, val: { content: hex(300 + (i % 500)), encoding: 'utf-8', sha }, ttl: DAY };
        case 1: return { key: `gh:user:org-${i % 50}:user${i}`, val: { login: `user${i}`, name: `User ${i}`, id: i }, ttl: DAY };
        case 2: return { key: `etag:org-${i % 50}:team:GET /repos/o/r/pulls/${i}`, val: { etag: `W/"${sha}"`, data: { n: i } }, ttl: DAY };
        case 3: return { key: `azure_webhook:${i}:${sha}`, val: true, ttl: 60_000 };
        case 4: return { key: `cli:trial:ratelimit:${sha}`, val: { timestamps: [Date.now()] }, ttl: 3600_000 };
        default: return { key: `gh:default-branch:org-${i}:repo-${i}`, val: 'main', ttl: DAY };
    }
}
async function scenarioChurn(N: number) {
    const { app, cache, rl, store } = await ctx();
    const flagKey = `notif-rate:review_skipped_no_license:user-42:org-qa2744`;
    const first = await rl.shouldEmit(flagKey, 24 * 60 * 60);
    let maxEntries = 0; let smallChars = 0;
    for (let i = 0; i < N; i++) {
        const s = smallKey(i);
        await cache.addToCache(s.key, s.val, s.ttl);
        smallChars = Math.max(smallChars, JSON.stringify(s.val).length);
        if (store?.size > maxEntries) maxEntries = store.size;
    }
    const flagPresent = !!(await cache.getFromCache(flagKey));
    const second = await rl.shouldEmit(flagKey, 24 * 60 * 60);
    const r = { scenario: `churn ${N} small keys, flag read once at end`, firstEmit: first, flagPresentAtEnd: flagPresent, secondEmitAllowed: second, duplicateNotice: second === true, entriesAtEnd: store?.size, maxEntries, largestSmallValueChars: smallChars };
    await app.close();
    return r;
}
async function scenarioExpired(N: number) {
    const { app, cache, rl, store } = await ctx();
    const flagKey = `notif-rate:review_skipped_no_license:user-43:org-qa2744`;
    await rl.shouldEmit(flagKey, 24 * 60 * 60);
    // N short-lived dedupe keys (azure webhook style, but 1 s TTL), all expired before the next writes
    for (let i = 0; i < N; i++) await cache.addToCache(`azure_webhook:${i}:${hex(40)}`, true, 1000);
    const afterExpiredBurst = store?.size;
    await sleep(2000);
    // a few live writes after the burst expired
    for (let i = 0; i < 1000; i++) await cache.addToCache(`gh:user:org-1:late${i}`, { login: `late${i}` }, DAY);
    const flagPresent = !!(await cache.getFromCache(flagKey));
    const r = { scenario: `flag, then ${N} keys with 1 s TTL (expired), 2 s wait, 1,000 live writes, flag read`, entriesAfterBurst: afterExpiredBurst, entriesAtEnd: store?.size, flagPresentAtEnd: flagPresent };
    await app.close();
    return r;
}
async function main() {
    const out: any = { side: SIDE, results: [] };
    const t0 = Date.now();
    const sc = process.env.SCEN || 'churn:60000';
    const [kind, n] = sc.split(':');
    out.results.push(kind === 'expired' ? await scenarioExpired(Number(n)) : await scenarioChurn(Number(n)));
    out.ms = Date.now() - t0;
    require("fs").writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
