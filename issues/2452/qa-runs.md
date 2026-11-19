# #2452 runs on QA (qa.api.kodus.io, backend restart 2026-11-19 14:16 UTC with merge fcb864391)

## 1. Active trial, billing up: review runs (GitHub, kodustech/poison_store#493)

License in `billing.organization_licenses`: `trial`, `teams_managed`, trialEnd 2030-12-31. PR opened 17:26:34 UTC.

`observability_logs_ts`, org of the QA account, 17:26:30-17:40 UTC:

```
17:26:39.313 GitHubPullRequestHandler  Code review job enqueued for asynchronous processing
17:26:40.865 PipelineExecutor          Stage 'ValidatePrerequisitesStage' completed in 143ms: 736f6cd6-...
...                                    (every following stage runs)
17:28:21.667 PipelineExecutor          Finished pipeline: CodeReviewPipeline (ID: 736f6cd6-...)
17:28:23.791 AutomationCodeReviewService Successfully handled pull request for PR#493
messages matching "license not valid|ValidateOrganizationLicense not working|No active subscription": 0
```

PR result: "Code Review Completed" summary plus 1 inline suggestion (`app/qa_2452_discount.rb:4`).

## 2. Genuinely ended license: trial-ended message unchanged (GitLab, new org qa-2452-expired)

New org, GitLab token integration, repository `qa2004-ast-7` selected; license row inserted as `canceled`, `teams_managed`, trialEnd 2026-11-01. MR !1 opened 17:29:56 UTC.

```
17:30:01.836 PipelineExecutor            Starting pipeline: CodeReviewPipeline (ID: b1f6c16f-...)
17:30:02.064 PermissionValidationService Organization license not valid
             validation: {"valid":false,"subscriptionStatus":"canceled","planType":"teams_managed",...}   (no "unavailable")
17:30:02.352 ValidatePrerequisitesStage  No active subscription found for PR#1
17:30:02.361 PipelineExecutor            Pipeline 'CodeReviewPipeline' skipped due to SKIP status
```

MR comment posted by Kody: `## Your trial has ended! 😢 ...`
