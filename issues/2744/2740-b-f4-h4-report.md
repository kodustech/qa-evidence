# H4: compression vs replayed reasoning (S5, S6) — merge aeb08f11f vs parent b172fdbac

Path under test: real `AiSdkAgentRunner` -> real `LLM.run` -> real `resolveModelConfig` / BYOK build (real `@ai-sdk/anthropic` 4.0.44 incl. `withThinkingSignatureRepair` on the compatible wire, `@ai-sdk/amazon-bedrock` 5.0.66, `@ai-sdk/openai-compatible` 3.0.39, `@ai-sdk/openai` 4.0.50 Responses with `store:false` + encrypted reasoning, real gateway address guard with `API_ALLOWED_PRIVATE_HOSTS=127.0.0.1`) -> local fake provider HTTP servers. Only the provider endpoint is fake. Policy: real `CompressionPolicy(new ContextWindowCompressor(60000))`. Script: 12 `readFile` tool turns (first 22 chars, then ~38k chars each), 13th turn text. Fake keys only.

Fakes: Anthropic/Bedrock sign every thinking block with sha256(system + tools + every message before it + thinking text) and answer the incident's 400 `messages.N.content.M: Invalid signature in thinking block` on a mismatch. DeepSeek OpenAI wire 400s an assistant tool call without `reasoning_content`; DeepSeek/Kimi Anthropic wire sends unsigned thinking and 400s a tool_use turn replayed without its thinking; OpenAI Responses 400s a `function_call` without its reasoning item. A second mode (ENFORCE_FINAL=1) additionally enforces Anthropic's documented "final assistant message must start with a thinking block" rule; in the default mode it is only recorded.

| variant | provider | status | steps | compressions | requests | violations | first 400 |
|---|---|---|---|---|---|---|---|
| m-base-ef0 | anthropic | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-base-ef0 | bedrock | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-base-ef0 | gateway | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-base-ef0 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| m-base-ef0 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-base-ef0 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-base-ef0 | openai-responses | completed | 13 | 3 | 13 | {} |  |
| m-base-ef1 | anthropic | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-base-ef1 | bedrock | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-base-ef1 | gateway | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-base-ef1 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| m-base-ef1 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-base-ef1 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-base-ef1 | openai-responses | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef0 | anthropic | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef0 | bedrock | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef0 | gateway | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef0 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef0 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef0 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef0 | openai-responses | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef1 | anthropic | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef1 | bedrock | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef1 | gateway | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| m-nostrip-ef1 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef1 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef1 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| m-nostrip-ef1 | openai-responses | completed | 13 | 3 | 13 | {} |  |
| m-stripall-ef0 | anthropic | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-stripall-ef0 | bedrock | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-stripall-ef0 | gateway | completed | 13 | 3 | 13 | {"final-assistant-thinking":3} |  |
| m-stripall-ef0 | deepseek-openai | error | 5 | 1 | 6 | {"deepseek-reasoning_content":3} | req 6: Missing `reasoning_content` field in the assistant message at message index 6 |
| m-stripall-ef0 | deepseek-anthropic | error | 5 | 1 | 6 | {"compat-missing-thinking":3,"final-assistant-thinking":1} | req 6: messages.5: thinking is enabled but reasoning content of the assistant tool call was not passed back |
| m-stripall-ef0 | kimi-anthropic | error | 5 | 1 | 6 | {"compat-missing-thinking":3,"final-assistant-thinking":1} | req 6: messages.5: thinking is enabled but reasoning content of the assistant tool call was not passed back |
| m-stripall-ef0 | openai-responses | error | 5 | 1 | 6 | {"responses-reasoning-item":3} | req 6: Item 'fc_3' of type 'function_call' was provided without its required 'reasoning' item: 'rs_3'. |
| m-stripall-ef1 | anthropic | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-stripall-ef1 | bedrock | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-stripall-ef1 | gateway | error | 5 | 1 | 6 | {"final-assistant-thinking":1} | req 6: messages.9.content.0.type: Expected `thinking` or `redacted_thinking`, but found `tool_use`. When `thinking` i |
| m-stripall-ef1 | deepseek-openai | error | 5 | 1 | 6 | {"deepseek-reasoning_content":3} | req 6: Missing `reasoning_content` field in the assistant message at message index 6 |
| m-stripall-ef1 | deepseek-anthropic | error | 5 | 1 | 6 | {"compat-missing-thinking":3,"final-assistant-thinking":1} | req 6: messages.5: thinking is enabled but reasoning content of the assistant tool call was not passed back |
| m-stripall-ef1 | kimi-anthropic | error | 5 | 1 | 6 | {"compat-missing-thinking":3,"final-assistant-thinking":1} | req 6: messages.5: thinking is enabled but reasoning content of the assistant tool call was not passed back |
| m-stripall-ef1 | openai-responses | error | 5 | 1 | 6 | {"responses-reasoning-item":3} | req 6: Item 'fc_3' of type 'function_call' was provided without its required 'reasoning' item: 'rs_3'. |
| p-base-ef0 | anthropic | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef0 | bedrock | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef0 | gateway | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef0 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| p-base-ef0 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| p-base-ef0 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| p-base-ef0 | openai-responses | completed | 13 | 3 | 13 | {} |  |
| p-base-ef1 | anthropic | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef1 | bedrock | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef1 | gateway | error | 5 | 1 | 6 | {"signature":3} | req 6: messages.5.content.0: Invalid `signature` in `thinking` block |
| p-base-ef1 | deepseek-openai | completed | 13 | 3 | 13 | {} |  |
| p-base-ef1 | deepseek-anthropic | completed | 13 | 3 | 13 | {} |  |
| p-base-ef1 | kimi-anthropic | completed | 13 | 3 | 13 | {} |  |
| p-base-ef1 | openai-responses | completed | 13 | 3 | 13 | {} |  |

