# #2350 — QA runs (2026-11-07, QA on 0df20b706, includes #2401)

Upstream check, direct to `api.openai.com/v1/chat/completions`, `gpt-6.1-terra` with one function tool: no `reasoning_effort` → 400 `Function tools with reasoning_effort are not supported for gpt-6.1-terra in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.`; `reasoning_effort: "none"` → 200.

Setup: BYOK `openai_compatible` slot added through the UI (`/byok/manual`, Test & save), model `gpt-6.1-terra`, base URL = a logging proxy (tunnel) that forwards to OpenAI's chat completions and records whether each body carries `reasoning_effort`. Routes `codeReview` and `kodyRulesReview` overridden to the slot. Fixture: kodustech/poison_store PR 413 (closed, branch `qa-2304-shapes` kept), `@kody review --force`.

| Run | Slot `reasoningEffort` | Execution | Calls with tools | Calls without tools | Worker log |
|---|---|---|---|---|---|
| 1 (19:55 UTC) | `none` (Thinking Off) | success, 5 comments | 1× no effort → 400 (the reported error), then 28× `"none"` → 200 | 17× no effort → 200 | 19:56:06 `Upstream refused \`reasoning_effort\` with tools; asking again with it off` |
| 2 (20:17 UTC, >10 min later) | unset (slot as the UI saves it) | success | 1× no effort → 400, then 13× `"none"` → 200 | 15× no effort → 200 | 20:18:14 same warn |
| 3 (20:19 UTC, within 10 min of run 2) | unset | success | 9× `"none"` → 200, no 400 | 7× no effort → 200 | — |

Run 3 shows the refusal remembered for the slot across reviews (`REFUSAL_MEMORY_MS` 10 min, per process). A trigger at 20:08 produced no execution (QA network drop at the time) and is not counted.

Not covered: Azure AI Foundry itself (OpenAI's own endpoint returns the same refusal text and is what the retry matches); streaming calls (every call in these reviews was non-streaming).

Cleanup: BYOK restored byte-identical (slot and credential removed), proxy and tunnel stopped, PR 413 closed.
