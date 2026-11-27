# #2744 / PR #2740, QA run (slot b), 2026-11-27

Merge aeb08f11f live on QA (backend restart 19:57Z). BYOK DeepSeek V4.1 Flash via LiteLLM, effort low, except R4 (local stub, fake key).

| turn | where | ask | outcome | proof |
|---|---|---|---|---|
| T2 | GitHub codex-athena #14 | `git show <C_big>` (20 MB fixture), first record | answered at 21:51:47Z after `git show --stat` + a narrow read (new commit guidance); no cap needed | raw-gh-conv-1.json (steps 3), raw-comp-t2.json (`[CONVERSATION-TOOLS]` outputChars 793) |
| T2b | #14 | forced raw `git show <C_big>`, last record | model still read the tail narrowly (outputChars 800), answered at 21:53:12Z | raw-comp-t2.json, steps 6 |
| T6a | #14 | forced raw `seq 1 3000000`, no pipe | `[SANDBOX-EXEC] command stopped after 2000000 output characters` program seq (21:55:47.881Z, 0.76 s after sandbox connected); `[CONVERSATION-TOOLS]` outputChars 1,999,996; reply: last number 12517, truncated, exitCode -1, 1,935,996 chars hidden | raw-t6-window.json |
| T6b | #14, within 2 s of T6a | plain question | answered 21:55:47Z; both runs overlapped (started 21:55:42.260 / .310) | raw-t6-window.json |
| T3 | #14 after the stopped exec, same sandbox lease | `git show --stat <C_big>` | stat with attendance-export.json, 21:57:41Z | raw-gh-conv-2.json |
| T4 | #14 | `grep -rn API_TOKEN .` | reply "not set anywhere": the `.env.production` line was screened; the fake secret appears in no comment (body + body_html) | raw-gh-conv-2.json |
| T1 | #14 | "Fixed in <C_big>" | checked the commit, said the fix is not in it; no cap line | raw-gh-conv-2.json |
| T5 | #14 | save a memory | `Conversation agent called write tool KODUS_CREATE_MEMORY`, reply "Memory saved" with the rule link | raw-gh-conv-2.json |
| T7 / T9 | Bitbucket codex-athena #3 | `seq 1 3000000` / why is this a bug | answered (piped `tail`), steps 3 / 3 | raw-conv-fc0715d2-*.json |
| T8 | Azure codex-athena #222 | `seq 1 3000000` | answered (3000000), steps 3 | raw-conv-63484f7f-*.json |
| X3 | GitLab codex-athena !6 | `seq 1 3000000` | answered (3000000), steps 3 | raw-conv-0a010c6e-*.json |

Event loop around T6a (worker, heapLimit 4288): max 678 ms (21:55:50Z), then 105 / 44 ms; no StallWatchdog, no SlowSync.

R4 (GitHub #15, BYOK -> local stub answering 429 "Your project has exceeded its monthly spending cap" behind a cloudflared quick tunnel, fake key): 2nd run with a semantic file rule + PR rule (13 shards): stub saw 5 shard requests (22:03:29.429-.735Z); `[kody-rules] the model provider refused PR#15 (QUOTA_EXCEEDED); the remaining shards were skipped instead of called` shardsRun 13, shardsErrored 13; review finished in ~54 s with "Code Review Could Not Complete ... out of credits or has hit its billing limit". BYOK notification category QUOTA_EXCEEDED (banner copy "Your OpenAI-compatible account is out of quota"). Files: r4-stub-requests.log, raw-r4b.json, s23-byok-notification.json.

R5 (Bitbucket #4, maxInputTokens 32000, 15 files): 8 batches at a 32k window, review completed, 8 inline comments, no AI_APICallError / incomplete (raw-r5.json). The compressor emits no log line, so compression itself is not provable from QA logs.
