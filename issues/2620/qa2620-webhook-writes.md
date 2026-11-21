# QA #2620 / PR #2605: what a PR webhook writes

## 1. Local: `save.webhook-writes.integration.spec.ts` on a real MongoDB 7 (docker)

Same spec at the merge `875b0c720` and at its first parent `bd0a05852`. Two local-only changes: command monitoring also sums `nModified` (update) and `updatedExisting` (findAndModify) as `modified` documents, and at the parent the use case gets the repository argument its constructor still had.

| event (300-file PR, 572 KB doc) | parent: write stmts / docs modified / file writes / aggregates / reply bytes | merge: same |
|---|---|---|
| close | 302 / 302 / 300 / 2 / 2,289,062 | 2 / 1 / 0 / 0 / 1,784 |
| synchronize, same files | 302 / 302 / 300 / 2 / 1,716,992 | 2 / 1 / 0 / 0 / 567,646 |
| synchronize, one file edited | 302 / 302 / 300 / 2 / 1,717,052 | 3 / 3 / 1 / 2 / 568,760 |

Merge: 2 passed. Parent: 2 failed (`closed.fileWrites` expected 0, received 300). At the merge the close sends 2 write statements: the lifecycle `findAndModify` and the totals-repair `update`, which matches nothing when the totals are right (`modified` = 1 document).

## 2. QA: kodustech/poison_store, PoisonIvy org, DeepSeek V4.1 Flash, backend restart 2026-11-21 15:12:51Z

`reviewMode`/`codeReviewModelUsed` were set directly in Mongo after the first review (no review code path sets them on files today), so the lifecycle events have something to keep.

### PR 502: close (lifecycle)

After review + seeding, totals then set to 1/2/3 by hand to simulate a failed totals step:

status `open`, doc updatedAt `2026-11-21T15:45:33.601Z`, closedAt `-`, assignees [], totals added/deleted/changes `[1, 2, 3]`, commits ['e008163']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 9 | 177 | 2 |
| name_formatter.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |

After `closed` webhook (closed 15:53:20Z):

status `closed`, doc updatedAt `2026-11-21T15:53:31.629Z`, closedAt `2026-11-21T15:53:21Z`, assignees ['sartorijr92'], totals added/deleted/changes `[24, 0, 24]`, commits ['e008163']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 9 | 177 | 2 |
| name_formatter.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:45:33.579Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |

### PR 503: synchronize (new commit edits fee_calculator.rb, adds coupon.rb)

Before push:

status `open`, doc updatedAt `2026-11-21T15:46:06.486Z`, closedAt `-`, assignees [], totals added/deleted/changes `[24, 0, 24]`, commits ['ae4bcea']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 9 | 177 | 2 |
| name_formatter.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |

After the `synchronize` webhook save (before the incremental review):

status `open`, doc updatedAt `2026-11-21T15:54:07.950Z`, closedAt `-`, assignees [], totals added/deleted/changes `[32, 0, 32]`, commits ['ae4bcea', 'c99495f']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:54:05.034Z | heavy_mode | qa-2620-seeded-model | 12 | 230 | 2 |
| name_formatter.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |
| coupon.rb | 2026-11-21T15:54:05.034Z | - | - | 5 | 0 | 0 |

After the incremental review save:

status `open`, doc updatedAt `2026-11-21T15:57:45.032Z`, closedAt `-`, assignees [], totals added/deleted/changes `[23, 0, 23]`, commits ['ae4bcea', 'c99495f']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:57:44.991Z | heavy_mode | qa-2620-seeded-model | 3 | 158 | 3 |
| name_formatter.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |
| coupon.rb | 2026-11-21T15:57:44.991Z | - | - | 5 | 99 | 2 |

After `closed`:

status `closed`, doc updatedAt `2026-11-21T15:58:26.609Z`, closedAt `2026-11-21T15:58:13Z`, assignees [], totals added/deleted/changes `[23, 0, 23]`, commits ['ae4bcea', 'c99495f']

| file | updatedAt | reviewMode | codeReviewModelUsed.generateSuggestions | added | patch chars | suggestions |
|---|---|---|---|---|---|---|
| fee_calculator.rb | 2026-11-21T15:57:44.991Z | heavy_mode | qa-2620-seeded-model | 3 | 158 | 3 |
| name_formatter.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 5 | 111 | 1 |
| stock_reserver.rb | 2026-11-21T15:46:06.462Z | heavy_mode | qa-2620-seeded-model | 10 | 193 | 1 |
| coupon.rb | 2026-11-21T15:57:44.991Z | - | - | 5 | 99 | 2 |
