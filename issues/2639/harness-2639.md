# QA #2639 / PR #2650: local harness H, merge f567dce98 vs first parent a3e58b56c

Real `SimpleLogger` (`libs/core/log/logger.ts`), real `deepSanitize`, real `MongoDBExporter`; only `collections.logs.insertMany` is a fake that captures documents. Same harness file (`qa2639-harness.spec.ts`, next to this file) on both revisions, each extracted with `git archive`. Synthetic ids only: pair A `qa2639-org-a/qa2639-team-a`, pair B `qa2639-org-b/qa2639-team-b`.

## Final PR spec

- merge: `mongodb-exporter.spec.ts` 13 passed / 13
- same spec on the first parent: 1 failed / 12 passed; failing test `reads the pair from the params a service logs`: Expected `"org-1"`, Received `"unknown"`.

## Stored rows: metadata.organizationId / metadata.teamId / metadata.tenantId / top-level tenantId

M2 processor input keys on the logger path: [{'m': 'qa2639-M2-logger', 'keys': ['params', 'correlationId', 'component'], 'hasMetadataWrapper': False}]

### M2 logger and direct exportLog

| message (component) | merge | parent |
|---|---|---|
| `qa2639-M2-logger` (BitbucketCloudService getDefaultBranch) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M2-direct` (BitbucketCloudService) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |

M3 return values: Bitbucket `''`, Azure `None` on both revisions. Both rows: level error, error name HTTPError.

### M3 real provider methods, SDK rejection

| message (component) | merge | parent |
|---|---|---|
| `Error to get default branch` (BitbucketCloudService getDefaultBranch) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `Failed to get language repository` (AzureReposService) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |

### M11 precedence

| message (component) | merge | parent |
|---|---|---|
| `qa2639-M11-F2_top_pair_wins` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a |
| `qa2639-M11-F3_nested_with_pair_tenant` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-pair-tenant / qa2639-pair-tenant | unknown / unknown / unknown / unknown |
| `qa2639-M11-F1_direct_scalars_win` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-tenant-explicit / qa2639-tenant-explicit | qa2639-org-a / qa2639-team-a / qa2639-tenant-explicit / qa2639-tenant-explicit |
| `qa2639-M11-F4_partial_top_teamOnly_plus_full_nested` (qa2639-harness) | unknown / qa2639-team-a / unknown / unknown | unknown / qa2639-team-a / unknown / unknown |
| `qa2639-M11-F5_empty_top_plus_full_nested` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |

M12 exceptions or unhandled rejections: merge [], parent []

### M12 malformed inputs

| message (component) | merge | parent |
|---|---|---|
| `qa2639-M12-top_null_nested_A` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M12-top_string_nested_A` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_org_only_A` (qa2639-harness) | qa2639-org-a / unknown / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M12-undefined_context-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-string_context-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-empty_params-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-params_repository_only-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_null-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_string-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_array-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-top_null_nested_A-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-top_string_nested_A-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_org_only_A-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_team_only_A-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-params_string-then-B` (qa2639-harness) | qa2639-org-b / qa2639-team-b / qa2639-org-b / qa2639-org-b | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_team_only_A` (qa2639-harness) | unknown / qa2639-team-a / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-undefined_context` (unknown) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-string_context` (LegacyComponent) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-empty_params` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-params_repository_only` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_null` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_string` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-nested_array` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |
| `qa2639-M12-params_string` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |

M13 pair at exporter input after deepSanitize (merge): `qa2639-M13-array80_unicode` present; `qa2639-M13-100x4096_then_params` absent; `qa2639-M13-big_field_first` present; `qa2639-M13-big_field_last` present; `qa2639-M13-many_fields_inside_params_first` present

### M13 large params

