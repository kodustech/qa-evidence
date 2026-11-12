# #2508 — QA runs (QA `homolog`, includes #2512; 2026-11-12)

Source: reviews already run on QA by the E2E orgs, whose rules are decomposed into atoms and carry a `sourcePath` and/or a `contextReferenceId` (`kodyRules`: e.g. 10 atoms with `services/billing/CLAUDE.md`, 4 atoms with `AGENTS.md` + Context OS).
Logs: `observability_logs_ts`. Prompts: Langfuse, `environment=homolog`.

## Copies printed (new log line from #2512)

| Review (UTC) | Log |
|---|---|
| E2E org, PR 1001, 19:48 | `printed 4 reference file(s) across 2 shard(s); per-rule inlining would have printed 48` |
| E2E org, PR 838, 22:15 | `printed 1 reference file(s) across 1 shard(s); per-rule inlining would have printed 1` (rule without repeated atoms) |

## Prompts of PR 1001 (trace `38d90da7b6a6045986b1d61127f2862f`, `kodus-rules-review-agent`)

Both shard prompts (~10.9K chars each): one `<References>` block, 12 rule entries linking to it with `references: R…`, and each file once:
- `[R1] AGENTS.md (the rule's source file, read at this pull request's head)`
- `[R2] AGENTS.md (referenced by the rule, read at the base branch)` — head and base copies kept apart, as designed.

## Reads per path

The same E2E repositories' `sourcePath` reads fail on QA (pre-existing, also on 2026-11-11). Before #2512 a single review logged the failure once per atom (16 lines for 4 paths at 2026-11-11 01:59); after it, once per path (4 lines per review on 2026-11-12 10:49 and 18:26–18:30).

Not run: a dedicated QA rule on `poison_store`; the counts above come from the E2E orgs' reviews.
