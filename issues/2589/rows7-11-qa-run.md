# #2589 rows 8 and 9 on QA (backend at 0305249, contains merge c96dd79fc; mcp-manager deployed from c96dd79fc by "MCP Manager: QA EC2 Deploy" run 44375918120, 2026-11-18 19:12 UTC)

Test PR: https://github.com/kodustech/poison_store/pull/496 (closed after the run). It adds `app/services/coupon_calculator.rb` and a 1x1 PNG, which GitHub returns without a `patch`.
Model: DeepSeek V4.1 Flash (Fireworks), PoisonIvy org.

## Setup for row 9
`kodus-osv-default` can no longer be added from the catalog, so a legacy connection was inserted straight into
`"mcp-manager".mcp_connections` for the PoisonIvy org (provider `kodusmcp`, mcpUrl `https://mcp-osv.kodus.io/mcp`, status ACTIVE),
copying the shape of the two QA orgs that still have one. It was deleted after the run.
The endpoint still answers `404 {"status":"error","code":404,"message":"Application not found"}` (curl, 2026-11-19 22:00 UTC).

## Conversation
Reply inside Kody's review thread: https://github.com/kodustech/poison_store/pull/496#discussion_r4635703727
asking Kody to call KODUS_GET_DIFF_FOR_FILE on the PNG, on README.md (not in the PR) and on the changed Ruby file.
Kody answered: https://github.com/kodustech/poison_store/pull/496#discussion_r4635706593

## MCPRegistry (observability_logs_ts, 22:02:48-22:02:55 UTC)
```
22:02:48.788 info MCPRegistry initialized
22:02:48.789 info Registering MCP server            serverName=Kodus MCP
22:02:48.793 info Registering MCP server            serverName=Atlassian Rovo
22:02:48.989 info Successfully registered MCP server serverName=Kodus MCP
22:02:49.115 info Successfully registered MCP server serverName=Atlassian Rovo
22:02:49.334 info Finished listing tools            toolsByServer={"Kodus MCP":22,"Atlassian Rovo":22}
```
Kodus OSV was not registered although its connection row was ACTIVE; MCPRegistry warn/error since 22:00 UTC: 0.

## Langfuse (environment homolog), the three tool calls of the conversation agent, 22:02:54.703 UTC
| filePath | structuredContent returned |
|---|---|
| app/assets/images/qa-2589-pixel.png | `{"success":true,"data":"app/assets/images/qa-2589-pixel.png changed without a textual diff (binary, renamed only, or too large to show)"}` |
| README.md | `{"success":false,"data":"README.md is not among the files changed by PR #496"}` |
| app/services/coupon_calculator.rb | `{"success":true,"data":"@@ -0,0 +1,12 @@\n+# Applies a coupon to an order total. ..."}` |

No `MCP error -32602: Output validation error` on any of them.
