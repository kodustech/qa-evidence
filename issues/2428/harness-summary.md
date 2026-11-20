# #2428 / PR #2580: outgoing request bodies, merge `0305249ba` vs first parent `e34e644d7`

Harness: `qa2428-harness.spec.ts` (jest, in a git worktree of kodus-ai). It runs the real
`KodyRulesAgentProvider.execute` (8 `.ts` files sharing one rule, 2 `.md` sharing another, 1 `.py` alone;
concurrency 4), the real `KodyRuleDetectorCompilerService.compileAndSave`, and a plain `LLM.run` with no
`promptCache` (the `generateSummaryPR` shape), for each BYOK slot below. Every request goes through the
real provider SDK; `fetch` is rewritten to a local HTTP stub on 127.0.0.1 that records the body and answers
after 400 ms. `net`/`tls` connects to any other host throw; blocked attempts: none. The first attempt of
`src/f5.ts` gets a 429, so its retry is captured too (12 shard requests = 11 shards + 1 retry).
The same file was run on both commits.

| slot (provider / model) | shard requests marked, merge | marker shape | compiler system marked | plain call (no promptCache) | parent: any marker |
|---|---|---|---|---|---|
| anthropic / claude-sonnet-5-5 | 10/12 | `messages[0].content[0].cache_control` | yes `system[0].cache_control` | unmarked | 0 |
| amazon_bedrock / us.anthropic.claude-sonnet-5-5 | 8/12 | `messages[0].content[1].cachePoint` | yes `system[1].cachePoint` | unmarked | 0 |
| google_vertex / claude-sonnet-5-5 | 10/12 | `messages[0].content[0].cache_control` | yes `system[0].cache_control` | unmarked | 0 |
| openai / gpt-5.6-terra | 10/12 | `input[1].content[0].prompt_cache_breakpoint`, `prompt_cache_options` | yes `input[0].content[0].prompt_cache_breakpoint` | unmarked | 0 |
| openai / gpt-6.1-sol | 10/12 | `input[1].content[0].prompt_cache_breakpoint`, `prompt_cache_options` | yes `input[0].content[0].prompt_cache_breakpoint` | unmarked | 0 |
| anthropic_compatible / claude-sonnet-5-5 (gateway URL) | 10/12 | `messages[0].content[0].cache_control` | yes `system[0].cache_control` | unmarked | 0 |
| openai / gpt-5.5 | 0/12 | - | no | unmarked | 0 |
| openai / gpt-6.1-sol on an Azure base URL | 0/12 | - | no | unmarked | 0 |
| azure / deployment | 0/12 | - | no | unmarked | 0 |
| amazon_bedrock / us.amazon.nova-pro-v1:0 | 0/12 | - | no | unmarked | 0 |
| google_gemini / gemini-3-pro | 0/12 | - | no | unmarked | 0 |
| open_router / anthropic/claude-sonnet-5-5 | 0/12 | - | no | unmarked | 0 |
| openai_compatible / Fireworks deepseek-v4p1-flash | 0/12 | - | no | unmarked | 0 |
| kodus / fireworks deepseek-v4p1-flash | 0/12 | - | no | unmarked | 0 |

Unmarked shard requests on the marked providers are, in every run, the group of one (`tools/run.py`) and
siblings a free worker started while their leader was still running (`siblingsEarly`). On Bedrock two more
siblings started early because the leader's response was the last of its wave to settle; the stats log
(`[kody-rules-shard] prompt cache: ... 5 of 8 sibling(s) ran after their group's first shard`) says so.

Byte comparison of each first request, parent vs merge (`compare.txt`): every unmarked provider, and every
plain call, is byte-identical. Marked providers are identical once the markers are removed and the split
user blocks are joined back (OpenAI's marked system prompt is the same text in block form).

Leader failure (`leaderfail.txt`): `src/f1.ts` (the `.ts` leader) answered 400; all 11 shards still ran,
siblings did not wait on the failing leader, and the leader's re-issue carried its marker.

Excerpts: `bedrock-leader-body.json` (Converse `cachePoint` between head and file), `anthropic-sibling-body.json`
(`cache_control` on the head block, none on the request), `openai-leader-body.json`
(`prompt_cache_breakpoint` on the head + `prompt_cache_options: explicit`).
