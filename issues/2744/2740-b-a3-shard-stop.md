# #2744 item (5): shard stop on 403 key limit, weekly limit, Token Plan (audit rerun, harness A3)

Real `KodyRulesAgentProvider.execute` -> `judgeKodyRulesSharded` -> `runJudge` -> `LLM.run` -> AI SDK openai-compatible, bundled with esbuild from merge `aeb08f11f` and parent `b172fdbac`; the only stub is a local fake OpenAI-compatible server (fake key, throwaway local crypto key). 12 changed files from a real `git diff`, one distinct file rule per file + one PR-scope rule = 13 shards. Mutant `nostop` = merge with the skipped-shard branch disabled. Error bodies copied from `libs/llm/error-classifier.spec.ts` (OpenRouter body shape `{"error":{"message":...,"code":403}}`).

| case | side | requests | PR shard called | category | stop log | wall |
|---|---|---|---|---|---|---|
| a) 403 "Key limit exceeded (monthly limit) ... $10.02 of $10.00 used" | merge | 5 | no | QUOTA_EXCEEDED | `refused PR#2744 (QUOTA_EXCEEDED)` shardsRun 13, shardsErrored 13 | 40 ms |
| | parent | 13 | yes | QUOTA_EXCEEDED (already terminal: no retry) | none | 57 ms |
| | mutant | 12 | no | QUOTA_EXCEEDED | logged, but shards still called | 50 ms |
| b) 429 "you (someone) have reached your weekly usage limit, resets in 3 days" | merge | 5 | no | QUOTA_EXCEEDED | shardsRun 13, shardsErrored 13 | 9 ms |
| | parent | 26 (13 shards x 2 attempts) | yes (2) | RATE_LIMIT | none | 13.6 s |
| | mutant | 12 | no | QUOTA_EXCEEDED | logged, shards still called | 18 ms |
| c) 429 "Token Plan rate limit reached: Upgrade your Token Plan ... (2062)" (MiniMax) | merge | 26 (13 x 2) | yes (2) | RATE_LIMIT | none | 13.4 s |
| | parent | 26 | yes (2) | RATE_LIMIT | none | 13.5 s |
| | mutant | 26 | yes (2) | RATE_LIMIT | none | 11.8 s |

Verdicts:
- (a) pass: the stop path runs for the OpenRouter 403 key cap (5 requests incl. those in flight at concurrency 4, PR shard skipped); parent calls all 13. Mutant 12 shows the harness can fail.
- (b) pass: the weekly cap stops the shards (5 requests), not only the classifier; parent retries every shard as RATE_LIMIT (26 requests, 13.6 s).
- (c) observation: the Token Plan 429 stays RATE_LIMIT by design (`error-classifier.spec.ts` "keeps the MiniMax token-plan window (429) on RATE_LIMIT: it reopens within hours"), identical at merge and parent: every shard is called and retried once, 26 provider requests and ~13.4 s of retry backoff per review of 13 shards, ending in "all 13 rule check(s) failed". The issue's 2,128/day Token Plan failures are therefore unchanged by this PR; whether that group is accepted is not stated in the issue.
