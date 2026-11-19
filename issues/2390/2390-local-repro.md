# #2390 / PR #2415 local reproduction

Where: macOS, Node v24.13.1, two detached git worktrees of kodus-ai:
- merge `251748292` (PR #2415 merged)
- parent `da2ba0155` (main right before the merge)

Spec: `libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts`
Command: `API_NODE_ENV=test npx jest --config jest.config.ts --no-coverage <spec>`

"Interrupt" = start the spec, wait until a `node .../kcli-stubs-*/egress-proxy.js` process appears,
then SIGKILL jest and every process under it except that proxy (what a killed jest does: the
`finally` in `runFence` never runs). The proxy is left re-parented to PID 1 and listening.

## Interrupt script
```bash
#!/bin/bash
# usage: interrupt.sh <worktree> <logprefix>
W=$1; L=$2
cd $W
API_NODE_ENV=test npx jest --config jest.config.ts --no-coverage libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts > $L.interrupted.log 2>&1 &
NPX=$!
desc() { for c in $(pgrep -P $1); do echo $c; desc $c; done; }
for i in $(seq 1 3000); do
  P=$(pgrep -f "^[^ ]*/node [^ ]*kcli-stubs-[^ ]*/egress-proxy.js" | head -1)
  if [ -n "$P" ]; then
    # freeze then kill every process under our own npx except the proxy
    TREE="$NPX $(desc $NPX | tr '\n' ' ')"
    KILL=""; for t in $TREE; do [ "$t" != "$P" ] && KILL="$KILL $t"; done
    kill -STOP $KILL 2>/dev/null; kill -9 $KILL 2>/dev/null
    break
  fi
  sleep 0.02
done
echo "proxy pid seen: $P; SIGKILLed own tree:$KILL"
sleep 1
echo "--- leftover proxies (ours):"
for p in $(pgrep -f "^[^ ]*/node [^ ]*kcli-stubs-[^ ]*/egress-proxy.js"); do ps -o pid,ppid,lstart,command -p $p | cut -c1-240; lsof -nP -a -p $p -iTCP -sTCP:LISTEN 2>/dev/null | tail -n +2; done
```
(`interrupt-e2b.sh` is the same script waiting for a proxy whose argv has port `29148`, i.e. the
E2B case "a fence with no domains exits 0".)

## Results
| Run | Leftover proxy (from interrupted run) | Result |
|---|---|---|
| parent, clean | none | 33/33 |
| parent, rerun after interrupt | `egress-proxy.js ["api.lintkit.example"] 29148` | 8 failed / 25 passed (7 `network fence script` cases + E2B "a fence with no domains exits 0"), `egress proxy did not start` |
| merge, rerun x2 after interrupt in `network fence script` | `egress-proxy.js ["api.lintkit.example"] 25505` (random port from `freePort`) | 33/33, 33/33 |
| merge, rerun with the 29148 leftover above | 29148 | 1 failed / 32 passed |
| merge, rerun x2 after interrupt in E2B case | `egress-proxy.js [] 29148` | 1 failed / 32 passed both times: E2B › "a fence with no domains exits 0", expected 0 received 4 |
| merge, after killing the leftover | none | 33/33 |

## Failure output at merge (leftover on 29148)
```
FAIL libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts (41.024 s)
  ● scripts on a sandbox shell whose exit hook fails (E2B) › a fence with no domains exits 0

    expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: 4

      542 |         withStubs(fenceStubs('93.184.216.34'), (dir) => {
      543 |             const result = runFence(dir, fenced, [], onE2bShell);
    > 544 |             expect(result.status).toBe(0);
          |                                   ^
      545 |         });
      546 |     });
      547 | });

      at toBe (libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts:544:35)
      at run (libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts:70:9)
      at Object.withStubs (libs/code-review/infrastructure/agents/custom-agent-cli/cli-sandbox-scripts.spec.ts:542:9)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 32 passed, 33 total
Snapshots:   0 total
```

## Parent rerun failures
```
  ● network fence script › accepts a public address 93.184.216.34 and starts the proxy
  ● network fence script › accepts a public address 172.32.0.1 and starts the proxy
  ● network fence script › accepts a public address 100.128.0.1 and starts the proxy
  ● network fence script › accepts a public address 8.8.8.8 and starts the proxy
  ● network fence script › lets the CLI user reach only its proxy, by host name, not addresses
  ● network fence script › lets the proxy user reach DNS and public HTTPS only
  ● network fence script › runs the proxy as its own user with the allowlist
  ● scripts on a sandbox shell whose exit hook fails (E2B) › a fence with no domains exits 0
```
