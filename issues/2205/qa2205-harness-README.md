# #2205 / PR #2657 local harness

Specs run inside detached worktrees of kodus-ai at `c232c4cb4` (merge) and `8bc021d80` (first parent), under `libs/qa2205/`, with the repository jest config.

- `qa2205-planner.spec.ts`: real `context-fit-planner` (estimator, preflight, chunker), `resolveAdaptiveProfile`, line-number conversion. Output `planner-{merge,parent}.json` (M2, M7, M8, M11).
- `qa2205-provider.spec.ts`: real `BaseCodeReviewAgentProvider.execute`, real `runChunkedReview`, scorer, tiers and prompt builder. Stubbed: model resolution, the agent loop (model boundary), the Langfuse wrapper. Output `prov-{merge,parent}.json` (M3, M4, M5, M6, M8, M9, M10, M13, M16, M22, M32, real QA patches of PR #5 / MR !3).
- `qa2205-presize.spec.ts`: sizing of the M23/M24/M25 fixtures and legacy deep mode (M12). Output `pre-{merge,parent}.json`.
- `qa2205-worker.spec.ts`: one OS process per worker (`jest --runInBand`), real provider and batch runner, 4 s stubbed model call; `ev-m14.jsonl` (SIGKILL during batch 2, parent-signal abort, next run) and `ev-m26.jsonl` (two concurrent workers, 64K vs 24K).
- `gen.py`: fixture generator (F-large, F-small, F-filter, compact-24K, many-files).

The fake key in the provider spec (`sk-qa2205-CANARY-...`) is a canary, not a credential.
