# #2619 local harness: maxTimeMS sent per read, merge vs first parent

Real repository classes from kodus-ai, local MongoDB 8.0 (docker, enableTestCommands). The driver command monitor records the maxTimeMS of each command; then the mongod failpoint maxTimeAlwaysTimeOut (it only affects commands that carry maxTimeMS) shows whether the server can cut the read.

Merge 23ca5866c vs first parent 077af498f. Harness: qa2619.harness.spec.ts (same folder).

| Read | parent maxTimeMS | parent under failpoint | merge maxTimeMS | merge under failpoint |
|---|---|---|---|---|
| issues.count | [None] | completed (no server-side bound) | [50000] | cut by server: 50 MaxTimeMSExpired |
| ruleLikes.countByRule | [None] | completed (no server-side bound) | [50000] | cut by server: 50 MaxTimeMSExpired |
| kodyRules.findById | [None] | completed (no server-side bound) | [50000] | cut by server: 50 MaxTimeMSExpired |
| tokenUsage.getModelCredentialPairs | [50000] | cut by server: 50 MaxTimeMSExpired | [50000] | cut by server: 50 MaxTimeMSExpired |
| pullRequests.findSuggestionsByRuleId | [None, None] | completed (no server-side bound) | [50000, 50000] | cut by server: 50 MaxTimeMSExpired |
| pullRequests.findByOrganizationAndRepositoryWithStatusAndSyncedFlag (cursor) | [None] | completed (no server-side bound) | [300000] | cut by server: 50 MaxTimeMSExpired |
| pullRequests.countByAuthor(limit 2) | [] | completed (no server-side bound) | [50000] | cut by server: 50 MaxTimeMSExpired |

countByAuthor(limit 2) over 3 seeded PRs of one author returned 2 at merge (method absent at parent).
tokenUsage.getModelCredentialPairs already carried 50 s at the parent; the PR changes its match, not its bound.

PR real-MongoDB integration specs at merge, same local server: mongo-conversation-store.ttl.integration.spec.ts + tokenUsage.credential-pairs.integration.spec.ts: 2 suites, 4 tests passed. Touched unit specs: 14 suites, 281 tests passed.
