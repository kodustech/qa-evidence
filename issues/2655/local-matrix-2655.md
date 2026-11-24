# #2655 / PR #2660 — local harness, merge cb2d2bb46 (M) vs first parent 612691314 (P)

Real built CLI (dist/index.js) of each commit, real Commander action/formatters/logger/exit handling; only the HTTP API (loopback mock, synthetic credentials) and, for M10, the external hunkdiff process are stubbed. stdout and stderr captured separately; JSON check = JSON.parse of the whole stdout buffer. Fixtures: F (low/medium/high/critical), F1 (high), Fbelow (low/medium), F0 (none), Fbig (240 issues, emoji/accents/escapes); path qa2655/alunos matrícula.ts.

| run | build | argv | exit | stdout JSON.parse | gate line on stdout | gate line on stderr | API requests |
|---|---|---|---|---|---|---|---|
| M10-a | M | `review --staged --fail-on error -v` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key |
| M10-a | P | `review --staged --fail-on error -v` | 1 | FAIL Unexpected token '^', "^DExitin"... is | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key |
| M10-aq | M | `review --staged --fail-on error --quiet` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | — | POST /cli/review team-key |
| M10-aq | P | `review --staged --fail-on error --quiet` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | — | POST /cli/review team-key |
| M10-b | M | `review --staged --fail-on error` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key |
| M10-b | P | `review --staged --fail-on error` | 1 | FAIL Unexpected token '^', "^DExitin"... is | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key |
| M10-c | M | `review --staged --fail-on critical` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | — | POST /cli/review team-key |
| M10-c | P | `review --staged --fail-on critical` | 1 | FAIL Unexpected token '^', "^D" is not vali | — | — | POST /cli/review team-key |
| M11-401fallback | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key; GET /cli/trial/status none; POST /cli/trial/review none |
| M11-401fallback | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key; GET /cli/trial/status none; POST /cli/trial/review none |
| M11-anon | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | GET /cli/trial/status none; POST /cli/trial/review none |
| M11-anon | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | GET /cli/trial/status none; POST /cli/trial/review none |
| M11-team | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key |
| M11-team | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key |
| M11-token | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review bearer |
| M11-token | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review bearer |
| M12-async-failed | M | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M12-async-failed | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M12-async-nores | M | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M12-async-nores | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M12-async-ok | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M12-async-ok | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key; GET /cli/review/jobs/job-qa2655 team-key |
| M13-agent-o | M | `review --staged --fast --agent --fail-on error -o agent.json` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M13-agent-o | P | `review --staged --fast --agent --fail-on error -o agent.json` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M13-agent | M | `review --staged --fast --agent --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | — | — | POST /cli/review team-key |
| M13-agent | P | `review --staged --fast --agent --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | — | — | POST /cli/review team-key |
| M4-F-critical | M | `review --staged --format json --fail-on critical` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on critical`. | POST /cli/review team-key |
| M4-F-critical | P | `review --staged --format json --fail-on critical` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on critical`. | — | POST /cli/review team-key |
| M4-F-error | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M4-F-error | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M4-F-info | M | `review --staged --format json --fail-on info` | 1 | ok | — | Exiting with code 1 because 4 issues meet or exceed `--fail-on info`. | POST /cli/review team-key |
| M4-F-info | P | `review --staged --format json --fail-on info` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 4 issues meet or exceed `--fail-on info`. | — | POST /cli/review team-key |
| M4-F-warning | M | `review --staged --format json --fail-on warning` | 1 | ok | — | Exiting with code 1 because 3 issues meet or exceed `--fail-on warning`. | POST /cli/review team-key |
| M4-F-warning | P | `review --staged --format json --fail-on warning` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 3 issues meet or exceed `--fail-on warning`. | — | POST /cli/review team-key |
| M4-F1-error | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | POST /cli/review team-key |
| M4-F1-error | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`. | — | POST /cli/review team-key |
| M5-F-nofailon | M | `review --staged --format json` | 0 | ok | — | — | POST /cli/review team-key |
| M5-F-nofailon | P | `review --staged --format json` | 0 | ok | — | — | POST /cli/review team-key |
| M5-F0-error | M | `review --staged --format json --fail-on error` | 0 | ok | — | — | POST /cli/review team-key |
| M5-F0-error | P | `review --staged --format json --fail-on error` | 0 | ok | — | — | POST /cli/review team-key |
| M5-Fbelow-critical | M | `review --staged --format json --fail-on critical` | 0 | ok | — | — | POST /cli/review team-key |
| M5-Fbelow-critical | P | `review --staged --format json --fail-on critical` | 0 | ok | — | — | POST /cli/review team-key |
| M5-Fbig-error | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 120 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M5-Fbig-error | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 120 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M6-devnull | M | `review --staged --fail-on error` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| M6-devnull | P | `review --staged --fail-on error` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| M7-envquiet-terminal | M | `review --staged --format terminal --fail-on warning --no-hunk` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| M7-envquiet-terminal | P | `review --staged --format terminal --fail-on warning --no-hunk` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| M7-envquiet | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M7-envquiet | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M7-quiet-o | M | `review --staged --format json --fail-on error --quiet -o out-review.json` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M7-quiet-o | P | `review --staged --format json --fail-on error --quiet -o out-review.json` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M7-quiet-verbose | M | `review --staged --format json --fail-on error --quiet --verbose` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M7-quiet-verbose | P | `review --staged --format json --fail-on error --quiet --verbose` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M7-quiet | M | `review --staged --format json --fail-on error --quiet` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M7-quiet | P | `review --staged --format json --fail-on error --quiet` | 1 | FAIL Unexpected end of JSON input | — | — | POST /cli/review team-key |
| M8-fields | M | `review --staged --format json --fail-on error --fields summary` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-fields | P | `review --staged --format json --fail-on error --fields summary` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M8-forcecolor | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`.[39m | POST /cli/review team-key |
| M8-forcecolor | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`.[39m | — | POST /cli/review team-key |
| M8-markdown | M | `review --staged --format markdown --fail-on error` | 1 | FAIL Unexpected token '#', "# Code Rev"... is | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-markdown | P | `review --staged --format markdown --fail-on error` | 1 | FAIL Unexpected token '#', "# Code Rev"... is | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M8-nocolor | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-nocolor | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M8-o | M | `review --staged --format json --fail-on error -o out-review.json` | 1 | FAIL Unexpected token 'O', "
Output sav"... i | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-o | P | `review --staged --format json --fail-on error -o out-review.json` | 1 | FAIL Unexpected token 'O', "
Output sav"... i | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M8-prompt | M | `review --staged --prompt-only --fail-on error` | 1 | FAIL Unexpected token 'R', "REVIEW_ANA"... is | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-prompt | P | `review --staged --prompt-only --fail-on error` | 1 | FAIL Unexpected token 'R', "REVIEW_ANA"... is | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| M8-verbose | M | `review --staged --format json --fail-on error --verbose` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| M8-verbose | P | `review --staged --format json --fail-on error --verbose` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| smoke | M | `review --staged --format json --fail-on error` | 1 | ok | — | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | POST /cli/review team-key |
| smoke | P | `review --staged --format json --fail-on error` | 1 | FAIL Unexpected non-whitespace character afte | Exiting with code 1 because 2 issues meet or exceed `--fail-on error`. | — | POST /cli/review team-key |
| X1-hookshape-F | M | `review --staged --fail-on critical --format terminal --quiet` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| X1-hookshape-F | P | `review --staged --fail-on critical --format terminal --quiet` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| X1-hookshape-F0 | M | `review --staged --fail-on critical --format terminal --quiet` | 0 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| X1-hookshape-F0 | P | `review --staged --fail-on critical --format terminal --quiet` | 0 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| X1-hookshape-Fbelow | M | `review --staged --fail-on critical --format terminal --quiet` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |
| X1-hookshape-Fbelow | P | `review --staged --fail-on critical --format terminal --quiet` | 1 | FAIL Unexpected token '━', "
━━━━━━━━━━"... i | — | — | POST /cli/review team-key |

## M10 hunk stub ledger (external hunkdiff process)
- M10-a/M: {"t":1795525124877,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":0}
- M10-a/P: {"t":1795525129480,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":0}
- M10-b/M: {"t":1795525125992,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":7}
- M10-b/P: {"t":1795525130576,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":7}
- M10-c/M: {"t":1795525127124,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":2,"stdoutIsTTY":true,"exit":7}
- M10-c/P: {"t":1795525131651,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":2,"stdoutIsTTY":true,"exit":7}
- M10-aq/M: {"t":1795525128218,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":0}
- M10-aq/P: {"t":1795525132723,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":1,"stdoutIsTTY":true,"exit":0}

## M13 agent envelopes
- M13-agent/M code 1 stdoutDocs 2 true/-,false/INTERNAL_ERROR | gate anywhere: false | stderr: "" | file: -
- M13-agent/P code 1 stdoutDocs 2 true/-,false/INTERNAL_ERROR | gate anywhere: false | stderr: "" | file: -
- M13-agent-o/M code 1 stdoutDocs 0  | gate anywhere: false | stderr: "" | file: false/INTERNAL_ERROR
- M13-agent-o/P code 1 stdoutDocs 0  | gate anywhere: false | stderr: "" | file: false/INTERNAL_ERROR

## M14 flush loop (M build, 20 runs of review --format json --fail-on warning 2>e | cat >/dev/null)
- gate line in stderr: 20/20; exit codes: 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 ; POSTs: 20

## M4 vitest (new regression test)
```
M:
 Test Files  1 passed (1)
      Tests  3 passed | 42 skipped (45)
P (test file transplanted):
     × keeps stdout valid JSON when the gate fires 507ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [Function] to not throw an error but 'SyntaxError: Unexpected non-whitespac…' was thrown
"SyntaxError: Unexpected non-whitespace character after JSON at position 430 (line 22 column 1)"
```
