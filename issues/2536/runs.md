# #2536 — QA runs (QA `homolog`, 2026-11-11 / 2026-11-12)

Fixture: `kodustech/poison_store` PRs 416-420, each with one large file whose `patch` GitHub's `pulls/files` withholds; secrets scan on for the repo.
Source: `observability_logs_ts` on QA, messages matching `raw pull request diff | Recovered N of | read only property 'patch'`.

| When (UTC) | QA code | PR | Log |
|---|---|---|---|
| 2026-11-11 18:42 | before #2537 | 416 | `Failed to read the raw pull request diff` → `Recovered 0 of 1 missing file patch(es)` |
| 2026-11-11 18:48 | before #2537 | 417 | same |
| 2026-11-11 19:19 | before #2537 | 418 | same |
| 2026-11-12 11:43 | `main` f74afbb (#2537) | 420 | no raw-diff failure; stage reaches `file.patch = patch` (only runs when a patch was recovered, `run-analyzers.stage.ts:280-283`) and hits #2419's `Cannot assign to read only property 'patch'` |

Same PR 420 on a local stack with #2445 on top: `Recovered 1 of 1 missing file patch(es)` (`src/inventory-data.js`) and a Deterministic comment posted — see [#2419 runs](https://kodustech.github.io/qa-evidence/issues/2419/runs.md).
Not run: GitHub App installations (same mapper).
