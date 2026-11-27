# #2639 retest: pending live checks (read-only, QA Mongo `kodus_db.observability_logs_ts`)

Both target logs fire only from crons whose next runs on QA fall after this retest. Not passed yet.

## R7: Kody Learning cron, 2026-11-28 03:00Z

```js
db.observability_logs_ts.find(
  { component: 'KodyLearningCronProvider', level: 'error',
    timestamp: { $gte: ISODate('2026-11-28T03:00:00Z'), $lt: ISODate('2026-11-28T03:40:00Z') } },
  { message: 1, 'metadata.organizationId': 1, 'metadata.teamId': 1, 'metadata.tenantId': 1, tenantId: 1,
    'attributes.params': 1, 'attributes.organizationId': 1, 'error.message': 1 })
```

Pass: every `Error generating kody rules` row has `metadata.organizationId == attributes.params.organizationId`,
`metadata.teamId == attributes.params.teamId`, `metadata.tenantId == tenantId == organizationId` (baseline 2026-11-27 03:00Z: 19 of 19 `unknown`,
`baseline-kodylearning-2026-11-27T0300.json`). Any `Platform configs not found` / `Kody learning stuck and exhausted retries` row has an organization.
`Code review config not found` / `No repositories found` stay attributed.

## R8: feedback sync cron, 2026-11-28 09:00Z

```js
db.observability_logs_ts.find(
  { component: 'SaveCodeReviewFeedbackUseCase', level: 'error',
    timestamp: { $gte: ISODate('2026-11-28T09:00:00Z'), $lt: ISODate('2026-11-28T10:00:00Z') } },
  { message: 1, 'metadata.organizationId': 1, 'metadata.teamId': 1, 'metadata.tenantId': 1, tenantId: 1,
    'attributes.payload.organizationId': 1, 'attributes.payload.teamId': 1, 'error.name': 1 })
```

Pass: every `Error save code review feedback` row has `metadata.organizationId == attributes.payload.organizationId` and
`metadata.teamId == attributes.payload.teamId` (baseline 2026-11-26 09:00Z: 6 of 6 `unknown`, all `ReactionSyncAbortedError`,
`baseline-feedback-2026-11-26T0900.json`). 0 rows = not exercised live (the only source org was not rate-limited on 2026-11-27).

Each query takes ~60 s; run with a 120 s timeout.
