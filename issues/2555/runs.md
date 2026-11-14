# #2555 — Architecture template: domain module that depends on the web layer (QA)

- Env: qa.kodus.io (contains #2552 `40f2f43b`), org poison, `kodustech/poison_store`, DeepSeek V4.1 Flash @ Fireworks (BYOK, medium). 2026-11-14 15:05–15:25 UTC.

## Template text
- Web: Settings → Code Review → poison_store → What to review → New agent → Templates → Architecture. The created agent's Instructions hold 4 lines; line 3 is the new sentence. [Screenshot](https://kodustech.github.io/qa-evidence/issues/2555/web-architecture-template.png).
- CLI built from `main` (`apps/cli`, the published 0.4.21 predates the PR): `kodus agents create --template architecture --repo poison_store --name "Architecture CLI"` → `agents show` prints the same 4 lines.
- `GET /parameters/code-review-parameter`: `instructions` of the web agent (`architecture`) and the CLI agent (`architecture-cli`) are equal, 589 characters each, `diff` empty.
- Other templates: the merge commit adds one line to `drafts.ts` and one to the CLI copy, nothing else.

## Behavior (web agent saved unedited, enabled; fixtures from `evals/custom-agents/architecture-cases.js` on main)

| Case | PR run 1 | PR run 2 | Architecture agent |
|---|---|---|---|
| Domain imports `Request` from `express` (`src/domain/discounts.ts`) | [#435](https://github.com/kodustech/poison_store/pull/435): no agent finding (the generalist found it, not sent) | [#438](https://github.com/kodustech/poison_store/pull/438): posted at `src/domain/discounts.ts:5`, "`discountPercent` now depends on Express, so the pure domain rules documented in `src/domain/pricing.ts` can't be used without the framework" | flagged 1 of 2 |
| Controller only maps the query, domain computes | [#436](https://github.com/kodustech/poison_store/pull/436) | [#439](https://github.com/kodustech/poison_store/pull/439) | quiet 2 of 2 |
| Shared `DataTable` built on `components/ui/table` | [#437](https://github.com/kodustech/poison_store/pull/437) | [#440](https://github.com/kodustech/poison_store/pull/440) | quiet 2 of 2 |

Two runs per case are a sanity check, not the eval's measurement. Restored: both agents removed from poison_store, fixtures removed from `main`, PRs closed.
