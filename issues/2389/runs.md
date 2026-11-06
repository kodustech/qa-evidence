# #2389 — QA runs (2026-11-06, QA on 0df20b706 / f9fbad1e1, both include #2402)

Fixture: kodustech/poison_store PR 408 (closed), billing fixture, `@kody review --heavy`.
Provider: OpenAI-compatible mock behind a tunnel, added through BYOK (model `qa-mock-2389`), routes `codeReviewHeavy` and `prSummary` overridden to it; everything else on the org default (Sonnet 4.5, Bedrock). The mock reports fixed usage (1234 in / 56 out = 1290) so the span totals are checkable.

## Run 2 (18:16 UTC) — mock: lens step 1 answers a tool call, lens step 2 → 400, generalist → 400, any call without tools hangs (whitespace every 30 s, never answers)

Spans in `observability_telemetry` for the PR:

| Span | n | Status | `tu` | `abortedInFlight` / estimate | Error |
|---|---|---|---|---|---|
| lens loops (`code-review-generalist`, route `codeReviewHeavy`) | 9 | error | input 1234, output 56, total 1290, isByok | — | forced lens step-2 failure |
| generalist (`code-review-generalist`) | 2 | error | none (no step answered) | — | forced generalist failure |
| `code-review::repeat-check` (one-shot, structured) | 1 | error, 120 007 ms | none | `true` / 747 | This operation was aborted |
| `severity-classifier` (one-shot, text) | 1 | error, 90 006 ms | none | `true` / 1390 | This operation was aborted |

Execution: `error` — "The provider (openai_compatible) refused the request for this model: qa-2389 forced generalist failure".

## Run 1 (17:42 UTC) — mock: lens step 2 hangs, generalist → 400 once 5 lenses hang

- Generalist failed at 17:42:50 (`REQUEST_REJECTED`, then "prose recovery returned 0 finding(s)"). The 9 lenses were not aborted: their step-2 requests stayed open until the HTTP client closed them at 5 min and were re-sent (17:47:52, 17:52:52, 17:57:56).
- At 18:01:11 all lens connections closed at once and the execution stayed `in_progress` with no further heartbeat (QA deploy f9fbad1e1 was rolling out). No lens span was written.

Cleanup: BYOK restored byte-identical, mock and tunnel stopped, PR 408 closed, branch `qa-2389-abort` deleted.
