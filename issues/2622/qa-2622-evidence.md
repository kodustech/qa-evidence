# QA #2622 / PR #2609 evidence

## 1. Real review on QA (PoisonIvy org, kodustech/poison_store PR #499, DeepSeek V4.1 Flash via Fireworks)

Setup, 2026-11-21 13:40 UTC: five rules created through the API on repository poison_store (path `**/*.rb`):
`QA-2622 live` (active), `QA-2622 deleted` (deleted through `DELETE /kody-rules/delete-rule-in-organization-by-id`),
`QA-2622 rejected` (`POST /kody-rules/change-status-kody-rules`), and two `QA-2622 locked` rules set to `status: paused, lockedByPlan: true`
directly in Mongo (plan-lock state; the org's plan is not limited, so the review's sync must unlock them).
The org's rules document then held 23 rules: 11 deleted, 9 active, 2 paused (plan-locked), 1 rejected.

PR #499 adds `app/services/restock_notifier.rb` that violates all five rules (`puts`, `sleep`, `rand`, `$global`, `eval`).

- 13:43:44 `KodyRulesService` "Synchronized Kody Rules with current plan limits in MongoDB" `isLimited:false, updatedRuleCount:2`; both locked rules are `active, lockedByPlan:false` afterwards. No "Failed per-rule updates" log.
- Kody Rules judge (Langfuse trace `1f6eb8f7032764582988f26b6fee148a`, observation `0d8077207899e091`, 13:44:02, input not truncated): which org rules it received

