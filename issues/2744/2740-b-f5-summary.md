# #2744 / PR #2740 — H5 (Kody Rules shards), H6 (secret screen), S27 (classifier)

Real code bundled with esbuild at merge `aeb08f11f` and first parent `b172fdbac`. H5 runs the real `KodyRulesAgentProvider.execute` → real `runJudge` closure → real `judgeKodyRulesSharded` → real `LLM.run` → AI SDK openai-compatible → a local fake HTTP server (the only stub; fake key, `API_ALLOWED_PRIVATE_HOSTS=127.0.0.1` so the real BYOK address guard lets 127.0.0.1 through). Changed files come from a real `git diff` + `convertToUnifiedDiffWithLineNumbers`. 12 files under `qa2744/rules/` + 1 PR-scope rule (13 shards). Requests = HTTP requests the fake server received.

| id | server script | merge | parent | mutant |
|---|---|---|---|---|
| S21 | every call 429 "Your project has exceeded its monthly spending cap" | 5 requests (1 leader + 4), PR shard not called, `providerRefusal QUOTA_EXCEEDED`, refusal log `shardsRun 13, shardsErrored 13` | 26 requests (13 shards x 2, retried as RATE_LIMIT), PR shard called, no refusal | nostop: 12 requests |
| S24 | 1st call 200 after 3 s, 2nd/3rd 429 cap, rest 200 (+ S24b: 1st and 4th slow) | 15 requests, all 12 file shards + PR shard called, no refusal; 10 findings (the 2 capped shards are not retried) | 17 requests, 12 findings (capped shards retried as RATE_LIMIT and succeeded) | nowait: 5 requests, `QUOTA_EXCEEDED`, 3 findings |
| S25a | 3x 403 with `metadata.reasons` | 13, no stop | 13 | |
| S25b | 3x 200 invalid structured text "Your quota exceeded ... model not found" | 16 (re-issue), no stop, 0 failed | 16 | |
| S25c | 401, 429 cap, 401 | 13, no stop | 14 | |
| S26 | main 429 cap, fallback slot 200 | main 13 + fallback 13, 0 failed, no refusal | main 26 + fallback 13 | |
| S28 | 401 "Incorrect API key provided" / 404 "No endpoints found" | 5 / 5, `AUTH_INVALID` / `MODEL_NOT_FOUND` | 13 / 13 | nostop 401: 12 |
| control | 429 "Rate limit reached for requests" | 26, no stop | 26 | |

S34 (kody-rules half), merge only: `[SLOW-SYNC] kody-rules detectors held the event loop 34673ms` `{label, durationMs, rules: 800, files: 600, patchChars: 124801800}` and `[SLOW-SYNC] kody-rules format rules held the event loop 7443ms` `{rules: 6000, files: 3000, patchChars: 669000}`; no rule text or patch text (markers absent). Parent: no line.

S27: merge `monthly spending cap` and `reached your weekly usage limit` → QUOTA_EXCEEDED, `Rate limit reached for requests` / `requests per minute` → RATE_LIMIT; parent all RATE_LIMIT; mutant (spending-cap line removed) puts the cap back to RATE_LIMIT.

S29 (ms/MB, best of 2, real `rg -n` output): SVG long lines 10.7 vs 32.4 (0.33x), timecode JSON lines 5.4 vs 22.2 (0.24x), ordinary TS 1.66 vs 1.76; short SVG lines 7.6 vs 11.9, short VTT timecodes 4.7 vs 4.2. Mutant (old regex) = parent (31.5 / 22.2).

S30: 214,026-line corpus from every SECRET_FILE_GLOBS name (case, `\` separators, 1-1000-char dirs, `..`, long names, `[repo]` tags, `--`): merge output byte-identical to parent (111,671 lines dropped). Mutant NAME_EDGE=6 differs (lets `id_ed25519` lines through), so the compare can fail.

Raw: f5-h5-results.json, f5-h6-s27-results.txt; harness sources f5-h5-harness.ts, f5-h6-harness.ts, f5-h27-harness.ts, f5-h6-corpus-gen.py.
