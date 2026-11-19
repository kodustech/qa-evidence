# Centralized config on Forgejo, kodus-ai#2557 (PR #2216)

Org `qa-2557-forgejo`, reviewed repository `sartorijr/gym` (id 2913729), config source `kodus/gym-config` (id 2913897) on codeberg.org. Mongo `observability_logs_ts`, filtered on the org id. Times UTC, 2026-11-19.

## Setup through the product
- 13:15 `kodus/gym-config` added in Settings > Repositories; Kodus created webhook 147561 on it (`https://qa.api.kodus.io/forgejo/webhook`).
- 13:17 Centralized Config modal, "Automatic (Create PR now)": `Failed to initialize centralized config. Reason: Failed to upload files to Forgejo` (see Observations in the issue comment; rolled back, parameter `enabled: false`).
- 13:20 Contents of the modal's Download ZIP committed to `kodus/gym-config` main, with two edits:
  - `sartorijr/gym/kodus-config.yml`: `kodusConfigFileOverridesWebPreferences: false`, `ignoredTitleKeywords: ['qa-central-2557']`
  - new `sartorijr/gym/.kody-rules/review/qa-2557-central-no-todo.yml` (title "QA-2557 central: no TODO comments", path `src/**/*.js`)
- 13:21 Modal, "Manual (Sync later)" + `kodus/gym-config`: `Centralized config initialized with manual method, skipping sync`.

## Sync Now (centralized-config.service.ts: fetchConfigFile -> codeBaseConfig.getConfigurationFile, fetchKodyRuleFile)
```
13:21:59 CentralizedConfigSyncUseCase: Starting centralized config sync
13:22:14 CentralizedConfigService: Kody rules synchronized successfully. Synced: 3, Failed: 0
13:22:15 CentralizedConfigService: No stale Kody rules to remove
```
Postgres `parameters.code_review_config` (13:22:09): repository 2913729 configs = `{"ignoredTitleKeywords": ["qa-central-2557"]}`.
Mongo `kodyRules`: new rule `QA-2557 central: no TODO comments` (uuid 8ef9d9a7-…, active, `src/**/*.js`).

## Behavior on gym PRs
PR #3, title `qa-central-2557: …`:
```
13:24:28 CentralizedConfigSyncUseCase: Starting centralized config sync
13:24:31 CentralizedConfigService: Kody rules synchronized successfully. Synced: 3, Failed: 0
13:24:31 ValidateConfigStage: Title Ignored — ... (Title matches ignored keyword: "qa-central-2557")
13:24:33 CodeReviewHandlerService: Review skipped for PR#3 - adding skip reaction
```
PR #4, `src/discount.js` with a `// TODO:` line: full review, inline comment on `src/discount.js:2` citing "QA-2557 central: no TODO comments".
```
13:25:23 KodyRulesShardedAgent: [AGENT] kodus-rules-review-agent (sharded) done for PR#4: 1 suggestions
13:26:24 PipelineExecutor: Finished pipeline: CodeReviewPipeline (ID: 30188c33-…)
```

## Sync on merge in the config repository (webhook path)
gym-config PR #1 adds `qa-central-merge-2557`, merged 13:27:
```
13:27:14 ValidatePrerequisitesStage: Repository is centralized-config source, skipping automation
13:27:41 CentralizedConfigSyncUseCase: Starting centralized config sync
13:27:44 CentralizedConfigService: Kody rules synchronized successfully. Synced: 3, Failed: 0
```
Repository 2913729 configs afterwards: `{"ignoredTitleKeywords": ["qa-central-2557", "qa-central-merge-2557"]}`.

## Scoped read (centralized-config-pr.service.ts getScopedKodusConfigFileContent)
`POST /parameters/create-or-update-code-review`, repository 2913729, `ignoredTitleKeywords: ['qa-central-2557']` (equal to the file at that moment), 13:24:55:
```
201 {"mode": "centralized-pr", "pending": true, "message": "No centralized changes detected for this scope. The file already contains this configuration."}
```
This answer needs the file content: with an unread file the existing scope is `{}` and the change is detected.

Missing file: same call for repository 2913897, whose folder does not exist in the config repo (Codeberg returns 404 for `kodus/gym-config/kodus-config.yml`), 13:34:10. The read returned null with no `Error getting file content` log, the change was detected and the request went on to open a PR, which failed on the upload (Observations).

## Negative
- No log for the org carries `empty or unfetchable content`.
- `ForgejoService` / `CentralizedConfigService` / `CodeBaseConfigService` errors 13:15–13:30 for this org: only `Error uploading files to Forgejo` (13:17, 13:25, 13:34), all from the PR-creation path, none from a read.
