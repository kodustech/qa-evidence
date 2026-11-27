# #2744 audit rerun, S9 with production read cadence (harness, merge aeb08f11f vs parent b172fdbac)

Real `GlobalCacheModule` + `CacheService` + `BoundedMemoryStore` (merge) in a Nest application context, real `NotificationRateLimiter.shouldEmit` (instantiated by hand; esbuild drops DI metadata). One process per scenario. Mutant = merge with `GLOBAL_CACHE_BOUNDS` = Infinity.

Flag: the real no-license notification dedupe, `notif-rate:review_skipped_no_license:<user>:<org>`, TTL 24 h (`validate-prerequisites.stage.ts:79,1481`), written by `shouldEmit`, read only on the next no-license skip for the same author (once a day at most in production). Churn: distinct small keys shaped like real writers (`gh:contents:<org>/<repo>:<blob sha>:<path>` small file 24 h, `gh:user:<org>:<login>` 24 h, `etag:<org>:<team>:GET ...` 24 h, `azure_webhook:<pr>:<hash>` 60 s, `cli:trial:ratelimit:<fp>` 1 h, `gh:default-branch:<org>:<repo>` 24 h); values 30-880 chars. The flag is read ONCE, at the end, through a second `shouldEmit`.

| scenario | merge | parent | mutant (unbounded) |
|---|---|---|---|
| 40,000 keys after the flag | flag kept, no 2nd emit | kept | kept |
| 49,999 keys (store at 50,000) | kept | kept | kept |
| 60,000 keys | **flag evicted, 2nd `shouldEmit` = true (duplicate notice)**, entries 50,000 | kept (60,001 entries) | kept |
| 100,000 keys | **evicted, duplicate notice** | kept (100,001) | kept |
| 60,000 keys with 1 s TTL, all expired, wait 2 s, 1,000 live writes | **evicted**: expired entries are not purged before live ones are evicted (Keyv drops an expired key only when that key is read) | kept | kept |

Result: at the merge, any 50,000 distinct cache keys written after the flag (expired or not, any size) evict it before its 24 h TTL. Consequence (caller code): `NotificationRateLimiter.shouldEmit` returns true again, so `review.skipped_no_license` is emitted again to the same author/owners within 24 h. The same rate limiter dedupes the BYOK failure alert (`byok-error-counter.service.ts:85`, 1 h cooldown key), so it can repeat too if 50,000 keys are written within that hour. The PR comment itself is not duplicated (persisted as `licenseNoticePostedAt` in the execution data).

How likely in production: the store never sweeps expired entries, so the entry count only falls by eviction; every distinct key a worker ever writes stays until 50,000 newer ones push it out. Per review the GitHub service writes one `gh:contents` key per changed/context file (blob sha, 24 h), `gh:user` keys, ETag entries per allow-listed GET, plus dedupe/limiter keys. A worker doing a few thousand reviews a day with tens of file reads each reaches 50,000 distinct keys within 24 h. Measured data: QA EventLoopMonitor `gauges.cache.entries` max 38 (light load); no production gauge read.
