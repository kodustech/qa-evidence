# #2004 — review every repository, including ones created later (QA)

- Env: qa.kodus.io (contains #2442). Providers covered: **Bitbucket Cloud** (2026-11-14, below) and **Azure Repos** (2026-11-13, summary at the end). DeepSeek V4.1 Flash @ Fireworks.
- Not run on GitHub and GitLab: the QA credentials there see repositories outside the test set (GitHub: 173 repositories of the official org; GitLab: projects of other groups), and turning this on adds webhooks, AST builds and backfills to every one of them.

## Bitbucket Cloud (team `bitbucket@kodus.io`)
| # | Case | Result |
|---|---|---|
| 1 | Count before turning it on | `GET …/repository-selection/preview`: `visible 12, eligible 11, alreadySelected 3, toAdd 8, skipped {archived: 0, forksAndMirrors: 1}` (the fork is `qa2004-fork` of `qa2004-base`; Bitbucket has no archive) |
| 2 | Turn on + first sync | `PUT mode=all` 18:23:29 → `sync {status: done, added: 8/8, trigger: enable, skipped forks 1}` in 6 s. REPOSITORIES grows 3 → 11 (one of them, `company`, lives in a second workspace the credential sees). Fork not added, no hook on it. QA webhook created on repos that had none; repos that already had it kept one. |
| 3 | Repo created after | `qa2004-new-bb` created 18:24 → added by the 18:30 cron (`trigger: cron, added 1`, log `Repository sync finished for team`), QA webhook created, `repositories` row with `integration_config_id` = the team's REPOSITORIES config. PR [#1](https://bitbucket.org/kodustech/qa2004-new-bb/pull-requests/1) reviewed (off-by-one comment). |
| 6 | Exclusion survives sync | `qa2004-base` with Automated code review off: PR [#1](https://bitbucket.org/kodustech/qa2004-base/pull-requests/1) skipped `Automated Review is disabled`; still off after the 18:40 cron; `@kody start-review` reviewed it. |
| 7 | Removal refused in `all` | `POST /code-management/repositories {type: replace}` without one repo → 400 `This team reviews every repository automatically, so repositories cannot be removed. Turn off automated review for the repository instead.`; log `Rejected a repository removal while the team reviews all repositories`. |
| 11 | Idempotent cron | 18:40 cron `added 0, total 0`; exactly one QA webhook per repository. |
| 9 | Turn off | `PUT mode=manual` 18:42; `qa2004-after-off` created right after is not added by the 18:50 cron; no `Repository sync finished for team` for the team after the switch. |

AST: rows for the new repositories show `ast_graph_status: failed` for the small/empty ones (`qa2004-base`, `qa2004-new-bb`, `kody-1946-replies` empty, `rules-example`, `company`), `ready` for `todo-api-test`.

Restored after the run: mode manual, `repository_selection` / `repository_sync_state` / `webhook_creation_failures` rows deleted, REPOSITORIES list back to the 3 original repos, the 6 new `repositories` rows deleted, the 5 webhooks the sync created deleted (including the one on `sartorijr92/company`). Test repos `qa2004-*` kept.

## Azure Repos (2026-11-13)
Preview 5 visible / 4 to add; `mode=all` → added 4/4 with QA subscriptions on all 5 repos; new repo `qa-2004-new` added by the next cron with subscriptions, its PR reviewed; repo with automated review off kept off after the sync and its PR skipped. Restored the same way.

## Not covered
GitHub (token and App events), GitLab, forks/mirrors included, seat gate on automated-off repos (orgs are trial), 429/403 handling, Bitbucket Data Center and Forgejo.
