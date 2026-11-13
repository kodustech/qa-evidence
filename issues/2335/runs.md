# #2335 — implementation status after a push (QA)

- Env: qa.kodus.io, API version `3e46971e` (contains #2449 `763ec93b`), org poison@kodus.io, repo `kodustech/poison_store`.
- PR: https://github.com/kodustech/poison_store/pull/423 — `app/services/order_report_service.rb` with 5 seeded defects.
- First review (17:5x UTC): 5 suggestions posted (generalist + Kody Rules).
- Push `de92d98` (18:01 UTC): one fixed as suggested, one fixed differently, one partly, two untouched (one declined in its thread).

## `pullRequests.files.suggestions` (Mongo, after the push)

| Lines | Suggestion | What the push did | implementationStatus | implementationCheck | Thread |
|---|---|---|---|---|---|
| 8-11 | Division by zero when `@orders` is empty | guard added, as suggested | implemented | decided / implemented | resolved |
| 13-15 | SQL injection in `find_customer` | `where('name = ?', name)` instead of the suggested `where(name: name)` | implemented | decided / implemented | resolved |
| 25 | Magic number 0 (Kody Rule) | constant added, early return not added | partially_implemented | decided / partially_implemented | open |
| 19 | Inclusive range out of bounds | untouched | not_implemented | decided / not_implemented | open |
| 26 | Percent treated as decimal | untouched, declined in thread | not_implemented | decided / not_implemented | open |

- All checks at `checkedAt 2026-11-13T18:01:59Z`, `outcome: decided`; stored values are only the three statuses.
- Threads resolved by Kody only for `implemented` (GraphQL `reviewThreads`: 4566765067, 4566766073 resolved; 4566765564 partial stays open).
- Suggestions posted by the second review (e.g. line 3) carry no `implementationCheck` yet, as expected.
- Not exercised live: the `unmeasured` path (provider failure / oversized patch) and the Cockpit "Not measured" filter; covered by the PR's specs and eval.
