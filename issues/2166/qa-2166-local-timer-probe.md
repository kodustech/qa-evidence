# #2166: MCP client timers, local reproduction

The probe (`qa-2166-timer-probe.spec.ts`, alongside this file) runs the production entry point `createMCPAdapter` against a real MCP server (SDK `McpServer` over Streamable HTTP, in process), with real timers. It wraps `setTimeout`/`setInterval`/`clear*` and counts live timers whose creation stack is inside `mcp-adapter/` (SDK timers are excluded). The same probe ran on three copies of `libs/mcp-server/mcp-adapter/`:

- `issuesha`: 8cf9e51fe, the version the issue was read at
- `before`: 1d7686843, main just before the merge
- `after`: 66bba7e27, the merge of #2185

## Results

| Scenario | issuesha | before | after |
|---|---|---|---|
| 20 × connect → getTools → executeTool(`ping`) → disconnect, live timers 1 s after the last disconnect | 40 (20 × 5-min interval `session-manager.ts:162`, 20 × 60 s timeout `client.ts:1018`) | 20 (60 s timeout `client.ts:1021`) | **0** |
| Live timers after each cycle | 2, 4, 6 … 40 | 2, 3, 4 … 21 | 1 each (the last cycle's, released by the async `registry.destroy()`), 0 after settle |
| 5 clients whose `connect()` fails, then disconnect | 5 intervals | 0 | **0** |
| Disconnect while a tool call is pending | 2 left (interval + 60 s timeout) | 1 left (60 s timeout) | **0**; the call rejects with `Connection closed` |
| Tool result | `pong` | `pong` | `pong` |

Note: `before` already released the session interval on disconnect (5f5583422, merged to main after the issue was read). What #2185 adds on top of main is the per-call 60 s timeout and the failed/never-connected client path, plus creating the session manager per connection.

## Raw output

`after`:
```json
{
 "variant": "after",
 "tools": [
  "ping",
  "hang"
 ],
 "perCycle": [
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1
 ],
 "cycles": {
  "results": [
   "{\"content\":[{\"type\":\"text\",\"text\":\"pong\"}]}"
  ],
  "liveImmediatelyAfterLastDisconnect": 1,
  "liveAfter1s": {
   "total": 0,
   "by": {}
  }
 },
 "failedConnect": {
  "errors": 5,
  "liveAfter": {
   "total": 0,
   "by": {}
  }
 },
 "pendingCall": {
  "during": {
   "total": 3,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 1,
    "timeout(60000ms) @ client.ts:1021": 1,
    "timeout(60000ms) @ client.ts:1185": 1
   }
  },
  "settled": {
   "err": "MCP server qa is unavailable (MCP error -32000: Connection closed)"
  },
  "liveAfter": {
   "total": 0,
   "by": {}
  }
 }
}
```
`before`:
```json
{
 "variant": "before",
 "tools": [
  "ping",
  "hang"
 ],
 "perCycle": [
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21
 ],
 "cycles": {
  "results": [
   "{\"content\":[{\"type\":\"text\",\"text\":\"pong\"}]}"
  ],
  "liveImmediatelyAfterLastDisconnect": 21,
  "liveAfter1s": {
   "total": 20,
   "by": {
    "timeout(60000ms) @ client.ts:1021": 20
   }
  }
 },
 "failedConnect": {
  "errors": 5,
  "liveAfter": {
   "total": 0,
   "by": {}
  }
 },
 "pendingCall": {
  "during": {
   "total": 3,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 1,
    "timeout(60000ms) @ client.ts:1021": 1,
    "timeout(60000ms) @ client.ts:1185": 1
   }
  },
  "settled": {
   "err": "MCP server qa is unavailable (MCP error -32000: Connection closed)"
  },
  "liveAfter": {
   "total": 1,
   "by": {
    "timeout(60000ms) @ client.ts:1021": 1
   }
  }
 }
}
```
`issuesha`:
```json
{
 "variant": "issuesha",
 "tools": [
  "ping",
  "hang"
 ],
 "perCycle": "[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40]",
 "cycles": {
  "results": [
   "{\"content\":[{\"type\":\"text\",\"text\":\"pong\"}]}"
  ],
  "liveImmediatelyAfterLastDisconnect": 40,
  "liveAfter1s": {
   "total": 40,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 20,
    "timeout(60000ms) @ client.ts:1018": 20
   }
  }
 },
 "failedConnect": {
  "errors": 5,
  "liveAfter": {
   "total": 5,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 5
   }
  }
 },
 "pendingCall": {
  "during": {
   "total": 3,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 1,
    "timeout(60000ms) @ client.ts:1018": 1,
    "timeout(60000ms) @ client.ts:1182": 1
   }
  },
  "settled": {
   "err": "Tool hang not found in any registered MCP server"
  },
  "liveAfter": {
   "total": 2,
   "by": {
    "interval(300000ms) @ session-manager.ts:162": 1,
    "timeout(60000ms) @ client.ts:1018": 1
   }
  }
 }
}
```