| Rule | Status after review | In judge input | Rule path (when it excludes the file) |
|---|---|---|---|
| Use Turbo-compatible data attributes for destructive links i | deleted | no |  |
| Implement all required model validations for business rules | deleted | no |  |
| Use Early Returns to Exclude Special Cases like days_supply  | active | yes |  |
| Avoid Magic Numbers for Domain States | active | yes |  |
| Match Public Method and Module Names to the Requirement | active | yes |  |
| Verify Model Attributes Exist Before Reading Them | active | yes |  |
| Loyalty points are computed in the Customer model, never in  | active | no | app/controllers/** |
| Always sanitize user inputs | deleted | no |  |
| QA 2347 probe rule | deleted | no |  |
| QA 2347 skill rule | deleted | no |  |
| QA 2335: no literal 0 for totals | deleted | no |  |
| QA 2521: no console.log or console.debug | deleted | no |  |
| QA-2509 Ruby debugging and dynamic code hygiene | active | no | qa2509/** |
| QA-2509 No HACK markers | active | no | qa2509/** |
| QA-2589 Do not duplicate an existing repository helper | deleted | no |  |
| Clarify Fraction vs Percentage Parameter Units | active | yes |  |
| QA-2428 compiler A: no puts | deleted | no |  |
| QA-2428 compiler B: no binding.pry | deleted | no |  |
| QA-2622 live: no sleep calls | active | yes |  |
| QA-2622 deleted: no puts statements | deleted | no |  |
| QA-2622 rejected: no rand calls | rejected | no |  |
| QA-2622 locked: no global variables | active | yes |  |
| QA-2622 locked: no eval | active | yes |  |

Every active rule whose path covers the file reached the judge; no deleted or rejected rule did.
- Comments posted: `QA-2622 live` (line 10, sleep), `QA-2622 locked: no global variables` (line 2), `QA-2622 locked: no eval` (line 13), plus two Bug findings. None for `puts` (deleted rule) or `rand` (rejected rule).

## 2. Local harness, merge `c37e98b` vs first parent `1a89a2e`, docker MongoDB 7 (replica set)

Harness: [qa2622.harness.spec.ts](qa2622.harness.spec.ts). Same file at both commits.

### Merge c37e98b
```
QA2622 read {"codeBaseConfig.service.ts":{"method":"findLiveRulesByOrganizationId","rulesReturned":3,"deletedReturned":0,"replyBytes":[2657],"ms":4,"appliedPaid":["r1","r2"],"appliedFree":["r1"]},"execute-cli-review.use-case.ts":{"method":"findLiveRulesByOrganizationId","rulesReturned":3,"deletedReturned":0,"replyBytes":[2657],"ms":2,"appliedPaid":["r1","r2"],"appliedFree":["r1"]}}
QA2622 sync {"lock":{"commands":["find","update","find"],"after":{"total":115,"lockedPaused":["a11","a12","a13","a14","a15"],"active":10,"textIntact":true}},"unlock":{"commands":["find","update","find"],"after":{"total":115,"lockedPaused":[],"active":15,"textIntact":true}}}
QA2622 find {"limited: first call":{"commands":["aggregate"],"lockedInResult":2},"limited: second call":{"commands":["aggregate"],"lockedInResult":2},"paid: unlocks":{"commands":["aggregate","update","find","aggregate"],"lockedInResult":0}}
QA2622 pool {"api":{"minPoolSize":1,"maxPoolSize":30,"serverSelectionTimeoutMS":15000,"waitQueueTimeoutMS":30000,"autoIndex":true},"webhook":{"minPoolSize":1,"maxPoolSize":30,"serverSelectionTimeoutMS":15000,"waitQueueTimeoutMS":30000,"autoIndex":true},"worker":{"minPoolSize":5,"maxPoolSize":60,"serverSelectionTimeoutMS":15000,"waitQueueTimeoutMS":30000,"autoIndex":true},"api MONGO_AUTO_INDEX=false":{"minPoolSize":1,"maxPoolSize":30,"serverSelectionTimeoutMS":15000,"waitQueueTimeoutMS":30000,"autoIndex":false},"api-bad-env MONGO_AUTO_INDEX=x":{"minPoolSize":1,"maxPoolSize":30,"serverSelectionTimeoutMS":15000,"waitQueueTimeoutMS":30000,"autoIndex":true}}
QA2622 sweep-slow {"lockTtlMin":10,"maxConcurrentSweeps":4,"runsThatSwept":2,"maxOverlappingRuns":1,"sweptOrgs":8,"ticksToCoverAll":null}
QA2622 sweep-coverage-5s {"ticksToCoverAll":[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],"maxConcurrentSweeps":4}
QA2622 sweep-coverage {"ticksToCoverAll":[8,5,9,5,10,8,11,8,12,8,9,5,5,15,6,4,4,5,10,9],"maxConcurrentSweeps":4}
Tests:       7 passed, 7 total
```

### First parent 1a89a2e
```
QA2622 read {"codeBaseConfig.service.ts":{"method":"findByOrganizationId","rulesReturned":5003,"deletedReturned":5000,"replyBytes":[4794605],"ms":59,"appliedPaid":["r1","r2"],"appliedFree":["r1"]},"execute-cli-review.use-case.ts":{"method":"findByOrganizationId","rulesReturned":5003,"deletedReturned":5000,"replyBytes":[4794605],"ms":58,"appliedPaid":["r1","r2"],"appliedFree":["r1"]}}
QA2622 sync {"lock":{"commands":["find","findAndModify","findAndModify","findAndModify","findAndModify","findAndModify","find"],"after":{"total":115,"lockedPaused":["a11","a12","a13","a14","a15"],"active":10,"textIntact":true}},"unlock":{"commands":["find","findAndModify","findAndModify","findAndModify","findAndModify","findAndModify","find"],"after":{"total":115,"lockedPaused":[],"active":15,"textIntact":true}}}
QA2622 find {"limited: first call":{"commands":["aggregate","find","aggregate"],"lockedInResult":2},"limited: second call":{"commands":["aggregate","find","aggregate"],"lockedInResult":2},"paid: unlocks":{"commands":["aggregate","find","findAndModify","findAndModify","find","aggregate"],"lockedInResult":0}}
QA2622 pool {"api":{"minPoolSize":5,"maxPoolSize":30},"webhook":{"minPoolSize":2,"maxPoolSize":30},"worker":{"minPoolSize":5,"maxPoolSize":60},"api MONGO_AUTO_INDEX=false":{"minPoolSize":5,"maxPoolSize":30},"api-bad-env MONGO_AUTO_INDEX=x":{"minPoolSize":5,"maxPoolSize":0}}
QA2622 sweep-slow {"lockTtlMin":4,"maxConcurrentSweeps":80,"runsThatSwept":4,"maxOverlappingRuns":2,"sweptOrgs":40,"ticksToCoverAll":2}
QA2622 sweep-coverage-5s {"ticksToCoverAll":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],"maxConcurrentSweeps":200}
QA2622 sweep-coverage {"ticksToCoverAll":[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],"maxConcurrentSweeps":100}
Tests:       7 passed, 7 total
```

PR's `kodus-credits-metering.list-charges.integration.spec.ts` (2000 charges, PR with 5): merge passes (≤6 keys examined, `idx_org_pr_spanAt`); at the parent it fails with `totalKeysExamined` 2000.
PR's integration/unit specs at the merge against the same MongoDB (`kodyRules.repository.reads.integration`, `list-charges.integration`, `mongoose.factory.spec`, `kodusCreditsSweep.cron.spec`): 22/22 pass.
