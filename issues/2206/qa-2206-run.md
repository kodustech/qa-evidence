# QA #2206 / PR #2330: real review on Forgejo (Codeberg)

PR: https://codeberg.org/sartorijr/gym/pulls/5 (closed after the test)
Files: `data/qa2206_seed.sql` (50,010 added lines, patch of 50,011 lines incl. hunk header) and `src/qa2206_label.ts` (3 lines).
Model: DeepSeek V4.1 Flash via Fireworks (BYOK, reasoning medium). QA backend restart 2026-11-19T14:16:13Z (deploy run 44539070175, contains merge b28cc52f1).

Raw diff served by Codeberg (`/pulls/5.diff`): 50,025 lines, hunk `@@ -0,0 +1,50010 @@`, so the patch reaches the pipeline uncut.

## Application log (observability_logs_ts, org of the Forgejo test team)

```
2026-11-19T18:08:32Z info FetchChangedFilesStage  Found 2 files to analyze for PR#5 (2 total, 0 ignored)
2026-11-19T18:08:34Z warn FetchChangedFilesStage  Cut 1 file diff(s) at 50000 lines for PR#5
2026-11-19T18:13:56Z info PipelineExecutor        Stage 'AgentReviewStage' completed in 316036ms
```

## Persisted execution (Postgres automation_execution 27a544b7-2038-4d4d-9f97-0e80b5cd0679, status success)

```json
"reviewWarnings": [{"kind": "DIFF_TRUNCATED", "reason": "patch_line_limit", "detail": "1 file diff(s) cut at 50000 lines, the rest was not reviewed: data/qa2206_seed.sql", "modelName": "", "contextWindowTokens": 0}]
```

The warning is written by FetchChangedFilesStage and is still there after AgentReviewStage merges its own warnings (the agent-review.stage.ts change).
Control: `automation_execution` rows with `patch_line_limit` across QA = 1 (this run). The 8 most recent successful reviews since the deploy carry no reviewWarnings.

## Web

Deployed QA web chunk `/_next/static/chunks/1qy49t2g2u-c8.js` (loaded on /pull-requests) has `DIFF_TRUNCATED:"Long file diffs truncated"`; the old "to fit the window" text is gone.

## GitHub

Branch `qa-2206-big-patch` on kodustech/poison_store with the same 50,010-line file: `GET /compare/main...qa-2206-big-patch` returns the file with additions=50010 and no `patch` field. GitHub drops the patch before Kodus sees it, so the line limit cannot be reached on GitHub (branch deleted, no PR opened).
