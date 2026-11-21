# #2619 QA checks (QA Mongo kodus_db, read-only except own test sessions)

Before = old code on QA (2026-11-20 19:2x UTC, last restart 19:01). After = QA running c37e98b36 / bd0a05852 (both contain merge 23ca5866c), restarts 20:01 and 22:29 UTC.

## 1. Connections by appName ($currentOp, own user, idleConnections, primary)

Before:
```json
[
 {
  "_id": {
   "drv": "nodejs|Mongoose",
   "ver": "7.5.0|9.9.4"
  },
  "n": 45
 },
 {
  "_id": {
   "drv": "nodejs",
   "ver": "7.6.0"
  },
  "n": 35
 },
 {
  "_id": {
   "drv": "nodejs",
   "ver": "7.1.0"
  },
  "n": 1
 }
]
```
After (2026-11-21T13:31:17.781Z; the unnamed connections on Node v25 / driver 7.1.0 are the mongosh session running this query):
```json
[
 {
  "_id": {
   "appName": "kodus-worker-code-review",
   "driver": "7.5.0|9.9.4",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 10
 },
 {
  "_id": {
   "appName": "kodus-api",
   "driver": "7.5.0|9.9.4",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 10
 },
 {
  "_id": {
   "appName": "kodus-worker-security-scan",
   "driver": "7.5.0|9.9.4",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 5
 },
 {
  "_id": {
   "appName": "kodus-worker-analytics",
   "driver": "7.5.0|9.9.4",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 5
 },
 {
  "_id": {
   "driver": "7.1.0",
   "platform": "Node.js v25.8.0, LE"
  },
  "connections": 2
 },
 {
  "_id": {
   "appName": "kodus-worker-code-review-exporter",
   "driver": "7.6.0",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 2
 },
 {
  "_id": {
   "appName": "kodus-worker-analytics-exporter",
   "driver": "7.6.0",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 1
 },
 {
  "_id": {
   "appName": "kodus-worker-security-scan-exporter",
   "driver": "7.6.0",
   "platform": "Node.js v22.23.4, LE"
  },
  "connections": 1
 }
]
```
$queryStats and the profiler return Unauthorized for the QA user; they key on the same client application name shown here.

## 2. New indexes (after)
```json
{
 "sess": [
  {
   "name": "sessionData.lastActivityTimestamp_1",
   "key": {
    "sessionData.lastActivityTimestamp": 1
   },
   "expireAfterSeconds": 86400
  },
  {
   "name": "ttl_updatedAt",
   "key": {
    "updatedAt": 1
   },
   "expireAfterSeconds": 2592000
  }
 ],
 "tel": [
  {
   "name": "timestamp_1",
   "key": {
    "timestamp": 1
   }
  },
  {
   "name": "tenantId_1",
   "key": {
    "tenantId": 1
   }
  },
  {
   "name": "correlationId_1",
   "key": {
    "correlationId": 1
   }
  },
  {
   "name": "tu_cred_byok_v1",
   "key": {
    "attributes.organizationId": 1,
    "attributes.tu.isByok": 1,
    "timestamp": 1,
    "attributes.tu.model": 1,
    "attributes.tu.credentialId": 1
   },
   "partial": {
    "attributes.tu.isByok": true,
    "attributes.tu.credentialId": {
     "$gt": ""
    }
   }
  }
 ]
}
```
Before the deploy neither ttl_updatedAt nor tu_cred_byok_v1 existed.

## 3. Credential pairs, PoisonIvy (busiest BYOK org this month), November

| match | pairs | docsExamined before index | docsExamined after index | index |
|---|---|---|---|---|
| old `$nin: ['', null]` | 22 | 3520 | 3521 | tu_cover_byok_v3 |
| new `$gt: ''` | 22 | 3520 | 0 | tu_cred_byok_v1 |

Same pairs from both matches: True. All BYOK spans in the window store credentialId as a string: [{"_id": "string", "n": 3521}].

