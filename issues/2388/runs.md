# #2388 — KODUS_LIST_KODY_ISSUES with a Team CLI key (QA)

- Env: qa.kodus.io (contains #2395 `fb84af7f6`), org poison@kodus.io, team `Poison Ivy - team`. 2026-11-14 ~13:32 UTC.
- A Team CLI key `qa-2388` was created for the run (`POST /teams/{teamId}/cli-keys`) and revoked at the end. Calls: `POST /mcp`, `tools/call` `KODUS_LIST_KODY_ISSUES`, key masked.
- Mongo `kodus_db.issues` for the org: 80 documents, all in `poison_store` (59 open); `severity: high` + `label: kody_rules` in poison_store = 7; documents carrying `teamId` (whole collection) = 0.

| # | Arguments | HTTP | Result | Expected |
|---|---|---|---|---|
| 1 | `{organizationId}` (Bearer) | 200 | `success: true, count: 80` | = Mongo 80 |
| 1b | same, `x-team-key` header | 200 | `count: 80` | same |
| 2 | `+ repositoryName: poison_store` | 200 | `count: 80`, all `poison_store` | = Mongo 80 |
| 3 | `+ severity: high, label: kody_rules` | 200 | `count: 7`, only high / kody_rules | = Mongo 7 |
| 4 | `+ teamId: <the key's team>` | 200 | `count: 80` | teamId is not a filter |
| 5 | `+ teamId: <random uuid>` | 200 | `count: 80` (same org data) | plan expected `Team not found`; see note |
| 6 | `organizationId: <bitbucket@ org>` | 200 | `isError: true`, `organizationId does not match the credential` | rejected, no data |
| 7a | revoked key | 401 | `Invalid or revoked team API key` | 401 |
| 7b | no key | 401 | `Team API key required` | 401 |
| 8 | `repositoryName: nao-existe-qa` | 200 | `success: true, count: 0, data: []` | empty |

Note on #5: the tool's input schema declares no `teamId` (unchanged by #2395, same at `fb84af7f6^`), so the MCP layer drops the argument before `McpToolAuthorizer.ensureTeam` sees it. The response holds only the key's own organization's issues (issues carry no team), so nothing outside the credential's tenant is returned. Not caused by this PR.
