# Issue 2428 follow-up QA: prompt cache on native Claude (2026-11-21)

Setup: new QA org `qa-2428-claude`, BYOK native Anthropic `claude-sonnet-5-5` (effort low), GitLab repo `sartorijr14-group/qa2004-ast-5`.
Four Kody Rules (repository scope): three on `qa2428c/**`, one on `qa2428c/api/**`, so the 5 files under `lib/` and the 5 under `api/` form two head groups.
MR !1 added the 10 files (push 1, 16:38Z); push 2 (16:44Z) changed all 10. All numbers are Langfuse `homolog` generations (`usageDetails`: input = uncached, input_cached_tokens = cache read, input_cache_creation = cache write). Raw spans: followup-claude-spans.json.

## Detector compiler (4 rules saved within 2 s)

| call | uncached | cache read | cache write |
|---|---|---|---|
| rule 1 | 306 | 0 | 2,323 |
| rule 2 | 339 | 2,323 | 0 |
| rule 3 | 281 | 2,323 | 0 |
| rule 4 | 302 | 2,323 | 0 |

66% of compiler input read from cache; input cost at Sonnet 5.5 list prices (in $2, write $2.50, read $0.10 per MTok) $0.0090 vs $0.0210 uncached (-57%).
The `detectExternalReferences` call that runs next to each compile is not marked (0/0), as designed.

## Kody Rules file shards

Stats log, push 1: `[kody-rules-shard] prompt cache: 10 file shard(s) in 2 head group(s), 2 shared; 6 of 8 sibling(s) ran after their group's first shard`; push 2: `... 4 of 8 sibling(s) ...`.

Push 1 (start, end, uncached / read / write):

| shard | role | uncached | read | write |
|---|---|---|---|---|
| 16:38:32 | leader group A | 1,028 | 0 | 2,467 |
| 16:38:32 | leader group B | 950 | 0 | 2,204 |
| 16:38:32 | early sibling A (sent with the leaders, unmarked) | 3,487 | 0 | 0 |
| 16:38:32 | early sibling A (unmarked) | 3,487 | 0 | 0 |
| 16:39:02, 16:39:18 | siblings A after leader | ~1,027 | 2,467 each | 0 |
| 16:39:37 ... 16:40:37 | 4 siblings B after leader | ~950 | 2,204 each | 0 |

Push 1: 33,227 input tokens, 41.4% read, 14.1% written; input cost -35.8% vs all uncached.

Push 2:

| shard | role | uncached | read | write |
|---|---|---|---|---|
| 16:44:59 | leader group X (response 16:45:05.78) | 5,196 | 0 | 2,844 |
| 16:44:59 | leader group Y (response 16:45:05.73) | 5,039 | 0 | 2,581 |
| 16:44:59 | 2 early siblings X (unmarked) | 8,026 | 0 | 0 |
| 16:45:11, 16:45:19 | 2 siblings X started after X's leader response, still unmarked | ~8,038 | 0 | 0 |
| 16:45:22 ... 16:45:49 | 4 siblings Y after leader | ~5,040 | 2,581 each | 0 |

Push 2: 78,268 input tokens, 13.2% read, 6.9% written; input cost -10.8%. Had the two X siblings started at 16:45:11 and 16:45:19 been marked, they would have read 2,844 each (20.5% read).

Why they were unmarked: `runLeaderFirst` sets `leaderDone` when the job's `fn` returns (`kody-rules-sharded.judge.ts`, `finally { if (job.leader) job.group.leaderDone = true }`), and `fn` is `runJudge`, which after `LLM.run` also runs the Kody Rule evidence checks of that shard (`kody-rules-agent.provider.ts`, `evidenceDeadline = Date.now() + 180_000`). The cache entry exists once the shard call returns; the leader is only marked done after its evidence checks.

## Before/after on QA (Langfuse homolog, multi-shard reviews only)

| | period | org / model | reviews | shard calls | input | cache read | cache write |
|---|---|---|---|---|---|---|---|
| before | 2026-11-05 .. 11-12 | bd1ccc3d, Claude Sonnet 4.5 on Bedrock | 29 (2-24 shards) | 159 | 576,063 | 0 | 0 |
| after | 2026-11-20 | 516ed1bf, native claude-sonnet-4-6 | 4 (2-11 shards) | 30 | 143,008 | 19,020 (13.3%) | 11,036 |
| after | 2026-11-21 | qa-2428-claude, native claude-sonnet-5-5 | 2 (10 shards) | 20 | 111,495 | 24,074 (21.6%) | 10,096 |

Pre-deploy single-shard Claude calls (Opus 5.5, Sonnet 5.5, Sonnet 4.6; 7 calls) and 24 Sonnet 4.6 detector-compiler calls (one batch of 9 from one org within 0.6 s) also show 0 read and 0 write.

In 516ed1bf, one 11-shard review read in 5 siblings (leader answered in 1.4 s); in the other 11-shard and the 6-shard review the leader took 6-11 s while siblings took ~1 s, so every sibling went out before it returned: the leader wrote and nobody read. That is the "never idle" rule working as designed.

Auto-caching provider (Fireworks DeepSeek, no marker, scheduling only), same query: before 94 reviews 23.6% read, after 20 reviews 23.5%. By size: 2 shards 20.9% -> 24.1%, 3-5 shards 22.0% -> 37.6%, 6+ shards 48.0% -> 16.4% (4 and 3 reviews). Different PRs, orgs and rule sets on each side, plus Fireworks routing variance: no conclusion either way.

## Cost

Langfuse cost estimate for the two reviews: $1.85 (push 1) + $1.15 (push 2); the compiler and reference checks ~$0.04. Shards are $0.50 of that; most of the rest is Kody Rule evidence checks (`kodus-rules-review-agent` loop + `code-review-kody-rule-evidence-verdict`).
