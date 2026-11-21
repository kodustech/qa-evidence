# QA #2620 / PR #2605 — run log

QA org: PoisonIvy (GitHub, kodustech/poison_store), BYOK DeepSeek V4.1 Flash (Fireworks). Snapshots are reads of Mongo `pullRequests` for each test PR (per-file fields and the document's `updatedAt`).

## Local: save.webhook-writes.integration.spec.ts, real MongoDB 8.2.11 (docker)

Merge 875b0c720 (spec as merged, passes 2/2):
```
{"documentBytes":572080,"closed":{"fileWrites":0,"writes":2,"aggregates":0,"replyBytes":1784,"commands":{"find":2,"findAndModify":1,"update":1}},"resync":{"fileWrites":0,"writes":2,"aggregates":0,"replyBytes":567646,"commands":{"find":1,"findAndModify":1,"update":1}},"onePush":{"fileWrites":1,"writes":3,"aggregates":2,"replyBytes":568760,"commands":{"find":2,"findAndModify":2,"update":1,"aggregate":2}}}
```
First parent bd0a05852 (same spec; only the use-case constructor adapted to the parent's 4-arg signature):
```
{"documentBytes":572080,"closed":{"fileWrites":300,"writes":302,"aggregates":2,"replyBytes":2289062,"commands":{"find":3,"findAndModify":2,"update":2,"aggregate":2}},"resync":{"fileWrites":300,"writes":302,"aggregates":2,"replyBytes":1716992,"commands":{"find":1,"findAndModify":2,"update":2,"aggregate":2}},"onePush":{"fileWrites":300,"writes":302,"aggregates":2,"replyBytes":1717052,"commands":{"find":2,"findAndModify":2,"update":2,"aggregate":2}}}
-> expect(closed.fileWrites).toBe(0): Received 300
```
On the merge, the close's 2 write statements are the lifecycle findAndModify plus the conditional totals update (`refreshFileTotalsIfStale`), which matches nothing when totals are right.

On the first parent the files kept reviewMode/codeReviewModelUsed after the close too (`afterClose reviewMode=["heavy_mode"]`): the repository's `sanitizeCodeReviewConfigData` already dropped empty values before `$set`.

## PR 500: reviewMode/model seeded on the stored files, then assigned + labeled (GitHub handler does not save these) + closed
```
status: open -> closed   CHANGED
merged: False -> False
closedAt:  -> 2026-11-21T14:34:09Z   CHANGED
updatedAt: 2026-11-21T14:25:38.131Z -> 2026-11-21T14:34:11.548Z   CHANGED
assignees: [] -> ['sartorijr92']   CHANGED
totals: [31, 0, 31] -> [31, 0, 31]
commits: ['2182ea6dda03502e107da6b400fecb4e2008f035'] -> ['2182ea6dda03502e107da6b400fecb4e2008f035']
prLevelSuggestions: 0 -> 0
files 3 -> 3
  batch_expiry.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.104Z
  price_rounding.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
  stock_ledger.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
```

## PR 500: reopened (not saved: `reopened` is not a valid action in SavePullRequestUseCase, pre-existing)
```
status: closed -> closed
merged: False -> False
closedAt: 2026-11-21T14:34:09Z -> 2026-11-21T14:34:09Z
updatedAt: 2026-11-21T14:34:11.548Z -> 2026-11-21T14:34:16.128Z   CHANGED
assignees: ['sartorijr92'] -> ['sartorijr92']
totals: [31, 0, 31] -> [31, 0, 31]
commits: ['2182ea6dda03502e107da6b400fecb4e2008f035'] -> ['2182ea6dda03502e107da6b400fecb4e2008f035']
prLevelSuggestions: 0 -> 0
files 3 -> 3
  batch_expiry.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.104Z
  price_rounding.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
  stock_ledger.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
```

## PR 500: totals broken to 1/2/3, then closed again
```
status: closed -> closed
merged: False -> False
closedAt: 2026-11-21T14:34:09Z -> 2026-11-21T14:41:07Z   CHANGED
updatedAt: 2026-11-21T14:34:16.128Z -> 2026-11-21T14:41:10.974Z   CHANGED
assignees: ['sartorijr92'] -> ['sartorijr92']
totals: [1, 2, 3] -> [31, 0, 31]   CHANGED
commits: ['2182ea6dda03502e107da6b400fecb4e2008f035'] -> ['2182ea6dda03502e107da6b400fecb4e2008f035']
prLevelSuggestions: 0 -> 0
files 3 -> 3
  batch_expiry.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.104Z
  price_rounding.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
  stock_ledger.rb unchanged | reviewMode heavy_mode model {'generateSuggestions': 'qa-2620-model', 'safeguard': 'qa-2620-safeguard'} fileUpdatedAt 2026-11-21T14:25:38.105Z
```

## PR 501: synchronize (edit coupon_parser, add gift_card), webhook save
```
status: open -> open
merged: False -> False
closedAt:  -> 
updatedAt: 2026-11-21T14:26:08.541Z -> 2026-11-21T14:37:52.669Z   CHANGED
assignees: [] -> []
totals: [22, 0, 22] -> [35, 0, 35]   CHANGED
commits: ['8d16ca5aae993af5959c107e5bf135e97129f8cf'] -> ['8d16ca5aae993af5959c107e5bf135e97129f8cf', '4eaad24c98ec223ae086c52f6a6bf51abcd8a74d']   CHANGED
prLevelSuggestions: 0 -> 0
files 3 -> 4
  coupon_parser.rb {'added': (6, 8), 'changes': (6, 8), 'patchLen': (144, 233), 'updatedAt': ('2026-11-21T14:26:08.518Z', '2026-11-21T14:37:49.641Z')} | reviewMode None model None fileUpdatedAt 2026-11-21T14:37:49.641Z
  app/services/qa2620b/gift_card.rb ADDED {'path': 'app/services/qa2620b/gift_card.rb', 'id': '6b01acbd44d3a7dbcef40cdd', 'status': 'added', 'added': 11, 'deleted': 0, 'changes': 11, 'patchLen': 0, 'updatedAt': '2026-11-21T14:37:49.641Z', 'suggestions': 0}
  refund_policy.rb unchanged | reviewMode None model None fileUpdatedAt 2026-11-21T14:26:08.518Z
  tax_table.rb unchanged | reviewMode None model None fileUpdatedAt 2026-11-21T14:26:08.519Z
```

## PR 501: Kody re-review save after the push
```
status: open -> open
merged: False -> False
closedAt:  -> 
updatedAt: 2026-11-21T14:37:52.669Z -> 2026-11-21T14:40:36.433Z   CHANGED
assignees: [] -> []
totals: [35, 0, 35] -> [31, 2, 33]   CHANGED
commits: ['8d16ca5aae993af5959c107e5bf135e97129f8cf', '4eaad24c98ec223ae086c52f6a6bf51abcd8a74d'] -> ['8d16ca5aae993af5959c107e5bf135e97129f8cf', '4eaad24c98ec223ae086c52f6a6bf51abcd8a74d']
prLevelSuggestions: 0 -> 0
files 4 -> 4
  coupon_parser.rb {'status': ('added', 'modified'), 'added': (8, 4), 'deleted': (0, 2), 'changes': (8, 6), 'patchLen': (233, 311), 'updatedAt': ('2026-11-21T14:37:49.641Z', '2026-11-21T14:40:36.414Z'), 'suggestions': (1, 2)} | reviewMode None model None fileUpdatedAt 2026-11-21T14:40:36.414Z
  gift_card.rb {'patchLen': (0, 222), 'updatedAt': ('2026-11-21T14:37:49.641Z', '2026-11-21T14:40:36.414Z'), 'suggestions': (0, 1)} | reviewMode None model None fileUpdatedAt 2026-11-21T14:40:36.414Z
  refund_policy.rb unchanged | reviewMode None model None fileUpdatedAt 2026-11-21T14:26:08.518Z
  tax_table.rb unchanged | reviewMode None model None fileUpdatedAt 2026-11-21T14:26:08.519Z
```

