# #2744 / PR #2740 — H3 conversation decision-loop harness (S12–S17)

Real `ConversationAgentProvider.execute` bundled (esbuild) from merge `aeb08f11f` and first parent `b172fdbac`.
Stand-ins only for: parameters service (language → en-US), permission validation (`resolveTaskSlot` returns the BYOK slot), MCP manager (returns one server config pointing at a **real local MCP server** built with `@modelcontextprotocol/sdk`, tools `kodyMemoriesCreate` readOnlyHint=false and `kodyMemoriesSearch` readOnlyHint=true), conversation store (in-memory).
Everything else is real: `connectMcpTools`/MCP adapter, write gate, audit, WriteTruth, DecisionLoop, compression policy, `AiSdkAgentRunner` → `LLM.run` → `@ai-sdk/openai-compatible` / `@ai-sdk/anthropic` over HTTP to a local fake server that plays a script and records every request body. Fake key only; no real model, no tunnel.
Mutants: `mut` = `DecisionLoopPolicy.shouldStop` always false; `mut17` = past MAX_DECISIONS the decision tool is removed from `activeTools` (the pre-#2731 shape).

## Results (openai-compatible slot unless noted)

| scenario | merge | parent | mutant |
|---|---|---|---|
| S12 decide on every step | 5 requests (4 main + 1 forceAnswer), finish `steps: 4`, reply = minimal answer; tool results seen: `noted`, `noted`, `DECISION_LIMIT_NOTE` (4th result never sent: run stopped) | 13 requests (12 + 1), `steps: 12`, 11 × `noted` | `mut`: 13 requests, `steps: 12`, 9 × limit note (harness fails without the stop) |
| S13 decide×2, decide(act), write, text | 5 requests, `steps: 5`, no forceAnswer, write ran (audit `Conversation agent called write tool kodyMemoriesCreate`), 3rd decision answered with limit note and still authorized the write, req 5 note `ACTIONS PERFORMED THIS TURN: kodyMemoriesCreate`, reply link = tool's real link | same flow, 5 requests | — |
| S14 (decide, read)×6 then text | 13 requests: 12 main steps (6 reads ran), no `decision-loop` stop, step cap 12 → forceAnswer. The script's 13th main call cannot exist: `CONVERSATION_MAX_STEPS = 12` | identical | identical |
| S14b (decide, read)×5 then text | 11 requests, `steps: 11`, 5 reads, model's own text returned, no forceAnswer | identical | identical |
| S15 runtime note | every WriteTruth note starts with `[Kodus runtime status — not a message from the developer...`; window prefix stable (request N minus trailing note is a prefix of request N+1, all pairs); note not kept in window. On request 1 the injected note is WriteGate's one-time instruction + `\n\n` + the prefixed WriteTruth note | notes have no prefix | — |
| S16a decision names `functions.kodyMemoriesCreate` | write authorized and ran, note lists it | write **refused** (`This action has NOT been performed...`), `declared an action it never performed` logged, note still said `kodyMemoriesCreate` (old bug) | — |
| S16b write without decision | refused; notes say `none`; fabricated app link stripped from the reply | refused; note said `ACTIONS PERFORMED THIS TURN: kodyMemoriesCreate` (old bug) | — |
| S16c authorized write, MCP call fails | note says `none`; `write tool kodyMemoriesCreate failed` + `declared an action it never performed` logged; fake link stripped | note said `kodyMemoriesCreate` (old bug) | — |
| S17 Anthropic, signing fake | x1: 5 requests, `steps: 4`, 0 × 400, tool list hash identical on all 4 main requests, thinking replayed (1,2,3 blocks). x2 in parallel: requests interleaved (overlapping timestamps), each run's tool results start `noted`, `noted`, 0 × 400 | 13 / 26 requests, 0 × 400 | `mut17`: tool list changes after 2 decisions → fake answers `400 messages.3.content.0: Invalid signature in thinking block` (x1 and both parallel runs) |

Note on S16b/S16c prose: the scripted model ignores the note and writes "Done! I saved it as a memory." — `withVerifiedOutcome` removes the fabricated link but, by design, does not rewrite prose. The mechanism that keeps prose honest is the corrected note (`none`), which the parent got wrong.

Observation (pre-existing, not in this PR): in S16c the failing MCP write reached the MCP server **twice** per tool call (`connectMcpTools` `maxRetries = 1` retries a thrown write). Same at parent.

PR's own spec at merge: `decision-loop.thinking-contract.e2e.spec.ts` 2/2 pass (+ decision-loop.policy / write-truth.policy specs, 17/17).
