# #2429 — QA run (QA `homolog` 9f0bfbef, includes #2439; 2026-11-13)

Provider check first: Fireworks (`deepseek-v4p1-flash`, OpenAI-compatible) rejects a request whose message holds a lone high surrogate (`"hi \ud83d end"` → `400 invalid_request_error`), so it reproduces the failure condition like Together/DeepSeek did in the report.

Setup: Bitbucket QA org, temporary BYOK `openai_compatible` → Fireworks `accounts/fireworks/models/deepseek-v4p1-flash` (no BYOK before; removed after, `find-by-key` back to `404`).
Fixture: `kodustech/artemis` PR 36, description = 499 × `x` + `🔧` + ` tail after the emoji` (the emoji's high surrogate at UTF-16 index 499, the 500-unit cut).

| Check | Result |
|---|---|
| Review (`@kody start-review`, 03:09 UTC) | completed: 3 line comments, summary updated, no agent failure |
| Generalist calls (Langfuse `homolog`, trace `e4e2358c591630b26141f5b95b78eac6`) | model `accounts/fireworks/models/deepseek-v4p1-flash`, level `DEFAULT`, no error |
| `<PRContext>` in the prompt | ends with exactly 499 `x` then `</PRContext>`: the split emoji is dropped, no `\ud83d` left |
