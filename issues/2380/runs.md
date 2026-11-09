# #2380 — QA runs (2026-11-09, QA on 0df20b706, includes #2403)

How the write was made to fail: the code host refuses a description write on a PR that is no longer open. Checked directly with the integration tokens before the runs:
- Bitbucket Cloud, `PUT .../pullrequests/<declined id>` → 400 `Can only update an open pull request.`
- Azure Repos, `PATCH .../pullRequests/<abandoned id>` → 400 `TF401181: The pull request cannot be edited due to its state.`

Each run opened a fresh PR from branch `qa2343-heavy` (billing fixture), let the automatic review run, and a watcher closed the PR (decline / abandon) as soon as the first inline comment landed, i.e. after the findings were posted and before the summary stage.

| Host | PR | Closed at (UTC) | Summary stage | Execution | Worker logs |
|---|---|---|---|---|---|
| Bitbucket Cloud (kodustech/artemis) | #34 | 12:12:2x (declined) | `partial_error`, message `Bad Request`, partialErrors `summary_generation_failed` / `Failed to publish summary to the pull request` | `partial_error`, "Code review completed with issues: Bad Request" | 12:12:23.850 `BitbucketCloudService` error (HTTPError Bad Request) → 12:12:23.851 `Failed to update overall comment for PR#34` → 12:12:23.853 `Failed to publish summary to the pull request for PR#34` (`summaryStep: publish`); no `Updated summary for PR#34` |
| Azure Repos (Kodus QA/athena) | #187 | 12:22:45 (abandoned) | `partial_error`, message `Request failed with status code 400`, same partialErrors | `partial_error`, "Code review completed with issues: Request failed with status code 400" | 12:22:49.981 `AzureReposService` `Failed to update description in pull request #187` (AxiosError 400) → 12:22:49.985 `Failed to publish summary to the pull request for PR#187`; no `Updated summary for PR#187` |
| Azure Repos, control | #186 | left open during the review | success, summary written into the description | success | 12:11:52 `Updated summary for PR#186` |

In both failing runs the 11 inline comments were posted, the PR description stayed as the author wrote it, and the run shows as Partial Error in the Pull requests list (screenshots 01 and 02).

Not covered: Forgejo and Bitbucket Data Center (no QA integration); the no-credentials path on those two (unit tests in the PR only).

Observation: the reported message is the HTTP client's generic text (`Bad Request`, `Request failed with status code 400`), not the host's reason (`Can only update an open pull request.`, `TF401181 ...`).

Cleanup: PRs artemis #34 declined, athena #186/#187 abandoned; branch `qa2343-heavy` kept.
