# #2335 — implementation status matches what the developer did, on every model (QA)

- Env: qa.kodus.io (deploy `2eca9610`, contains #2449 and #2564), 2026-11-14 15:48–16:20 UTC.
- Fixture `app/services/order_report.rb` with five planted problems (division by zero, SQL injection, a repo Kody Rule "Never compare a numeric total against the literal 0; use a named constant", inclusive range, percent used as a fraction).
- Fix push: empty guard added (`return 0 if @items.empty?`), SQL fixed differently from the suggestion (`where('name = ?', name)`), `NO_TOTAL = 0` constant added while `total == 0` stays, range and percent untouched (percent declined in its thread on GitHub).

## GitHub · DeepSeek V4.1 Flash — [441](https://github.com/kodustech/poison_store/pull/441)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Order total compared against literal 0 instead of a named constant
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Magic number 0 encodes the free-order domain state
- 12-12 bug: **implemented** (decided/implemented) — average_ticket divides by item count without empty guard
- 16-16 security: **implemented** (decided/implemented) — SQL injection via interpolated name in find_customer
- 28-28 bug: **not_implemented** (decided/not_implemented) — `labels` iterates inclusive range including out-of-bounds index
- 32-32 bug: **not_implemented** (decided/not_implemented) — discounted applies DISCOUNT_PERCENT as a fraction, not a percent

## GitLab · DeepSeek — [55](https://gitlab.com/sartorijr/kodex/-/merge_requests/55)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Total is compared against the literal 0 instead of a named constant
- 16-16 security: **implemented** (decided/implemented) — SQL injection via interpolated name in OrderReport#find_customer
- 11-12 bug: **partially_implemented** (decided/partially_implemented) — average_ticket divides by zero and truncates for empty or integer item
- 28-28 bug: **not_implemented** (decided/not_implemented) — Inclusive range in labels indexes past end of @items
- 32-32 bug: **not_implemented** (decided/not_implemented) — Discount applies raw percent value instead of a fraction

## Bitbucket · DeepSeek — [40](https://bitbucket.org/kodustech/artemis/pull-requests/40)
- 21-21 kody_rules: **partially_implemented** (decided/partially_implemented) — Numeric total compared against literal 0 instead of a named constant
- 10-13 bug: **implemented** (decided/implemented) — average_ticket raises ZeroDivisionError when order has no items
- 27-29 bug: **not_implemented** (decided/not_implemented) — labels uses inclusive range, reading nil element and raising NoMethodE
- 15-17 security: **implemented** (decided/implemented) — SQL injection via interpolated name in find_customer
- 31-33 bug: **not_implemented** (decided/not_implemented) — discounted applies 15 as a raw multiplier, not a percentage

## Azure Repos · DeepSeek — [192](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/192)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Numeric total compared against literal 0 instead of a named constant
- 16-16 security: **implemented** (decided/implemented) — SQL injection via string interpolation in find_customer
- 11-12 bug: **partially_implemented** (decided/partially_implemented) — average_ticket divides by item count without guarding empty collection
- 28-28 bug: **not_implemented** (decided/not_implemented) — labels iterates one index past end of @items, raising NoMethodError
- 31-32 bug: **not_implemented** (decided/not_implemented) — discounted subtracts DISCOUNT_PERCENT as a fraction, yielding negative

## GitHub · GPT-6 Sol — [443](https://github.com/kodustech/poison_store/pull/443)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Free-order check compares a total with literal 0
- 12-12 bug: **implemented** (decided/implemented) — Empty item list causes average_ticket to divide by zero
- 28-28 bug: **not_implemented** (decided/not_implemented) — Inclusive range makes labels access a nonexistent item
- 12-12 bug: **not_implemented** (decided/not_implemented) — Integer division truncates average ticket values
- 16-16 security: **implemented** (decided/implemented) — Interpolated customer name can alter the query predicate
- 32-32 bug: **not_implemented** (decided/not_implemented) — Discount calculation subtracts 15 times the amount

## GitHub · Claude Sonnet 5.5 — [444](https://github.com/kodustech/poison_store/pull/444)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Total compared against literal 0 instead of a named constant
- 28-28 bug: **not_implemented** (decided/not_implemented) — Inclusive range in labels reads past end of items and raises NoMethodE
- 32-32 bug: **not_implemented** (decided/not_implemented) — Discount multiplies by 15 instead of 0.15, producing negative amounts
- 16-16 security: **implemented** (decided/implemented) — SQL injection via string interpolation of name in find_customer
- 12-12 bug: **partially_implemented** (decided/partially_implemented) — average_ticket divides by zero on empty items and truncates integer re

## GitHub · Kimi K2.7 Code @ OpenRouter — [445](https://github.com/kodustech/poison_store/pull/445)
- 21-21 kody_rules: **not_implemented** (decided/not_implemented) — Order report compares the order total directly against the literal 0
- 27-29 bug: **not_implemented** (decided/not_implemented) — labels uses inclusive range that indexes past the last item
- 10-13 bug: **implemented** (decided/implemented) — average_ticket divides by zero on empty items list
- 15-17 security: **implemented** (decided/implemented) — SQL injection via string interpolation in find_customer
- 31-33 bug: **not_implemented** (decided/not_implemented) — Discounted price calculated as 1500% reduction instead of 15%
- 10-12 bug: **not_implemented** (decided/not_implemented) — Average ticket calculation truncates cents via integer division

Statuses follow what each suggestion asked: where it asked for the guard and float division (`to_f`), the guard alone is `partially_implemented`; where it asked only for the guard, `implemented`. The Kody Rule fix (constant defined, literal kept) is `not_implemented` or `partially_implemented` depending on the model's reading. No value outside the three statuses in any run.

## Threads
- GitHub #441: the two `implemented` threads resolved; partial/not implemented open (GraphQL `reviewThreads`).
- Bitbucket #40: the two `implemented` comments resolved (`resolution.type: comment_resolution`), the rest open.
- Azure 192: `implemented` thread `closed` (log `Marked thread 1281 as resolved in PR #192`), the rest `active`.
- GitLab: not resolved by design (#2443).

## Grouped suggestion (#2564) — GitHub [#442](https://github.com/kodustech/poison_store/pull/442)
- One comment for the division by zero in `order_report.rb:9` with "Also found in: `app/services/invoice_report.rb:9-9`". Push fixes only `order_report.rb` → `partially_implemented`, `implementationCheck.implementedLocations: ["app/services/order_report.rb:9-9"]`, thread open.

## Unmeasured and monotonic (GitHub #441)
- BYOK switched to the same model with an invalid key, push touching the file: `Implementation check for PR#441: 0 decided, 0 raised, 7 unmeasured`, each check `{outcome: unmeasured, reason: llm_error}` with the previous `verdict` kept; no status changed; the two `implemented` ones not re-read.
- Valid key back, push removing the empty guard again: the `implemented` division-by-zero suggestion stays `implemented` (not re-checked, not lowered).

## Not covered
- Cockpit "Not measured": the analytics warehouse had not ingested the day's checks by 18:20 UTC ("3 of 136 suggestions implemented" on the Kodus Review tab), so the filter could not be shown with data.
- `diff_too_large` / `diff_unavailable`: not forceable here; covered by the PR's specs.