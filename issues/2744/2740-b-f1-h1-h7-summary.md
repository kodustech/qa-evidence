# H1 / H7: exec cap harness (PR #2740, issue #2744, QA slot b)

Code: esbuild bundles of the real modules at merge `aeb08f11f` and first parent `b172fdbac` (`buildE2BRemoteCommands` → `buildNativeToolConfigs` exec tool → `guardOutput`; `buildAgentTools` grep/findFile/listDir; `buildAstGrepTool`). Mutant = merge with `void handle.disconnect()` removed from `runCapped`. Node with `--max-old-space-size=8192 --expose-gc`.

**Not a real E2B sandbox** (no E2B key in the QA env file). Only the envd server is stubbed: a separate local process runs each command with `/bin/bash -c` on a real local git repo and streams stdout/stderr in 64 KB frames (30 MB/s, up to 30 MB buffered ahead of the client). The client side is the **real e2b 2.46.1 `CommandHandle`** (taken from the SDK bundle, same module instance the Kodus code imports) and the SDK's own `run()` logic; `kill()` SIGKILLs the process group server side while already-buffered output keeps streaming (the PR's description of E2B), `disconnect()` aborts the stream and does not kill. The 30 MB / 30 s post-kill figure is modelled from the PR, not measured on E2B.

Inputs: `git show <C_big>` of a real commit adding a 444 MB JSON-lines attendance export (447,401,933 chars of output); `seq 1 60000000`; a 5M-char single-line file; a file whose 2,000,000th UTF-16 unit is the high half of an emoji.

## S1 / S2: exec of a huge output (conversation exec tool)

| run | wall ms | cap→answer ms | event loop max ms | heapUsed peak Δ MB | rss peak Δ MB | chars kept by exec | truncated | exit | chars received in callbacks | sandbox process after answer | follow-up `echo ok` ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| merge, git show | 2,301 | 24 | 126 | 11 | 2 | 1,999,994 | true | -1 | 2,031,619 | gone | 16 |
| merge, git show (1 MB/s) | 1,034 | 5 | 33 | 11 | 0 | 1,999,994 | true | -1 | 2,031,619 | gone | 15 |
| merge, seq 1 60000000 | 162 | 74 | 89 | 67 | 101 | 1,999,996 | true | -1 | 2,031,619 | gone | 15 |
| parent, git show | 49,704 | n/a | **31,189** | **706** | **1,058** | **447,401,933** | n/a | 0 | n/a (no callbacks) | ended | 23 |
| parent, seq 1 60000000 | **268,933** | n/a | **250,584** | 516 | 434 | **RangeError: Invalid string length** (tool threw) | n/a | n/a | n/a | **still running** | 19 |
| mutant (no disconnect), git show | 2,333 | 1,152 | 49 | 70 | 158 | 1,999,994 | true | -1 | **32,964,611** | gone | 14 |
| mutant, seq | 244 | 168 | 100 | 56 | 123 | 1,999,996 | true | -1 | **4,259,843** | gone | 13 |
| mutant, git show (1 MB/s) | 6,390 | **5,391** | 73 | 65 | 129 | 1,999,994 | true | -1 | **31,784,963** | gone | 16 |

Merge log lines (captured): `[SANDBOX-EXEC] command stopped after 2000000 output characters` `{context: SandboxLeaseManager, organizationId, prKey, program: "git", maxChars: 2000000}` and `[CONVERSATION-TOOLS] exec output cut before the agent` `{outputChars: 1999994}`; the agent gets 64,000 chars plus `cut: {hiddenChars: {stdout: 1935994}, hint: "Only the start of this output is shown. Narrow the call: a path, a pattern, --stat or | head."}`. Parent: `[SLOW-SYNC] conversation tool output ... held the event loop 1297ms` (the guard itself), the rest of the 31 s block is the SDK holding and GC-ing the 447M-char string.

## S33: lines longer than the caps, emoji at the cut

| run | chars kept by exec | valid UTF-16 / UTF-8 round trip | last char | answer to agent |
|---|---|---|---|---|
| merge, 5M-char single line | 2,000,000 (`truncated`) | yes | x | 2,050 chars (long-line cut), `cut.hiddenChars.stdout = 1,000,000` |
| merge, high surrogate at unit 2,000,000 | 1,999,999 (high half dropped) | yes | `a` (0x61) | 2,050 chars, round trip ok |
| parent, same two | 5,000,000 / 2,500,001 | yes | | 2,051 chars |

## S35: secret in `program`

Command `API_TOKEN=abc123 seq 1 3000000` at merge logs `[SANDBOX-EXEC] ... {program: "API_TOKEN=abc123"}`: `programOf` takes the first word, which is the env assignment with its value.

## S32: code-review tools on a cut exec (merge vs parent)

| case | merge answer | merge exec calls | parent answer |
|---|---|---|---|
| grep over a 3M-char matching file (rg -n -C 2 prints 5.5M) | matches + `... (more matches hidden — narrow ...)`, 1,000,085 chars | 1 exec (exit -1, truncated), no fallback | the whole 5,528,894 chars |
| grep where every match is in a secret file (`keysonly/server.key`) | `PARTIAL_GREP_NO_VISIBLE_MATCH` | 1 | `No matches found.` (false) |
| grep whose stderr floods (30k unreadable files), empty stdout | `PARTIAL_GREP_STOPPED_EMPTY` | 1 (stdout 0, stderr 1,999,987) | `Error searching for "qaNeedle": ` |
| findFile `*.test.ts` over 50k files, fd present | 30 names (fd `--max-results 30`) | 1 | same |
| findFile, fd missing (find walk stopped at the cap) | 30 whole names | fd + find (exit -1, truncated) | 30 names after a 3.05M-char find |
| linked grep over the 3M-char file | tagged matches + `... (more matches hidden ...)` | 1 | 8,648,894 chars |
| linked listDir depth 4, 40k files | list + `... (truncated)` | 1 (exit -1, truncated), no error | same list (find printed 6.64M) |
| astGrep pattern, 12,000 `--json=stream` matches (5.36M chars) | `4500 matches for the pattern:` + 50 shown + `... 4450 more not shown` | 1 (exit -1, truncated) | `12000 matches ...` |

The ast-grep output comes from a shape-only stand-in printing `ast-grep --json=stream` lines (no ast-grep binary on the harness machine). The linked listDir paths in the raw JSON show the harness's local root because the stub maps `/home/user`.