Variants: `m-base` merge; `p-base` parent; `m-nostrip` merge with the `withoutThinkingAfterFirstEdit` call removed (S5 mutant); `m-stripall` merge with `isReasoningPart` returning true for every reasoning part (S6 mutant). `ef0`/`ef1` = final-thinking rule recorded / enforced.

Request shapes, native Anthropic, merge (first compression at request 6): the tool_result at index 4 is cut 38310 -> 433; thinking kept on the assistant turns before it (indices 1, 3), dropped from index 5 onward, tool_use kept:
```
merge  req 5 u:text | a:thinking+tool_use | u:tool_result(22) | a:thinking+tool_use | u:tool_result(38310) | a:thinking+tool_use | u:tool_result(38310) | a:thinking+tool_use | u:tool_result(38310)
merge  req 6 u:text | a:thinking+tool_use | u:tool_result(22) | a:thinking+tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(3158) | a:tool_use | u:tool_result(3158)
merge  req 7 u:text | a:thinking+tool_use | u:tool_result(22) | a:thinking+tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(3158) | a:tool_use | u:tool_result(3158) | a:thinking+tool_use | u:tool_result(38310)
merge  req 9 u:text | a:thinking+tool_use | u:tool_result(22) | a:thinking+tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(433) | a:tool_use | u:tool_result(3158) | a:tool_use | u:tool_result(3158)
parent req 6 u:text | a:thinking+tool_use | u:tool_result(22) | a:thinking+tool_use | u:tool_result(433) | a:thinking+tool_use | u:tool_result(433) | a:thinking+tool_use | u:tool_result(3158) | a:thinking+tool_use | u:tool_result(3158)
```
Replayed reasoning parts per request (merge): anthropic 0,1,2,3,4,2,3,4,2,3,4,2,3 ; deepseek-openai 0,1,2,3,4,5,6,7,8,9,10,11,12 ; kimi-anthropic 0,1,2,3,4,5,6,7,8,9,10,11,12 ; openai-responses 0,1,2,3,4,5,6,7,8,9,10,11,12

No-edit check (merge): withoutThinkingAfterFirstEdit(orig, sameWindow) returns the same array object: {"sameObjectReturned":true} ; compressor below threshold returns null: true

## X1 (candidate, unconfirmed against the real API)

On every compression step the merge strips the thinking of the LAST assistant turn too (the one whose tool_result the request carries): merge request 6 above ends `a:tool_use | u:tool_result`, with thinking enabled (`thinking.type: enabled` from effort low). Anthropic documents that with thinking on, the final assistant turn of a tool loop must start with a thinking block (`Expected thinking or redacted_thinking, but found tool_use ...`), or, in newer docs, that the API then disables thinking for that request. With that rule enforced (ef1) the merge fails at the first compression on native Claude, Bedrock Claude and a signature-passing gateway, exactly where the parent failed with the signature 400. Which of the two the live API does (400 vs silent thinking-off) needs one real Claude call; none was made (no real key used).
