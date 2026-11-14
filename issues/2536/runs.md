# #2536 — GitHub raw PR diff for withheld file patches (QA)

- Env: qa.kodus.io (contains #2537), org poison, `kodustech/poison_store` (PAT integration), Deterministic checks → secrets on for the run. 2026-11-14 14:50–14:58 UTC. #2445 (fix for #2419) is not merged.

| PR | Fixture | `pulls/files` | Raw diff (`Accept: application/vnd.github.diff`) | Review |
|---|---|---|---|---|
| [#432](https://github.com/kodustech/poison_store/pull/432) | 1 file, 3,502 added lines, `api_key` at line 1751 | no `patch` key | 200, 3,508 lines | `error`: `Cannot assign to read only property 'patch'` in RunAnalyzersStage |
| [#433](https://github.com/kodustech/poison_store/pull/433) | 1 file, 22,002 added lines | no `patch` key | 200, 22,008 lines (no 406) | same error |
| [#434](https://github.com/kodustech/poison_store/pull/434) | 1 file, 22 lines | `patch` present | — | `success`; RunAnalyzersStage completed in 1.3 s; secret flagged at line 11 |

Logs (`observability_logs_ts`, org poison):
- Today, #432/#433: no `Failed to read the raw pull request diff`, no `Recovered 0 of 1`. The stage fails at `run-analyzers.stage.ts:283` (`file.patch = patch`), which runs only when `getFilePatches` returned the file's hunk, i.e. the raw diff was read and the patch recovered. The `Recovered 1 of 1` line comes after that assignment, so it is not reached; the crash is #2419 (fix in #2445, open).
- Before the fix on QA (2026-11-11 18:42, 18:48, 19:19 UTC): `Failed to read the raw pull request diff` (GithubService) followed by `Recovered 0 of 1 missing file patch(es)`.
- #434 (patch present): no recovery call, no recovery log.

Not reproduced: a raw diff refused as too large (406) — GitHub served the 22k-line diff. A published secrets finding on a recovered file depends on #2445.
