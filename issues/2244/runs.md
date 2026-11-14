# #2244 — a failed write of the PR summary is reported with its own cause (QA)

- Env: qa.kodus.io (contains #2245), DeepSeek V4.1 Flash @ Fireworks, 2026-11-14 16:00–16:30 UTC.
- Route: the provider-agnostic race from the plan. Risk assessment on for the repo and "Generate PR summary" on; while the run's `UpdateCommentsAndGenerateSummaryStage` row was in progress (polled every 0.7 s), the PR description was edited through the provider API. The publish step then refuses to write (`The PR changed while Kody was generating its summary.`).
- Not used: a repository where the integration user can comment but not edit the description (GitHub org owner, no second GitLab/Bitbucket account; Azure has no such role).

| Provider | PR | Execution | Generating Summary row | Kody Review Finished |
|---|---|---|---|---|
| GitHub | [447](https://github.com/kodustech/poison_store/pull/447) | partial_error | `partial_error` — The PR changed while Kody was generating its summary. | Code review completed with issues: The PR changed while Kody was generating its summary. |
| GitLab | [58](https://gitlab.com/sartorijr/kodex/-/merge_requests/58) | partial_error | `partial_error` — The PR changed while Kody was generating its summary. | Code review completed with issues: The PR changed while Kody was generating its summary. |
| Azure Repos | [195](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/195) | partial_error | `partial_error` — The PR changed while Kody was generating its summary. | Code review completed with issues: The PR changed while Kody was generating its summary. |
| Bitbucket (try 1) | [43](https://bitbucket.org/kodustech/artemis/pull-requests/43) | success | `success`  | Code review completed successfully |
| Bitbucket (try 2) | [45](https://bitbucket.org/kodustech/artemis/pull-requests/45) | success | `success`  | Code review completed successfully |

- Stage metadata on the failed rows: `partialErrors: [{reason: summary_generation_failed, message: "Failed to publish summary to the pull request"}]`.
- No row or log for these runs says `The configured API key … appears invalid or lacks permission`.
- Bitbucket: the description was edited inside the summary stage twice, but the publish went through both times, so the failure path was not reached there. The guard only engages when the risk snapshot's description key still matches the PR read before publishing; that is #2387's guard, not this issue's code.
- Not covered: a model failure during summary generation still classified as an LLM error (not forceable without failing the whole review; covered by `finish-comments.stage.spec.ts`).
