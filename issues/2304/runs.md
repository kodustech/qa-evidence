# #2304 — QA runs (2026-11-07, QA on 0df20b706, includes #2404 and #2405)

Fixture: kodustech/poison_store, branch `qa-2304-shapes` (billing fixture), PRs 409–413 (closed, branch kept).
Provider: an OpenAI-compatible proxy in front of Fireworks (DeepSeek V4 Flash), added through BYOK, routes `codeReview` and `kodyRulesReview` overridden to it. The proxy forwards every call and rewrites the reply of the targeted call kind into an off-shape variant; every other call passes through untouched.
Judge variants add one synthetic violation (`QA2304-SYNTH`, rule [1], first added line) so a recovered reply shows up as a posted comment; the PR's real code violates no rule.

| Run | PR | Tampered reply | Calls tampered | Result | Logs (`observability_logs_ts`) |
|---|---|---|---|---|---|
| Control | 409 | none | 0 / 97 | success, 8 comments | — |
| A1 | 409 (`--force`) | finder `submitResult.suggestions` = lone object; formatter: `<thinking>` with decoy `[{"index":99}]` + string indexes | 2 finder, 1 formatter | success; comment text is the formatter output for index "0" | 2× `[LLM_ENVELOPE] [DONE-TOOL] recovered an off-shape findings payload` |
| P1 | 410 | judge: synthetic violation, correct shape (baseline) | 5 judge | success, 8 comments; kody-rules "6 suggestions (6 confirmed across 5 shards)", folded by KODY-DEDUP | — |
| P2 | 411 | judge `{result:{violations}}`; verifier `keep:"no"` | 5 judge, 9 verifier | success; `QA2304-SYNTH` posted; 0 generalist comments | 5× `off-shape kody-rules shard reply (recovered: unwrapped-result)`; 7× `recovered off-schema verifier verdict (coerced-keep-string)` |
| P3 | 412 | judge `{Violations}`; verifier `keep:0` | 5 judge, 11 verifier | success; `QA2304-SYNTH` posted; 0 generalist comments | 5× `(recovered: aliased-Violations)`; 8× `(coerced-keep-number)` |
| P4 | 413 | judge `{error:"…"}`; verifier `keep:"maybe"` | 10 judge (5 + 5 re-asks), 12 verifier | partial_error; no kody-rules comment; 8 generalist comments kept; summary says some checks couldn't be completed | 5× `(rejected: no violations key)`, 5× shard "degrading to zero findings", "Kody Rules could not be evaluated: all 5 rule check(s) failed to run"; 8× `verifier completed without a readable verdict, finding kept by default` |

Not run end to end: clustering (`clusterNoIds`). `sortAndPrioritizeSuggestions` — the only caller of `repeatedCodeReviewSuggestionClustering` and of the quantity limits — has had no caller in the pipeline since ce316a2e3 (2026-03-24). With `groupingMode: smart`, `limitationType: pr`, `maxSuggestions: 3` set on the repo, P1 still posted 8 comments and made no clustering call; only `severityLevelFilter` is read (agent-review.stage.ts).

Cleanup: BYOK and code review config restored byte-identical, proxy and tunnel stopped, PRs 409–413 closed, branch kept.
