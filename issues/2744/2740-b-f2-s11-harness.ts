import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// @ts-ignore
import { GlobalCacheModule } from '@side/libs/core/cache/cache.module';
// @ts-ignore
import { CacheService } from '@side/libs/core/cache/cache.service';
// @ts-ignore
import { BoundedMemoryStore } from '@side/libs/core/cache/bounded-memory-store';
// @ts-ignore
import { TrialRateLimiterService } from '@side/libs/cli-review/infrastructure/services/trial-rate-limiter.service';
// @ts-ignore
import { AuthenticatedRateLimiterService } from '@side/libs/cli-review/infrastructure/services/authenticated-rate-limiter.service';
// @ts-ignore
import { NotificationRateLimiter } from '@side/libs/notifications/application/notification-rate-limiter.service';
// @ts-ignore
import { ByokErrorCounter } from '@side/libs/notifications/application/byok-error-counter.service';
// @ts-ignore
import { SandboxEgressPolicyService } from '@side/libs/sandbox/infrastructure/services/sandbox-egress-policy.service';
// @ts-ignore
import { GitHubRateLimitGateService } from '@side/libs/platform/infrastructure/adapters/services/github/github-rate-limit-gate.service';
// @ts-ignore
import { PlatformType } from '@side/libs/core/domain/enums/platform-type.enum';

const rec: any[] = [];
let current = '';
const origSet = BoundedMemoryStore.prototype.set;
BoundedMemoryStore.prototype.set = function (k: string, v: any) { rec.push({ service: current, key: k, typeofValue: typeof v, length: typeof v === 'string' ? v.length : null }); return origSet.call(this, k, v); };

@Module({ imports: [GlobalCacheModule] })
class AppModule {}

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const cache: CacheService = app.get(CacheService);
    const org = { organizationId: 'org-qa2744', teamId: 'team-qa2744' };
    const calls: Record<string, () => Promise<any>> = {
        TrialRateLimiterService: () => new TrialRateLimiterService(cache).checkRateLimit('fp-qa2744'),
        AuthenticatedRateLimiterService: () => new AuthenticatedRateLimiterService(cache).checkRateLimit('team-qa2744'),
        NotificationRateLimiter: () => new NotificationRateLimiter(cache).shouldEmit('notice:qa2744', 86400),
        ByokErrorCounter: () => new ByokErrorCounter(cache, { emit: async () => {} } as any, new NotificationRateLimiter(cache)).record({ organizationId: 'org-qa2744', provider: 'openai', errorMessage: 'x', category: 'QUOTA_EXCEEDED' }),
        SandboxEgressPolicyService: async () => {
            const svc = new SandboxEgressPolicyService(
                { findByKey: async () => null } as any,
                { findByKey: async () => null, createOrUpdateConfig: async () => ({}) } as any,
                cache,
                { validateOrganizationLicense: async () => ({ valid: true, subscriptionStatus: 'active', planType: 'enterprise_byok' }) } as any,
            );
            const a = await svc.fixedIpAllowed(org);
            const b = await svc.setFixedIp?.('org-qa2744', true).catch((e: any) => 'setFixedIp threw: ' + e?.message);
            return { fixedIpAllowed: a, setFixedIp: b };
        },
        GitHubRateLimitGateService: () => new GitHubRateLimitGateService(
            { getAuthenticatedOctokit: async () => ({ rest: { rateLimit: { get: async () => ({ data: { resources: { core: { remaining: 4000, reset: Math.floor(Date.now() / 1000) + 3600 } } } }) } } }) } as any,
            cache,
        ).check(org, PlatformType.GITHUB),
    };
    const results: any = {};
    for (const [name, fn] of Object.entries(calls)) {
        current = name;
        try { results[name] = { ok: true, ret: await fn() }; } catch (e: any) { results[name] = { ok: false, error: String(e?.message ?? e) }; }
    }
    current = 'direct-cacheManager-set-object';
    const cm: any = app.get(require('@nestjs/cache-manager').CACHE_MANAGER);
    await cm.set('direct:object:qa2744', { a: 1 }, 1000);
    console.log(JSON.stringify({ results, storeSets: rec }, null, 1));
    await app.close();
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