| message (component) | merge | parent |
|---|---|---|
| `qa2639-M13-array80_unicode` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M13-big_field_first` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M13-big_field_last` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M13-many_fields_inside_params_first` (qa2639-harness) | qa2639-org-a / qa2639-team-a / qa2639-org-a / qa2639-org-a | unknown / unknown / unknown / unknown |
| `qa2639-M13-100x4096_then_params` (qa2639-harness) | unknown / unknown / unknown / unknown | unknown / unknown / unknown / unknown |

### M14 secrets

- merge `qa2639-M14-logger`: dummy literals found [], benign kept True, params.password `[REDACTED]`, params.token `[REDACTED]`, org qa2639-org-a
- merge `qa2639-M14-direct`: dummy literals found [], benign kept True, params.password `[REDACTED]`, params.token `[REDACTED]`, org qa2639-org-a
- parent `qa2639-M14-logger`: dummy literals found [], benign kept True, params.password `[REDACTED]`, params.token `[REDACTED]`, org unknown
- parent `qa2639-M14-direct`: dummy literals found [], benign kept True, params.password `[REDACTED]`, params.token `[REDACTED]`, org unknown
- negative control (identity `deepSanitize` at the exporter's import, merge): `expect(record).not.toContain('qa2639-dummy-token')` fails, the literal is in the record.

### M15 Mongo network error, then success

- merge: insert calls 2; buffered after failure [('qa2639-M15-A', 'qa2639-org-a', 'qa2639-team-a', 'qa2639-org-a', 'qa2639-M15-A'), ('qa2639-M15-B', 'qa2639-org-b', 'qa2639-team-b', 'qa2639-org-b', 'qa2639-M15-B')]; accepted [('qa2639-M15-A', 'qa2639-org-a', 'qa2639-team-a', 'qa2639-org-a', 'qa2639-M15-A'), ('qa2639-M15-B', 'qa2639-org-b', 'qa2639-team-b', 'qa2639-org-b', 'qa2639-M15-B')]; final buffer 0, active flush False
- parent: insert calls 2; buffered after failure [('qa2639-M15-A', 'unknown', 'unknown', 'unknown', 'qa2639-M15-A'), ('qa2639-M15-B', 'unknown', 'unknown', 'unknown', 'qa2639-M15-B')]; accepted [('qa2639-M15-A', 'unknown', 'unknown', 'unknown', 'qa2639-M15-A'), ('qa2639-M15-B', 'unknown', 'unknown', 'unknown', 'qa2639-M15-B')]; final buffer 0, active flush False

### M16 20 alternating A/B records during a held flush

- merge: 22 records in 2 batches, max copies per marker 1, org mismatches vs marker 0, unattributed stored as ['unknown'], final buffer 0, active flush False
- parent: 22 records in 2 batches, max copies per marker 1, org mismatches vs marker 20, unattributed stored as ['unknown'], final buffer 0, active flush False

### M17 configuration

- merge: API_LOG_LEVEL=error stored [('qa2639-M17-error-at-error', 'qa2639-org-a')]; enableObservability=false {'inserts': 0, 'buffer': 0}; default keys [(['component', 'level', 'organizationId', 'teamId', 'tenantId'], 'qa2639-org-a', 'qa2639-team-a', 'qa2639-org-a')]; custom keys [(['component', 'level', 'tenantId'], 'qa2639-org-a', 'qa2639-team-a', 'qa2639-org-a')]
- parent: API_LOG_LEVEL=error stored [('qa2639-M17-error-at-error', 'unknown')]; enableObservability=false {'inserts': 0, 'buffer': 0}; default keys [(['component', 'level', 'organizationId', 'teamId', 'tenantId'], 'unknown', 'unknown', 'unknown')]; custom keys [(['component', 'level', 'tenantId'], None, None, 'unknown')]

### M18 correlation and schema

- merge: historical record unchanged True; `qa2639-M18-explicit` corr=qa2639-M18 synthetic=None exec=qa2639-exec session=qa2639-session org=qa2639-org-a tenant=qa2639-org-a dates=True; `qa2639-M18-no-correlation` corr=uuid synthetic=True exec=None session=None org=qa2639-org-a tenant=qa2639-org-a dates=True; `qa2639-M18-top-level` corr=qa2639-M18-top synthetic=None exec=None session=None org=qa2639-org-a tenant=qa2639-org-a dates=True
- parent: historical record unchanged True; `qa2639-M18-top-level` corr=qa2639-M18-top synthetic=None exec=None session=None org=qa2639-org-a tenant=qa2639-org-a dates=True; `qa2639-M18-explicit` corr=qa2639-M18 synthetic=None exec=qa2639-exec session=qa2639-session org=unknown tenant=unknown dates=True; `qa2639-M18-no-correlation` corr=uuid synthetic=True exec=None session=None org=unknown tenant=unknown dates=True
