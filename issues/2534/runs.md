# #2534 — conditional approval: push during review, base change, history backoff, one reason comment (QA)

- Env: qa.kodus.io (contains #2535 + #2558), orgs on `beta`, DeepSeek V4.1 Flash @ Fireworks. 2026-11-14 16:30–18:20 UTC.
- Named-policy path: one enabled policy with no conditions + Risk on, per repo. Legacy path: `poison_store` with no named policies saved, `pullRequestApprovalActive: true`, `approvalAuthors: [sartorijrbot]`.

## Push during review (second commit pushed while the first was in InitialComment/AgentReview)
| Provider / path | PR | First-commit execution | `approvalDecision.reason` | Reason comments |
|---|---|---|---|---|
| GitHub, named | [#452](https://github.com/kodustech/poison_store/pull/452) | `1159dc6` | A newer commit arrived while Kody reviewed this one; Kody decides on the next reviewed commit. | 1 |
| GitLab, named | [!61](https://gitlab.com/sartorijr/kodex/-/merge_requests/61) | `27b4eef` | same | 1 |
| Bitbucket, named | [#46](https://bitbucket.org/kodustech/artemis/pull-requests/46) | `f03b2f6` | same (second commit then reviewed: `Risk was identified in this PR.`, the same comment updated) | 1 |
| Azure Repos, named | [197](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/197) | `87d1153` | same | 1 |
| GitHub, legacy | [#487](https://github.com/kodustech/poison_store/pull/487) | — | same | — |

## Target branch changed during review (GitHub)
- [#460](https://github.com/kodustech/poison_store/pull/460): PR retargeted to another base while under review → `The target branch changed during the review, so this review cannot approve the PR.`
- [#459](https://github.com/kodustech/poison_store/pull/459): a commit pushed straight to `main` during review did not trigger it (`reviewedBaseSha` stayed the PR's base SHA; GitHub's PR `base.sha` does not move with the branch), decision went on to the approval attempt.

## Holds that must stay as they were
- Review with suggestions: `The review is not clean or did not complete.` (e.g. athena 194, poison_store #448).
- Partial runs (diff over the risk limit: kodex !56, athena 193, poison_store #449): never approved by the cron, one reason comment each.

## History listing backoff (existing QA data)
`codeAreaHistorySync` for six repositories of another QA org: `listingFailures: 3`, `retryAfter` doubling 2 h → 4 h → 8 h across the 00:00/02:00/06:00 runs of 2026-11-12, one `Could not refresh code-area history batch` per repository only on the first failing run. Recovery (`Code-area history listing recovered`) not observed: those repositories stay unlistable.

## One reason comment, bounded writes
- Every PR above carries exactly one `<!-- kodus-conditional-approval -->` comment.
- One exception logged: `Could not post conditional approval reason` — `conditional approval comment lookup bounded timeout after 10000ms` (cron, Bitbucket artemis #42, 18:08 UTC). The comment already carried that reason (last updated 16:04) and stayed single; `approvalReasonDeliveryFailure` remained set on the PR.

## Observations
- On GitHub, GitLab and Azure the second commit was never reviewed: its webhook arrived while the first review ran and was dropped (`Code review already being processed for PR#452, skipping`). The hold says "Kody decides on the next reviewed commit", but no review of that commit follows until another push (1h30 later, still one execution on #452, !61, 197).
- Not reproducible here: label/current-PR read failures, first-activation burst, the GitHub per-installation write queue.
