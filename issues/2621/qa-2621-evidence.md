# QA #2621 / PR #2607: pair reads and analytics reads

Merge `ea6a809c6`, first parent `875b0c720`. QA backend restarts 2026-11-21 15:12:51 and 15:13:03 UTC (images built 15:11). Org ids shortened to letters.

## 1. Explain on QA `pullRequests` (read-only, `maxTimeMS` 30 s)

Org A: QA org with 192 PR numbers repeated across up to 4 repositories. Each number asked in one repository; it exists in 2 to 3.

| shape | pairs asked | docs examined | returned | OR stage | index |
|---|---|---|---|---|---|
| parent counts / approval page: one `$or` branch per pair | 12 | 12 | 12 | yes | unique |
| parent PR list: `$in` numbers x `$in` repositories | 12 | 34 | 34 | no | unique |
| **merge: one read per repository, `number $in` + `repository.id` eq** (3 reads) | 12 | 12 | 12 | no | unique |
| parent `$or`, 100 pairs | 100 | 100 | 100 | yes | unique |
| parent `$in` x `$in`, 100 pairs | 100 | 103 | 103 | no | idx_org_title_repo_number |
| **merge per repository, 100 pairs** (2 reads) | 100 | 100 | 100 | no | unique for 97 numbers; token-usage index for a repository whose 3 PRs were all asked (4 keys, 3 docs) |

Approval-cron delivered-suggestions read (status `open`), org B, whose open PR numbers repeat in other repositories, 30 pairs:

| version | docs examined | PRs returned | PRs from repositories not asked | OR | index |
|---|---|---|---|---|---|
| parent (numbers only) | 111 | 55 | 33 | no | idx_org_status_merged_openedAt_for_awaiting |
| **merge (pairs, per repository)** | 30 | 22 | 0 | no | number_1_repository.id_1_organizationId_1 |

## 2. The approval cron runs the new read on QA after the restart

`$currentOp` (allUsers:false), polled through the 16:00 UTC cron tick, caught this `aggregate` on `pullRequests` from appName `kodus-api` at 2026-11-21T16:00:03.729Z:

```json
{"organizationId": "<org C>", "number": {"$in": "[82 numbers]"}, "repository.id": "<one repository>", "status": "open"}
```
No `$or` and the repository pinned: the shape of `findPullRequestsWithDeliveredSuggestions` with `pullRequestRefs` (`libs/platformData/infrastructure/adapters/repositories/pullRequests.repository.ts:1998`). The parent sent `{organizationId, number: {$in}, status}`.

Explain of that same read: parent shape 168 docs examined via `idx_org_status_merged_openedAt_for_awaiting`; merge 82 docs (= numbers asked) via `number_1_repository.id_1_organizationId_1`; same PRs returned (2).

`Open pull requests found` (`attributes.openPullRequests`) per team, 14:50-15:10 vs 15:35-15:55 UTC: identical for the 7 teams with open PRs.

## 3. Before/after on the same QA data (local harness, read-only)

A jest harness built `PullRequestsRepository` and `GetCustomAgentsStatusUseCase` at each commit on a Mongoose connection to QA `kodus_db` (`autoIndex:false`, `autoCreate:false`, reads only) and ran the same inputs at the same time. Arrays whose order Mongo does not fix are sorted before comparing.

| case | pairs | PR list | suggestion counts | delivered, raw (parent -> merge) | delivered after the cron key filter | approval without suggestions |
|---|---|---|---|---|---|---|
| QA account, PR list page | 82 | identical | identical | 0 -> 0 | identical (0) | identical (0) |
| org B, open PRs with twins | 57 | identical | identical | 82 -> 48 | identical (48) | identical (9) |
| org A, crossing pairs | 12 | identical | identical | 0 -> 0 | identical (0) | identical (0) |
| org A, 100 recent (closed) | 100 | identical | identical | 43 -> 41 | identical (41) | identical (54) |
| org C, the caught cron read | 82 | identical | identical | 2 -> 2 | identical (2) | identical (3) |

Custom agents status, the 7 repositories with custom-agent findings in the last 30 days: identical in all 7 (15 agents). The QA endpoint `GET /code-review/custom-agents/status` for the QA account matches the harness (plus `risk-auditor`, known only from the run log, which the harness does not read). `GET /pull-requests/executions` on QA returned 100 rows; every `suggestionsCount` equals the harness output.

## 4. Real-MongoDB and replica-set specs (local docker, 2-member replica set, member 2 tagged `workload=analytics`)

| spec | merge | first parent |
|---|---|---|
| counts suggestions for the pairs asked, not for a same-numbered PR elsewhere | passed | passed |
| reaches the pairs through the unique index, without an OR plan | passed | failed |
| reads delivered suggestions only for the pairs given | passed | failed |
| still reads every repository when the caller names none | passed | passed |
| finds PRs with no delivered suggestion for the exact pairs asked | passed | passed |
| returns nothing for pairs whose numbers and repositories cross into one never asked | passed | passed |
| reads only the pairs asked for the suggestion counts | passed | passed |
| reads only the pairs asked for the PR list | passed | failed |
| reads only the pairs asked for the delivered suggestions | passed | failed |
| reads only the pairs asked for the approval cron | passed | passed |
| puts the analytics tag first and any secondary after it | passed | passed |
| sends token usage reads to the analytics member | passed | failed |
| applies to Mongoose queries, aggregations and the native driver alike | passed | passed |
| brings every file field the warehouse writes, and no patch | passed | failed |
| counts each agent's PRs, posted and dropped findings, and cited guides | passed | passed |

Parent failures: the OR plan; `A:2` and `B:1` returned for pairs never asked; 4 documents examined instead of 2; token usage served by the primary (27101) instead of the tagged member (27102); `patch` present in the ingestion projection. The custom-agents counts spec passes on both: the numbers did not change.
