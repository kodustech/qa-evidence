# QA run for kodus-ai#2557 (PR #2216) on Forgejo (Codeberg)

QA org created for this run: `qa-2557-forgejo` (org `b10f0162-…`, team `bcf4f538-…`). Repository: `sartorijr/gym` on codeberg.org (Forgejo), repository id `2913729`.
Source: Mongo `observability_logs_ts`, filtered on the org id. Times UTC, 2026-11-19.

## Webhook auto-created on repository selection

Before selection: `GET /repos/sartorijr/gym/hooks` returned `[]`.
After "Enable for team (1 repo)" at 12:41:58:

```
12:41:58.867 ForgejoService: Forgejo webhook created
12:41:58.868 ForgejoService: Forgejo webhook setup finished
12:41:58.887 WebhookSetupFailures: Recorded webhook setup outcome
```

Hook on Codeberg afterwards: id 147552, type `forgejo`, active, url `https://qa.api.kodus.io/forgejo/webhook`, created 12:41:58Z,
events push, issue_comment, pull_request, pull_request_assign, pull_request_label, pull_request_milestone, pull_request_comment,
pull_request_review_approved, pull_request_review_rejected, pull_request_review_comment, pull_request_sync, pull_request_review_request.

## Rule sync, content read through getRepositoryContentFile

Onboarding sync, rule files on main without frontmatter (content was read and handed to the template parser):
```
12:42:06.286 KodyRulesSyncService: [kody-rules-sync] skipped: not a rule template (needs frontmatter with a title and a body)
12:42:06.318 KodyRulesSyncService: [kody-rules-sync] skipped: not a rule template (needs frontmatter with a title and a body)
12:42:06.322 KodyRulesSyncService: [kody-rules-sync] summary (onboarding): 0 imported, 2 skipped, 0 removed (of 2 candidate file(s))
```
`.kody/rules/no-var.md` rewritten in the template format, then sync from main (finish-onboarding at 12:46, manual `POST /kody-rules/sync-ide-rules` at 12:47):
```
12:46:28.830 KodyRulesSyncService: [kody-rules-sync] summary (main): 1 imported, 1 skipped, 0 removed (of 2 candidate file(s))
12:47:07.643 KodyRulesSyncService: [kody-rules-sync] summary (main): 1 imported, 1 skipped, 0 removed (of 2 candidate file(s))
```
(the 1 skipped is `no-console-log.md`, still without frontmatter on main at that point)

Merge of gym PR #1, which turned `.kody/rules/no-console-log.md` into the template format:
```
12:52:38 KodyRulesSyncService: [kody-rules-sync] summary (merge): 1 imported, 0 skipped, 0 removed (of 1 candidate file(s))
```
Mongo `kodyRules` for the org: `QA-2557: no var declarations` (sourcePath `.kody/rules/no-var.md`, origin `repo_file_sync`, active, high, `**/*.js`)
and `QA-2557: no console.log in src` (sourcePath `.kody/rules/no-console-log.md`, origin `repo_file_sync`, active, medium, `src/**/*.js`).

## Review on Forgejo, gym PR #1

```
12:49:31 ResolveConfigStage completed
12:49:31 FetchChangedFilesStage: Found 2 files to analyze for PR#1 (2 total, 0 ignored)
12:49:56 KodyRulesShardedAgent: [AGENT] kodus-rules-review-agent (sharded) done for PR#1: 2 suggestions
12:51:25 CreateFileCommentsStage: Successfully processed file comments for PR#1
12:51:34 Finished pipeline: CodeReviewPipeline (ID: c6a61a1a-1f7c-42d2-a4ab-50d429a87984)
```
Posted: summary in the PR description, "Code Review Completed", and an inline comment on `src/cart.js:4` citing the synced rule "QA-2557: no var declarations".

## kodus-config.yml read from Forgejo, gym PR #2

`kodus-config.yml` on main sets `ignoredTitleKeywords: ['qa-skip-2557']`; "Prefer kodus-config.yml settings" turned on for the repository.
```
12:49:47 ValidateConfigStage: Title Ignored — Remove keywords defined in 'Ignore title keywords' setting (Title matches ignored keyword: "qa-skip-2557")
12:49:47 PipelineExecutor: Pipeline 'CodeReviewPipeline' skipped due to SKIP status 8eab2d5f-d760-4008-b0e1-67d831912a7e
12:49:48 CodeReviewHandlerService: Review skipped for PR#2 - adding skip reaction
```
No log line for the org in the whole run carries "empty or unfetchable content".
