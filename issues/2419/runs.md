# #2419 / PR #2445 — QA runs (2026-11-12)

Fixture: `kodustech/poison_store` PR 420 (branch `qa-2445-fresh`), one large file `src/inventory-data.js` whose `patch` GitHub's `pulls/files` withholds, with a fake API key on line 4.
Config: GitHub token auth, deterministic evidence `secrets: true` on the repo, E2B sandbox, BYOK DeepSeek V4.1 Flash (Fireworks).
Prerequisite: #2536 / PR #2537 (raw-diff owner fix, merged 2026-11-12). Before it, the raw-diff recovery returned 404 on GitHub and the crash below never surfaced.

| Run | Code | Recovery | RunAnalyzersStage | Secrets scan | Comment on PR 420 |
|---|---|---|---|---|---|
| QA, 11:43 UTC | `main` f74afbb (with #2537, without #2445) | ran | **failed**: `Cannot assign to read only property 'patch' of object '#<Object>'` | did not run | none from the scan |
| Local, 19:42 UTC | `qa/pr-2445` 9818e9f68 (PR head e67866fc + `main`) | `Recovered 1 of 1 missing file patch(es)` (`src/inventory-data.js`) | success (23.3 s) | `ran: [secrets]`, `raw: 1, inDiff: 1, clippedOut: 0`, rule `generic-api-key` | [line 4, badge **Deterministic**, severity high](https://github.com/kodustech/poison_store/pull/420#discussion_r4555480737) |

`run-analyzers.stage.ts` is identical between the PR head and the tested commit.

Preview (runo self-hosted, same commit) is not evidence either way: without `BETA_FEATURES` the deterministic-evidence gate is closed there since #2475 (#2425), so `RunAnalyzersStage` returned at the gate (0.01 s) and never ran the recovery or the scan.

Local run: docker dev stack on the worktree, review triggered by posting the `pull_request` event straight to the local webhooks service (no GitHub webhook, so QA did not review it in parallel).
Cleanup: QA `poison_store` code-review config restored and checked identical to its backup; preview and local webhooks removed from `poison_store` (only QA's remains); PRs 418/420 closed, branches kept.
