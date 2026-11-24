# QA #2594 round 2: GitLab runs (jr-claude-gitlab, sartorijr/claude-athena)

## !9: M17(a) seated commenter sartorijr14 (git id 32416720) on seatless author (1249745) MR !9
https://gitlab.com/sartorijr/claude-athena/-/merge_requests/9

- {'comments': 2, 'notices': 1, 'old_user_msg': 0, 'docs_emoji': 0, 'reactions': [('eyes', 'sartorijr')]}

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| fcc189ae-2ee6-4c43-a91d-73a467658389 | skipped | System | 04:22:41 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 8bf9214a-d781-4bb4-b465-8d3b7fde646f | skipped | command | 04:23:21 | 2026-11-24T04:23:22.636Z | User Not Licensed — Assign seat to user |
| 87e1aaea-55d4-4ad8-a04e-0ed7eee6efb4 | skipped | System | 04:42:41 | - | PR is Closed |

## !10: M23 attempt 1 (parallel commits on one branch: GitLab rejected the second, 400)
https://gitlab.com/sartorijr/claude-athena/-/merge_requests/10

- {'comments': 1, 'notices': 1, 'old_user_msg': 0, 'docs_emoji': 0, 'reactions': [('lock', 'sartorijr'), ('eyes', 'sartorijr')]}

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 13f35adb-8852-4004-968c-3a37013cba48 | skipped | System | 04:24:28 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 005428f9-8146-4b65-8227-86975c074d85 | skipped | System | 04:25:01 | 2026-11-24T04:25:02.539Z | User Not Licensed — Assign seat to user |
| f0671ffc-c762-4a01-8005-dc5668d3dc49 | skipped | System | 04:42:41 | - | PR is Closed |

## !11: M23: command and push fired together on MR !11
https://gitlab.com/sartorijr/claude-athena/-/merge_requests/11

- {'comments': 2, 'notices': 1, 'old_user_msg': 0, 'docs_emoji': 0, 'reactions': [('eyes', 'sartorijr')]}

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 9439d73a-304e-4c6e-bd55-3d047d56b133 | skipped | System | 04:26:05 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 0b86d77f-3d31-4a24-a224-deacde26ad75 | skipped | command | 04:26:30 | 2026-11-24T04:26:32.537Z | User Not Licensed — Assign seat to user |
| bdd26abf-9b8f-49e1-a7c0-e48ac75f97a0 | skipped | System | 04:42:41 | - | PR is Closed |

## M23 overlap: worker logs for MR !11 (observability_logs_ts)

```
04:26:29.888 SavePullRequestUseCase GitLab webhook actor replaced by resolved MR author
04:26:30.623 RunCodeReviewAutomationUseCase GitLab webhook actor replaced by resolved MR author
04:26:30.679 SavePullRequestUseCase GitLab webhook actor replaced by resolved MR author
04:26:30.764 RunCodeReviewAutomationUseCase RunCodeReviewAutomationUseCase PR#11
04:26:30.981 PipelineExecutor Starting pipeline: CodeReviewPipeline (ID: c7d66bc9-57f1-4172-b0fe-645bf7583b37)
04:26:31.085 PermissionValidationService User not licensed
04:26:31.092 ValidatePrerequisitesStage User not licensed but company has licenses
04:26:32.180 RunCodeReviewAutomationUseCase GitLab webhook actor replaced by resolved MR author
04:26:32.330 RunCodeReviewAutomationUseCase RunCodeReviewAutomationUseCase PR#11
04:26:32.336 AutomationCodeReviewService Code review already being processed for PR#11, skipping
04:26:32.547 PipelineExecutor Stage 'ValidatePrerequisitesStage' completed in 1565ms: c7d66bc9-57f1-4172-b0fe-645bf7583b37
04:26:32.548 PipelineExecutor Pipeline 'CodeReviewPipeline' skipped due to SKIP status c7d66bc9-57f1-4172-b0fe-645bf7583b37
04:26:32.548 PipelineExecutor Finished pipeline: CodeReviewPipeline (ID: c7d66bc9-57f1-4172-b0fe-645bf7583b37)
04:26:32.910 CodeReviewHandlerService Review skipped for PR#11 - notification already handled
04:26:32.923 AutomationCodeReviewService Successfully handled pull request for PR#11
```

## M17(a): permission check on MR !9 uses the author id

```
04:23:22.177 PermissionValidationService User not licensed userGitId= 1249745 
04:23:22.183 ValidatePrerequisitesStage User not licensed but company has licenses userGitId= 1249745 AUTO_ASSIGN_DISABLED
```

Seat state during the command: billing users-with-license for the org returned [{"git_id":"32416720"}] (commenter only).
