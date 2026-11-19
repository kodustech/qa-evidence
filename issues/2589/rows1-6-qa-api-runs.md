# #2589 rows 1, 3, 4 on QA (qa.api.kodus.io, backend at 0305249b, contains merge c96dd79fc)

## Row 1: empty results on read endpoints

**GET /team, owner with no active/pending team.** Fresh account `qa-2589-row1` (org e0f799e1). Its only team (9e7fe014) set to `inactive` in Postgres, then GET /team as the owner at 2026-11-19T21:43:58Z:

    GET /team -> 200 {"data": [], "statusCode": 200, "type": "Array"}

**GET /cli-reviews/:id, CLI execution with no code_review_execution.** Inserted a CLI `automation_execution` (25890001-0000-4000-8000-000000000001) in the PoisonIvy org, copied from an existing CLI row, with 0 `code_review_execution` rows (QA had none like that). GET at 2026-11-19T21:44:15Z:

    GET /cli-reviews/:id -> 200 {..., "timeline": []}

`ExceptionsFilter` records between 21:43:50Z and 21:44:30Z: 0. The inserted row was deleted afterwards.

## Row 3: concurrent logins of one user

24 logins of `qa-2589-row1`, three bursts of 8 in parallel, 21:49:15Z-21:49:21Z. All 24 returned 201. 4 distinct refresh tokens came back, so 20 logins signed a token identical to a twin's and hit `UQ_5fb5d6abb950a839551fe3c5de9`.

`observability_logs_ts`, 21:49:14Z-21:49:40Z (counts only):

| | count |
|---|---|
| AuthService warn "Refresh token already stored by a concurrent refresh of the same token" (organizationId set) | 20 |
| AuthService error "Failed to persist refresh token after login ..." | 0 |
| TypeORM "Query Execution Failed" on UQ_5fb5d6abb950a839551fe3c5de9 | 20 |
| ... whose `parameters` is a count string (`[N values]`) | 20 |
| ... whose `parameters` is an array of values | 0 |
| JWT-shaped strings in the AuthService or TypeORM records | 0 |

## Row 4: bound values in logs, QA-wide

See rows1-6-row4-qa-logs.json. TypeORM records, pre-fix window (2026-11-16 to 2026-11-18T19:00Z, before the first QA deploy containing the merge): 107, all with `parameters` as an array of values, 2 with JWT-shaped strings. Post-fix window (2026-11-18T21:00Z to now): 84, all `[N values]`, 0 JWT-shaped strings, 0 unredacted Postgres `Key (...)=(value)` details. No value was read into the output; the check counts types and patterns only.
