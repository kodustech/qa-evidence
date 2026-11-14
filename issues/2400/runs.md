# #2400 — approval policies, risk and routing (QA)

- Env: qa.kodus.io (contains #2455), orgs on `beta`, DeepSeek V4.1 Flash @ Fireworks, 2026-11-14 17:05–18:45 UTC.
- Policies: P1 `Docs` (`docs/**`), P2 `Small src` (`src/**`, ≤10 changed lines, `src/**/*.lock` out of the count), P3 `Deps` (off, `deps/**` + instruction "Only dependency version bumps that keep the same major version."; `package.json` is in the default ignore list, so the bump file is `deps/versions.yml`). GitHub PRs opened by a second user (`sartorijrbot`) so the integration user can approve.

## Cases 1–2 (all four providers)
| Case | GitHub | GitLab | Bitbucket | Azure |
|---|---|---|---|---|
| A docs typo → `Approved by policy “Docs”.` | [#462](https://github.com/kodustech/poison_store/pull/462) ✅ approved | [!70](https://gitlab.com/sartorijr/kodex/-/merge_requests/70) ✅ | [#47](https://bitbucket.org/kodustech/artemis/pull-requests/47) ✅ | [198](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/198) ✅ |
| B 3 src lines → `“Small src”` | #463 ✅ | !71 ✅ | #48 ✅ | 199 ✅ |
| C docs + README → hold, both `files outside the included paths`, Deps not listed | #464 ✅ | !64 ✅ | #49 ✅ | 200 ✅ |
| D 30 src lines → `Small src: The changed-line limit was exceeded.` | #465 ✅ | !72 ✅ | #50 ✅ | 201 ✅ |
| E 8 changed src lines + 200 lock lines → `“Small src”` (lock out of the count) | #467 ✅ | !73 ✅ | #52 ✅ | 203 ✅ |

Approvals checked on the provider (GitHub review `APPROVED` by the integration user, GitLab `approved_by`, Bitbucket participant `approved`, Azure vote 10); holds left unapproved; one `kodus-conditional-approval` comment per PR. (A first E with 8 *replaced* lines = 16 changed lines was correctly held by the limit.)

## GitHub-only cases
| # | Case | Result |
|---|---|---|
| 3 | Disabled policy never approves | [#471](https://github.com/kodustech/poison_store/pull/471) dependency bump with Deps off → hold, no Deps line. Deps on, same change [#472](https://github.com/kodustech/poison_store/pull/472) → `Approved by policy “Deps”.`; Langfuse has `approval-policy-eligibility` for #472 |
| 4 | Instruction only after fixed conditions | [#475](https://github.com/kodustech/poison_store/pull/475) (`deps/` + `notes/`) → `Deps: The PR changes files outside the included paths.`; no `approval-policy-eligibility` trace for #475 |
| 5 | Author | P4 `Bot` (authors `sartorijrbot`) first: [#476](https://github.com/kodustech/poison_store/pull/476) by the bot → `“Bot”`; [#477](https://github.com/kodustech/poison_store/pull/477) by another user → `Bot: The PR author did not match.` A labeled PR by the bot matched `Bot` before `Labeled` (first match wins, #479). Author teams: not run (no test team in the official org); on Bitbucket the save is refused: `Author team conditions are unavailable on this provider. Use provider usernames instead.` |
| 6 | Labels | `Labeled` (`kody-approve`) with Bot off: [#480](https://github.com/kodustech/poison_store/pull/480) → `“Labeled”`; GitLab [!74](https://gitlab.com/sartorijr/kodex/-/merge_requests/74) → `“Labeled”`. Bitbucket and Azure: saving a label condition → 400 `PR label conditions are unavailable on this provider.` |
| 7 | Risk independent of approval | Approval off, risk on: [#483](https://github.com/kodustech/poison_store/pull/483) `riskAssessment.status = assessed`, no decision comment, no approval |
| 8 | Risk veto + Heavy | [#482](https://github.com/kodustech/poison_store/pull/482) removes `if (!token) throw`: `riskIdentified: true`, `heavy: true`, held (the review also had findings). GitLab !57 and Azure 194 (other #2385 runs): `Risk was identified in this PR.` with `heavy: true` |
| 9 | No-risk → Balanced; explicit wins | [#481](https://github.com/kodustech/poison_store/pull/481) docs: `heavy: false`, `“Docs”`; `@kody start-review --heavy` → new execution `heavy: true` |
| 10 | Agent on risk only | `risk-auditor` (`runWhen: risk-found`): #481 `customAgentRiskSkips: [{id: risk-auditor, reason: risk-not-found}]`, not run; #482 ran (2 findings); `@kody -v risk-auditor` on #481 ran it, no new approval |
| 11 | Risk preview | `POST /code-review/risk/preview {prNumber: 482}` → `assessed, riskIdentified: true` with its reason; no new PR comment |
| 12 | Legacy parity | No named policies saved, `pullRequestApprovalActive: true`, `approvalAuthors: [sartorijrbot]`: [#485](https://github.com/kodustech/poison_store/pull/485) by the bot approved (`The review is clean and the PR matches the approval scope.`); [#486](https://github.com/kodustech/poison_store/pull/486) by another user → `The PR author is outside the approval scope.` |
| 13 | All off = no extra calls | [#484](https://github.com/kodustech/poison_store/pull/484): `riskAssessment.status = disabled`; Langfuse traces only generalist / Kody Rules / summary (no risk, no eligibility); #483 (risk on) has `pr-risk-assessment` |

Not run: the Risk/Routing pages in the UI and the 403 on preview for a user without CodeReviewSettings update.
