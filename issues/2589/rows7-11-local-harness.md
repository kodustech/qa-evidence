# #2589 rows 7-11: local harness, merge c96dd79fc vs first parent d5526275e

Each spec runs the real code of the commit; only the external dependency is stubbed. Specs: rows7-11-harness-specs.md.

## Row 7: IntentJudge analyzer timeout (real IntentJudge -> agent harness -> AI SDK openai_compatible -> local HTTP endpoint that never answers), analyzerTimeoutMs=3000
### merge
```
+18ms request #1 POST /v1/chat/completions
+3027ms judge returned reason=analyzer_failure missingInfo="Analyzer execution failed: AbortError: This operation was aborted"
+3029ms request #1 connection closed by client (aborted)
+10029ms 7s after the verdict: requests=1, open connections=0
```
### first parent
```
+15ms request #1 POST /v1/chat/completions
+3006ms judge returned reason=analyzer_failure missingInfo="Analyzer execution failed: Timeout after 3000ms in business-rules analyzer"
+10007ms 7s after the verdict: requests=1, open connections=1
```

## Row 8: KODUS_GET_DIFF_FOR_FILE through a real MCP server + SDK client (McpServerFactory tool mapping, in-memory transport), files service stubbed
### merge
```
ROW8 src/changed.ts => {"ok":true,"isError":false,"structuredContent":{"success":true,"data":"@@ -1 +1 @@\n-a\n+b"}}
ROW8 src/not-in-pr.ts => {"ok":true,"isError":false,"structuredContent":{"success":false,"data":"src/not-in-pr.ts is not among the files changed by PR #7"}}
ROW8 assets/logo.png => {"ok":true,"isError":false,"structuredContent":{"success":true,"data":"assets/logo.png changed without a textual diff (binary, renamed only, or too large to show)"}}
```
### parent
```
ROW8 src/changed.ts => {"ok":true,"isError":false,"structuredContent":{"success":true,"data":"@@ -1 +1 @@\n-a\n+b"}}
ROW8 src/not-in-pr.ts => {"ok":true,"isError":true,"content":[{"type":"text","text":"MCP error -32602: Output validation error: Invalid structured content for tool KODUS_GET_DIFF_FOR_FILE: [\n  {\n    \"expected\": \"string\",\n    \"code\": \"invalid_type\",\n    \"path\": [\n      \"data\"\n    ],\n    \"message\": \"Invalid input: expected string, received undefined\"\n  }\n]"}]}
ROW8 assets/logo.png => {"ok":true,"isError":true,"content":[{"type":"text","text":"MCP error -32602: Output validation error: Invalid structured content for tool KODUS_GET_DIFF_FOR_FILE: [\n  {\n    \"expected\": \"string\",\n    \"code\": \"invalid_type\",\n    \"path\": [\n      \"data\"\n    ],\n    \"message\": \"Invalid input: expected string, received undefined\"\n  }\n]"}]}
```

## Row 10: Exa documentation formatter (real DocumentationSearchExaService -> LLM.run -> AI SDK openai_compatible -> local endpoint answering plain markdown, as a model without native structured output does)
### merge
```
ROW10 fenced=false
requests=1
/v1/chat/completions response_format=null tools=none tool_choice=null
service warnings=[]
formatter output="## express res.redirect\n\n- `res.redirect([status,] path)` sets `Location` to `path`.\n- An undefined path throws `TypeError`."

ROW10 fenced=true
requests=1
/v1/chat/completions response_format=null tools=none tool_choice=null
service warnings=[]
formatter output="## express res.redirect\n\n- `res.redirect([status,] path)` sets `Location` to `path`.\n- An undefined path throws `TypeError`."

```
### parent
```
ROW10 fenced=false
requests=2
/v1/chat/completions response_format="json_object" tools=none tool_choice=null
/v1/chat/completions response_format="json_object" tools=none tool_choice=null
service warnings=["LLM documentation formatter failed, falling back to raw summary truncation"]
formatter output=""
ROW10 fenced=true
requests=2
/v1/chat/completions response_format="json_object" tools=none tool_choice=null
/v1/chat/completions response_format="json_object" tools=none tool_choice=null
service warnings=["LLM documentation formatter failed, falling back to raw summary truncation"]
formatter output=""
```

## Row 11: real KodyLearningCronProvider in a real Nest app, app.close() 1s into a run; DB stub closes in onApplicationShutdown like TypeORM
### merge
```
+   93ms cron run starts (shutdown hook provided: true)
+ 1095ms app.close() (SIGTERM at rollout)
+ 1305ms cron run ended
+ 1306ms database connection closed (onApplicationShutdown)
+ 1306ms app closed
+ 1306ms queries ok=8 failed after close=0
```
### parent
```
+   80ms cron run starts (shutdown hook provided: false)
+ 1082ms app.close() (SIGTERM at rollout)
+ 1084ms database connection closed (onApplicationShutdown)
+ 1085ms app closed
+ 1147ms query platform_configs team-5 -> Driver not Connected
+ 1298ms query release lock -> Driver not Connected
+ 1299ms cron run ended
+ 1299ms queries ok=6 failed after close=2
```
