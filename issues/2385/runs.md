# #2385 — QA runs (2026-11-14/15, QA deploy 2eca9610a)

Model: DeepSeek V4 Flash @ Fireworks (BYOK, effort medium). Risk on + automatic approval with one unconditioned policy, plus criterion `Verbose` (reason >= 800 chars).

## Risk assessment, stage status and decision (cases 1, 2, 3)
`len` = length of `dataExecution.riskAssessment.reason`.

| provider | case | PR | execution | risk | len | riskIdentified | AssessPrRiskStage | decision |
|---|---|---|---|---|---|---|---|---|
| azure | big | [193](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/193) | partial_error | unavailable | 50 | - | partial_error (approval_risk_assessment_failed) | hold: Risk assessment is unavailable for the current PR head. |
| azure | long | [194](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/194) | success | assessed | 91 | true | success | hold: The review is not clean or did not complete. |
| azure | long2 | [196](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/196) | success | assessed | 1516 | false | success | approve: Approved by policy “All clean PRs”. |
| azure | race | [195](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/195) | partial_error | assessed | 91 | true | success | hold: The review is not clean or did not complete. |
| bitbucket | big | [42](https://bitbucket.org/kodustech/artemis/pull-requests/42) | partial_error | unavailable | 50 | - | partial_error (approval_risk_assessment_failed) | hold: Risk assessment is unavailable for the current PR head. |
| bitbucket | long | [41](https://bitbucket.org/kodustech/artemis/pull-requests/41) | success | assessed | 2000 | true | success | hold: The review is not clean or did not complete. |
| bitbucket | long2 | [44](https://bitbucket.org/kodustech/artemis/pull-requests/44) | success | assessed | 1640 | false | success | hold: The review is not clean or did not complete. |
| bitbucket | race | [43](https://bitbucket.org/kodustech/artemis/pull-requests/43) | success | assessed | 1805 | true | success | hold: The review is not clean or did not complete. |
| bitbucket | race | [45](https://bitbucket.org/kodustech/artemis/pull-requests/45) | success | assessed | 2000 | true | success | hold: The review is not clean or did not complete. |
| github | auth | [450](https://github.com/kodustech/poison_store/pull/450) | success | assessed | 2000 | true | success | hold: The review is not clean or did not complete. |
| github | big | [449](https://github.com/kodustech/poison_store/pull/449) | partial_error | unavailable | 50 | - | partial_error (approval_risk_assessment_failed) | hold: Risk assessment is unavailable for the current PR head. |
| github | long2 | [448](https://github.com/kodustech/poison_store/pull/448) | success | assessed | 1798 | true | success | hold: The review is not clean or did not complete. |
| github | race | [447](https://github.com/kodustech/poison_store/pull/447) | partial_error | assessed | 91 | true | success | hold: The review is not clean or did not complete. |
| gitlab | big | [56](https://gitlab.com/sartorijr/kodex/-/merge_requests/56) | partial_error | unavailable | 50 | - | partial_error (approval_risk_assessment_failed) | hold: Risk assessment is unavailable for the current PR head. |
| gitlab | long | [57](https://gitlab.com/sartorijr/kodex/-/merge_requests/57) | success | assessed | 91 | true | success | hold: Risk was identified in this PR. |
| gitlab | long2 | [59](https://gitlab.com/sartorijr/kodex/-/merge_requests/59) | success | assessed | 1939 | false | success | approve: Approved by policy “All clean PRs”. |
| gitlab | race | [58](https://gitlab.com/sartorijr/kodex/-/merge_requests/58) | partial_error | assessed | 2000 | true | success | hold: The review is not clean or did not complete. |

- Case 1 (`long2`, `long`, `race`): assessed reasons of 1516–2000 chars on all 4 providers; stage `success`; none capped below 2000. The 91-char reasons are the deterministic "Control flow changed without test evidence" path.
- Case 2 (`big`, ~60 KB file): `unavailable` / "The complete PR diff exceeds the assessment limit.", stage `partial_error` with `partialErrors[0].reason=approval_risk_assessment_failed`, execution `partial_error`, hold "Risk assessment is unavailable for the current PR head." on all 4.
- Case 3 (`auth`, GitHub #450, `if (!user) return 401` removed): assessed, `riskIdentified=true`, stage `success`. Hold reason is "The review is not clean" because the review also flagged the change (that check precedes the risk one).

## Case 4 — push during diff read (GitHub #452)
Not reproduced: the diff was read before the second push landed, so risk came back `assessed`; decision hold "A newer commit arrived while Kody reviewed this one". No `approval_risk_assessment_failed`. The second commit was skipped as "already being processed" (same behavior reported on #2534).

## Case 5 — `.d.mts` / `.d.cts` in history
GitLab kodex: MR !60 (`types/a.d.mts`, `types/b.d.cts`, `src/types-index.ts`) merged 2026-11-14 16:28. History run 2026-11-15 00:00 UTC: `codeAreaHistorySync` windowEnd 2026-11-13T22:01 → 2026-11-15T00:00:14, discoveredMergedPrs 3 → 4; `codeAreaRiskMaps` refreshedAt 00:00:22, coverage scanned 4/4, `scanComplete=true`, structureCoverage eligible 2 / analyzed 2; the three paths are in the snapshot with PR 60 as evidence. Logs (`observability_logs_ts`, since 16:00): no `Could not analyze file for structure sampling`, no `Debug Failure`, no `Could not refresh code-area history batch`. Worker logs for that minute are present in the collection, so the empty search is meaningful.

GitHub poison_store: PR #451 (same three files) merged 2026-11-14. History run 2026-11-15 02:00 UTC: `codeAreaHistorySync` windowEnd 2026-11-14T02:00:12 → 2026-11-15T02:00:13, discoveredMergedPrs 0 → 1; `codeAreaRiskMaps` refreshedAt 02:00:46, scanned 1/1, `scanComplete=true`, structureCoverage eligible 1 / analyzed 1 (only `src/types-index.ts`); the three paths are in the snapshot. Same log search empty.

Raw: kodex_snapshot_hits.json, hist_0008.json, poison_0208.json.

## Case 6 — risk repos receive history
`codeAreaHistorySync` + `codeAreaRiskMaps` exist for kodex and poison_store; every risk evaluation on 2026-11-14 carries `areaMapVersion` (kodex `9dbb2b9e…`, poison `f3776213…`).

## Case 7 — cron does not approve a partial run (GitHub #449)
Execution `partial_error` at 16:27; at 00:30 next day (≈240 runs of the 2-min approval cron) the PR has no review and exactly one `kodus-conditional-approval` comment ("Automatic approval held … Risk assessment is unavailable for the current PR head.").

## Case 8 — risk does not turn approval on (UI)
Repo with automatic approval off → Risk page → Risk assessment on → save → General: automatic approval still off. Screens: ui-01-risk-before.png, ui-02-risk-on-saved.png, ui-03-general-after.png.

## Not covered (spec only, per plan)
Approval-reason reconciliation after a partial run; history-budget priority among 40 batches; generic structural-analyzer failure isolation.

## Observation
History refresh requires `windowEnd` older than 24h, but the cron fires on the hour and the previous run stamped `windowEnd` seconds after it, so a repo the run reaches before its 24h mark waits one more slot (26h): kodex was skipped at 2026-11-14 22:00 (windowEnd 22:01:02 the day before) and refreshed at 00:00; poison_store made its 02:00 slot by one second.
