# QA kodus-ai#2613 / PR #2602: centralized config sync runs

Environment: qa.api.kodus.io, QA org `qa-2557-forgejo` (Forgejo via Codeberg), config repository `kodus/gym-config` (manual mode) covering `sartorijr/gym`. Backend at merge `a7764e593` (QA restart 2026-11-20T22:29:50Z). BYOK DeepSeek V4.1 Flash (Fireworks).

Starting state (production shape): the org's `kodyRules` document held 27 rules, 24 of them already `deleted` with their centralized path kept, 3 active.

Each run: `POST /parameters/centralized-config-sync` (Sync Now), then a snapshot of every rule in Mongo `kodyRules` (full rule object hashed per uuid) compared with the snapshot taken just before, plus `observability_logs_ts` for the org in the run window and `codeReviewSettingsLog` (activity log) entries created since the run started.

## Before the fix (same org, same 24 deleted rules, old code)

2026-11-19T18:52Z, sync on the pre-fix build:

| source | count |
|---|---|
| `Marked stale centralized Kody rule as deleted` | 24 (rules already deleted at 18:49) |
| `codeReviewSettingsLog` action `delete` ("Kody Rule Deleted") | 24 |
| `codeReviewSettingsLog` action `edit` | 3 |
| `Rule created/updated, triggering reference detection` | 3 |

## After the fix

| run (UTC start) | config repo change | rules changed in `kodyRules` | `Marked stale ...` | `Rule created/updated` | activity log entries |
|---|---|---|---|---|---|
| idle1 13:42:43 | none | none (27/27 identical) | 0 (`No stale Kody rules to remove`) | 0 | 0 |
| idle2 13:44:53 | none | none | 0 | 0 | 0 |
| change1 13:47:38 | gym-config `6a35ec2e4`: edit no-todo text, delete no-console-log file, add naming rule with `@file:docs/qa-2613-naming.md` (file absent in gym) | `8ef9d9a7` (no-todo) rule text, same uuid; `4fabbe48` (no-console-log) status -> deleted; `cc6392ea` added | 1 | 2 | 3: Edited no-todo, Deleted no-console-log, Created naming |
| idle3 13:48:59 | none | only `cc6392ea` (its reference detection failed: `file_not_found`, retried by design) | 0 | 1 | 1 (Edited naming) |
| fix1 13:53:10 | gym `5e1ef1b4c`: add `docs/qa-2613-naming.md` (rule file untouched) | only `cc6392ea` (reference resolved) | 0 | 1 | 1 (Edited naming) |
| idle4 13:54:04 | none | none | 0 | 0 | 0 |
| back 13:55:17 | gym-config `e8ab8a111`: no-console-log file restored | `4fabbe48` back to active, same uuid | 0 | 1 | 1 (Edited no-console-log) |
| idle5 13:56:11 | none | none | 0 | 0 | 0 |
| review 13:57:31 | gym PR #6 opened (review runs ResolveConfigStage sync) | none | 0 | 0 | 0 |
| merge 14:00:54 | gym-config PR #2 merged (README only), pull-request.closed sync | none | 0 | 0 | 0 |

In every idle run the 24 old deleted rules and the newly deleted one were not touched (full-object hash identical before and after).

## Reference detection revisions for rule `cc6392ea` (Postgres `context_references`)

| revision | created | `syncErrorsCount` | knowledge refs |
|---|---|---|---|
| `725c2def` | 13:47:45 (change1) | 1 (`file_not_found` docs/qa-2613-naming.md) | 0 |
| `81100fc9` | 13:49:05 (idle3, retry) | 1 (`file_not_found`) | 0 |
| `e35901a1` | 13:53:16 (fix1, after the file was added) | 0 | 1 |

No revision after idle4: once clean, the rule is no longer rewritten.

## Review on gym PR #6 (DeepSeek V4.1 Flash)

Kody posted 4 Kody Rules comments, one per active centralized rule: `var` (no-var), TODO (no-todo, edited text), `console.log` (no-console-log, restored), and "Function name `x` is a single-letter name forbidden by the naming guide in docs/qa-2613-naming.md" (naming rule; "single-letter" exists only in the referenced file, so the resolved reference reached the judge). `KodyRulesShardedAgent`: 4 suggestions, 4 confirmed.
