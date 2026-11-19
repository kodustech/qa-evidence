# #2166: conversation agent on QA, MCP connect / tool calls / close

QA org BYOK: DeepSeek V4.1 Flash (Fireworks, OpenAI-compatible, effort medium). Backend deploy that contains 66bba7e27: https://github.com/kodustech/kodus-ai/actions/runs/44444105352 (services restarted 2026-11-19 02:38 UTC and 14:16 UTC, after the build).

Trigger: reply `@kody` in a Kody review thread on kodustech/poison_store#492 (https://github.com/kodustech/poison_store/pull/492#discussion_r4631357379), asking it to check team memories and Kody Rules with its tools. Kody answered at https://github.com/kodustech/poison_store/pull/492#discussion_r4631363835 citing the memory and the 5 rules it read.

`observability_logs_ts`, org filter, 2026-11-19 (UTC):

| Time | Component | Message | Detail |
|---|---|---|---|
| 15:58:58.240 | ConversationAgentProvider | Starting conversation agent execution | |
| 15:59:00.173 | ConversationAgentProvider | Conversation agent MCP tools connected | mcpToolCount 44 |
| 15:59:06.136 | McpServerFactory | MCP tool invoked | KODUS_GET_KODY_RULES |
| 15:59:06.147 | McpServerFactory | MCP tool invoked | KODUS_GET_KODY_RULES_REPOSITORY |
| 15:59:06.149 | McpServerFactory | MCP tool invoked | KODUS_FIND_MEMORIES |
| 15:59:06.157–.167 | McpServerService | MCP stateless request completed (×3) | |
| 15:59:12.802 | ConversationAgentProvider | Conversation agent declared an action it never performed | intendedTool KODUS_FIND_MEMORIES (see note) |
| 15:59:12.802 | ConversationAgentProvider | Finish conversation agent execution | |
| 15:59:15.965 | ChatWithKodyFromGitUseCase | Successfully executed conversation flow | |

No MCP connection, "not initialized" or disconnect error in the window. `mcp.close()` runs in the agent's `finally`, which goes through the changed `disconnect()`/`cleanup()`.

Note: the "declared an action it never performed" error is the decision/writes cross-check (`conversationAgent.ts` `reportDecisionDivergence`): the model declared intent `act` for a read-only lookup, and only write tools count as performed. It is not caused by this PR.
