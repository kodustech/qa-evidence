# #2639: `params.organizationId` (flat) still stored as "unknown" after the deploy

Read-only query on QA `observability_logs_ts`, window 2026-11-23T18:13Z (backend restart) → 2026-11-25T00:00Z, `metadata.level = error`, `component = KodyLearningCronProvider`, `message = "Error generating kody rules"`: 15 rows, all with `metadata.organizationId = "unknown"`, `teamId = "unknown"`, while `attributes.params.organizationId` and `attributes.params.teamId` are set.

Sample (org/team ids masked; they belong to an org outside the QA slots):

```json
{
  "timestamp": "2026-11-24T03:00:02.510Z",
  "message": "Error generating kody rules",
  "component": "KodyLearningCronProvider",
  "metadata": { "component": "KodyLearningCronProvider", "organizationId": "unknown", "teamId": "unknown" },
  "attributes": { "params": { "organizationId": "<org uuid>", "teamId": "<team uuid>" } }
}
```

Log site: `apps/api/src/cron/kodyLearning.cron.ts:474-482` logs `metadata: { params: { organizationId, teamId } }`; the exporter change reads only `params.organizationAndTeamData`.
