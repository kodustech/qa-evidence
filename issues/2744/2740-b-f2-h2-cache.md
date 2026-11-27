# #2744 H2: global cache growth (slot b, fork F2)

Real `GlobalCacheModule` + `CacheService` in a Nest application context, bundled with esbuild from merge `aeb08f11f` and first parent `b172fdbac`; mutant = merge with `GLOBAL_CACHE_BOUNDS` set to Infinity. Node 22, `--max-old-space-size=8192 --expose-gc`. Driver: `CacheService.addToCache` of GitHub-shaped `{sha,path,content}` values (20-400 KB JSON, TTL 1 h, keys with a fresh sha, never read again) until 3e9 chars (2,861 MB) inserted; parent and mutant stopped at heapUsed 2.6 GB to protect the 16 GB host. `gc()` then `heapUsed` and the real `cacheFootprint()` every 100 MB.

## S7 checkpoints (heapUsed after gc MB / entries / valueMb)

| inserted MB | merge | parent | mutant (unbounded) |
|---|---|---|---|
| 100 | 112 / 491 / 100.2 | 112 / 490 / 100.2 | 112 / 496 / 100.2 |
| 300 | 269 / 1295 / 255.9 | 313 / 1478 / 300.1 | 313 / 1491 / 300.2 |
| 500 | 269 / 1304 / 255.9 | 513 / 2490 / 500.1 | 513 / 2486 / 500.1 |
| 1000 | 269 / 1301 / 255.9 | 1014 / 4976 / 1000.1 | 1015 / 4980 / 1000.3 |
| 1500 | 269 / 1237 / 256 | 1514 / 7461 / 1500.1 | 1516 / 7473 / 1500.4 |
| 2000 | 269 / 1303 / 255.9 | 2015 / 9933 / 2000 | 2017 / 9968 / 2000.5 |
| 2500 | 269 / 1309 / 256 | 2516 / 12417 / 2500.2 | 2519 / 12528 / 2500.6 |
| 2600 | 269 / 1287 / 255.7 | 2616 / 12905 / 2600.1 | 2619 / 13010 / 2600.6 |
| 2800 | 269 / 1273 / 256 | stopped (heap cap) | stopped (heap cap) |

Baseline heap 12 MB on every side. Merge plateaus at 269 MB heap, ~1,300 entries, 256 MB of values from 500 MB inserted to the end; parent and mutant grow 1:1 with insertions (2.6 GB at 2.6 GB inserted).

## S9 / S10 assertions

| check | merge | parent | mutant |
|---|---|---|---|
| 1 s TTL key read at 2 s | None | None | None |
| limiter key (read every 100 sets) misses | 0 | 0 | 0 |
| limiter key present at end | True | True | True |
| 24 h flag (read every 10k sets) present at end | True | True | True |
| 9M-char value read back is null | True | False | False |
| heldChars before / after 9M set | 268426169 / 268426169 | None / None | 2726923936 / 2735923976 |
| error logs from the 9M set | 0 | 0 | 0 |
| 60k small churn: key read every 1,000 sets misses | 0 | 0 | 0 |
| 60k churn: read key present | True | True | True |
| 60k churn: oldest unread key present | False | True | True |
| 60k churn: entries at end | 50000 | 72908 | 73013 |
| after churn: main-phase 24 h flag (unread during churn) present | False | True | True |

## S11 value types reaching the store (merge)

Real services instantiated over the real `CacheService`; only their external deps stubbed (GitHub octokit `/rate_limit`, parameters, license, notification emit). `BoundedMemoryStore.prototype.set` wrapped to record `typeof value`.

| caller | key | typeof | length |
|---|---|---|---|
| TrialRateLimiterService | `keyv:cli:trial:ratelimit:fp-qa2744` | string | 68 |
| AuthenticatedRateLimiterService | `keyv:cli:auth:ratelimit:team-qa2744` | string | 68 |
| NotificationRateLimiter | `keyv:notice:qa2744` | string | 40 |
| ByokErrorCounter | `keyv:byok:errors:org-qa2744` | string | 100 |
| SandboxEgressPolicyService | `keyv:sandbox-egress:plan:org-qa2744` | string | 54 |
| SandboxEgressPolicyService | `keyv:sandbox-egress:plan:org-qa2744` | string | 54 |
| SandboxEgressPolicyService | `keyv:sandbox-egress:fixed-ip:org-qa2744` | string | 55 |
| GitHubRateLimitGateService | `keyv:rl:github:org-qa2744:team-qa2744` | string | 127 |
| direct-cacheManager-set-object | `keyv:direct:object:qa2744` | string | 41 |

Every value reaches the store as a string, including a direct `CACHE_MANAGER.set` of an object (Keyv serializes before the store).

## Observation

With the merge, a small key that is not read is evicted once 50,000 newer entries arrive (the entry cap), even inside its TTL: after the 60k small-key churn the main phase's 24 h "once a day" flag was gone (the parent and the mutant kept it). The store's own comment states this ("small entries leave by the entry cap"). It only matters if a worker writes more than 50k distinct cache keys within the flag's TTL; with GitHub-sized values the size budget keeps entries near 1,300.
