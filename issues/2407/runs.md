# #2407 — QA runs (2026-11-06, QA on 2ee5d3257 → 0b4ffe784, both include #2410)

Fixture: kodustech/poison_store PR 407 (closed), the exact diff of kodus-ai #2405 at the commit its leaked summary was written on (b10e96f73 vs 5e886f252: 25 files, 4 `</think>` lines).
BYOK: `prSummary` routed to `deepseek-ai/DeepSeek-V4.1-Flash` on Together (OpenAI-compatible, `api.together.xyz/v1`); review on the org default (Sonnet 4.5, Bedrock).
Leak check on the text between the `kody-pr-summary` markers: first line, and `Wait,` / `Hmm` / `the instruction(s) say` / `Draft:` / `Let me` / `I'll` / `Need write` / `I should`.

| # | Path | Model (span `route=prSummary`) | LLM calls (output / reasoning tokens) | Published block | Leak |
|---|---|---|---|---|---|
| E2E | `@kody start-review` on PR 407, written to the PR description | DeepSeek V4.1 Flash @ Together | 1 (1003 / 102) | 3720 chars, starts `## Summary` | none |
| P0 | Preview (`POST /parameters/preview-pr-summary`, replace) | same | 2 (607 / 367 → 1557 / 695) | 3744, `## Summary` | none |
| P1 | Preview | same | 3 (1322 / 1313 → 65536 / 395, parse failed after 110 s → retry 1460 / 623) | 3601, `## Summary` | none |
| P2 | Preview | same | 1 (1226 / 384) | 3724, `## Summary` | none |
| P3 | Preview | same | 1 (940 / 150) | 3576, `## Summary` | none |
| P4 | Preview | same | 1 (1101 / 382) | 3291, `## Summary` | none |
| P5 | Preview | same | 1 (1103 / 340) | 3292, `## Summary` | none |
| P6 | Preview | same | 2 (173 / 169 → 4301 / 3551) | 3477, `## Summary` | none |
| P7 | Preview | same | 2 (271 / 268 → 1707 / 1104) | 2727, `## Summary` | none |
| P8 | Preview | same | 1 (875 / 129) | 3242, `## Summary` | none |
| P9 | Preview | same | 2 (794 / 783 → 1265 / 466) | 3524, `## Summary` | none |
| P10 | Preview | same | 1 (1259 / 403) | 3810, `## Summary` | none |
| S1 | Preview, override removed | Sonnet 4.5 @ Bedrock | 1 (533) | 2308, `## Recover off-shape…` | none |
| S2 | Preview | same | 1 (529) | 2230, `## Enhanced LLM Response…` | none (`<think>` only as diff content) |
| S3 | Preview | same | 1 (672) | 2900, `## Bug Fixes` | none (same) |

Calls whose output was almost all reasoning (P0 1st, P1 1st, P6, P7, P9 1st) were followed by another call and never published.
Cleanup: BYOK restored byte-identical, PR 407 closed, branches `qa-2407-base`/`qa-2407-r1` deleted.
