# QA run for kodus-ai#2581 (PR #2590, merge c96dd79fc)

QA backend: deploy run 44539070175 (head e7619622d, contains c96dd79fc), restart 2026-11-19 14:16:13 UTC.
Org: QA test org `qa-2557-forgejo` (org `b10f0162-…`, team `bcf4f538-…`), Forgejo on codeberg.org.
Reviewed repository `sartorijr/gym` (id 2913729); centralized config source `kodus/gym-config` (id 2913897), manual sync.
Times UTC, 2026-11-19. Logs: Mongo `observability_logs_ts`; audit entries: Mongo `codeReviewSettingsLog`.

## Setup (the production trigger: a repository leaves the integration, then centralized sync removes its rules)

- Before: integration `repositories` = [2913729 sartorijr/gym, 2913897 kodus/gym-config]; 3 active centralized rules on 2913729.
- 18:48:42 `POST /code-management/repositories` (type replace) with only kodus/gym-config: sartorijr/gym leaves the integration.
- 18:49 fixture: 23 extra rules pushed to the org's `kodyRules` doc on repository 2913729 with `centralizedConfig.path` under
  `sartorijr/gym/.kody-rules/review/` (files that do not exist), status `synced`, so 3 real + 23 = 26 rules on the removed repository,
  the count production showed. One more on 2913897 (still integrated) as the control.
- 18:49:23 `POST /parameters/centralized-config-sync` (the web "Sync Now" call) -> 201 `Centralized config sync completed successfully`.

## Logs for the org, 18:49:20–18:51:00

```
18:49:25.974 CentralizedConfigSyncUseCase  info  Starting centralized config sync
18:49:26.592 CentralizedConfigService      warn  Could not resolve repository ID for repository name: sartorijr   x4
18:49:27.588 CentralizedConfigService      info  Kody rules synchronized successfully. Synced: 0, Failed: 0
18:49:27.610 CentralizedConfigService      info  Marked stale centralized Kody rule as deleted   x27 (to 18:49:28.063)
18:49:28.063 CentralizedConfigService      info  Removed 27 stale Kody rules
18:49:28.087 DeleteRepositoryCodeReviewParameterUseCase info Repository configuration reset successfully
```

`UnifiedLogHandler`, any org, any level, same window: 0 records.

## Audit entries written (`codeReviewSettingsLog`, same window)

```
delete  repository  {id: 2913729, name: "Unknown"}            26   18:49:27.656 – 18:49:28.058
delete  repository  {id: 2913897, name: "kodus/gym-config"}    1   18:49:28.081
delete  repository  {id: 2913729, name: "sartorijr/gym", ...}  1   18:49:28.111  (repository configuration removed)
```

Kody rules afterwards: 2913729 -> 26 deleted, 2913897 -> 1 deleted.

## Other lookup failures still log (organic QA record after the deploy)

```
2026-11-19T14:25:42.176Z UnifiedLogHandler error "Error getting repository additional info"
  metadata.organizationId: 8ee0429a-…   attributes.repositoryId: 1464250516
  error: Repository with id 1464250516 not found in code review config
```

## Before the fix (QA, previous code)

```
2026-10-02T12:22:36.123Z UnifiedLogHandler error "Error getting repository additional info"
  metadata.organizationId: unknown
  error: No active integrations found for organization (context-resolution.service.ts:40)
```

## Unit spec A/B (local worktree)

`libs/ee/codeReviewSettingsLog/infrastructure/adapters/services/unifiedLog.handler.repository-removed.spec.ts`:
- at c96dd79fc^1 (d5526275e, spec copied in): 4 failed, 2 passed. Burst case: integration lookup called 26 times, expected 1.
- at c96dd79fc: 6 passed.