## 4. Agent session retention

Snapshot before (2026-11-20T19:24:36.250Z): 76 sessions with updatedAt older than 30 days, 13 newer, 20 legacy without updatedAt.

After (2026-11-21T13:31:57.993Z): old remaining 0/76, recent remaining 13/13, legacy remaining 20/20 (legacy is left to the purge script, not run).

Own test documents in a fake org (qa-2619-ttl-test), inserted 13:32:11 UTC: idle31d (updatedAt 31 days ago) was gone at 13:33:22; fresh (updatedAt now) kept; replied (inserted with updatedAt 31 days ago, then updatedAt set to now, as an append does) kept. The two kept test documents were deleted afterwards.

## 5. API responses, PoisonIvy, old code vs new code

Token usage on the fixed window 2026-11-01..2026-11-19. sha = hash of the response body.

| endpoint | before | after | same |
|---|---|---|---|
| /code-review/custom-agents/status | 403 f33288d7e407 | 403 f335a115fcb8 | no |
| /issues/count | 200 10aa738f6746 | 200 10aa738f6746 | yes |
| /issues/count?repositoryName=.* | 200 10aa738f6746 | 200 771636959cf5 | no |
| /issues/count?title=.* | 200 10aa738f6746 | 200 771636959cf5 | no |
| /issues/count?title=a | 200 774ef727af46 | 200 774ef727af46 | yes |
| /spend-limit/status | 404 74234e98afe7 | 404 74234e98afe7 | yes |
| /usage/cost-estimate | 200 e88bc787dd6a | 200 e5409d7852b8 | no |
| /usage/tokens/by-area?startDate=2026-11-01&endDate=2026-11-19 | 200 68d73c02ed10 | 200 68d73c02ed10 | yes |
| /usage/tokens/by-developer?startDate=2026-11-01&endDate=2026-11-19 | 200 4b9c347f3a7a | 200 4b9c347f3a7a | yes |
| /usage/tokens/by-pr?startDate=2026-11-01&endDate=2026-11-19 | 200 102dad8e4d0c | 200 102dad8e4d0c | yes |
| /usage/tokens/by-review?startDate=2026-11-01&endDate=2026-11-19 | 200 c76ecdbfcb96 | 200 2515de78b86b | no |
| /usage/tokens/daily-by-developer?startDate=2026-11-01&endDate=2026-11-19 | 200 ecf3418de14e | 200 ecf3418de14e | yes |
| /usage/tokens/daily-by-pr?startDate=2026-11-01&endDate=2026-11-19 | 200 4d6e435096e6 | 200 4d6e435096e6 | yes |
| /usage/tokens/daily?startDate=2026-11-01&endDate=2026-11-19 | 200 cf94a1ce3c66 | 200 cf94a1ce3c66 | yes |
| /usage/tokens/overview?startDate=2026-11-01&endDate=2026-11-19 | 200 2171b1f5b58b | 200 32052214073a | no |
| /usage/tokens/summary?startDate=2026-11-01&endDate=2026-11-19 | 200 eb8ea84f6061 | 200 eb8ea84f6061 | yes |

Differences explained:
- issues/count title=.* and repositoryName=.*: 222 -> 0, the literal match the PR introduces. title=a and no filter unchanged (217, 222).
- tokens/by-review: the same 322 rows ignoring order and startedAt; two consecutive calls on the new code also differ in startedAt, so this is pre-existing nondeterminism in a pipeline the PR does not touch.
- tokens/overview: byTaskModelSpan holds the same items in a different order.
- cost-estimate: its 14-day window rolls with the clock (18 h apart); developerCount 4 both times. Old per-PR lookup vs new batched lookup, emulated on QA data for the 12 busiest orgs: identical developer counts, including 3 orgs where a PR number repeats across repositories.
- custom-agents/status: 403 both times (QA account role), only the error timestamp differs. spend-limit/status: 404 both times (no limit configured).
