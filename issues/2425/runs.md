# #2425 — QA runs (runo self-hosted preview, 2026-11-11/12)

Environment: runo preview, `self-hosted` shape, of the mirror branch `qa/pr-2445` (PR #2531). No `BETA_FEATURES` in the preview env (only the approval-risk smoke sets it, in its own process).
Org config on `kodustech/poison_store`: `deterministicEvidence.tools.secrets: true` (repository level). Deterministic evidence is `stage: beta`.

| Run | Preview code | `RunAnalyzersStage` | Deterministic findings in the generalist prompt (Langfuse, `environment=preview`) |
|---|---|---|---|
| PR 419, 2026-11-11 19:26 UTC | `e67866fc` (before #2475) | `success`, 0.96 s (analyzers ran) | yes: `<DeterministicFindings>` in trace `07218bd546c4d1503dc3f0f82f0770a8` |
| PR 418, 2026-11-12 01:32 UTC | `9818e9f68` (`main` merged in, includes #2475 `ac5098b7`) | `success`, 0.01 s (gate closed, stage returned at `run-analyzers.stage.ts:52`) | none |
| PR 420, 2026-11-12 11:38 UTC | same | `success` | none |

PR 418/420 carry a planted key that the same code finds when the feature is on (cloud stack, see [#2419 runs](https://kodustech.github.io/qa-evidence/issues/2419/runs.md)), so "no findings" here is the gate, not an empty scan.
Cloud: QA (`homolog`, cloud) still ran the analyzers for the same org on 2026-11-12 11:43 UTC, so the cloud path is unchanged.

Not run: the web resolver (`apps/web/src/core/feature-gate/resolver.ts`) on a self-hosted UI, and a self-hosted run with `BETA_FEATURES=true`.
