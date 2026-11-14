# #2549 — custom-agent findings quoting CLAUDE.md / AGENTS.md (QA)

- Env: qa.kodus.io (contains #2543), 2026-11-14 13:58–14:38 UTC. Model: DeepSeek V4.1 Flash @ Fireworks (BYOK / trial default), effort medium.
- Setup per repo: `CLAUDE.md` on the default branch ("Controllers never compute prices or discounts; pricing lives in PricingService."), Review scope → Coding-agent instructions on, Blank custom agent `qa-conventions` ("Enforce the repository's conventions. Quote the rule you rely on.", no skill/doc linked, enabled, `**/*`).
- Repos: GitHub `kodustech/poison_store`, GitLab `sartorijr/kodex`, Bitbucket `kodustech/artemis`, Azure `Kodus QA/athena`.
- GitLab note: the kodex org uses centralized config, which does not carry `customAgents` (the agent never ran on MR !52). Centralized config was switched off for the run and restored after; not related to #2543.

## Results (Mongo `pullRequests.files.suggestions`, `observability_logs_ts`)

| # | Case | Provider / PR | Result |
|---|---|---|---|
| 1 | Rule violated, categories on | GitHub [#425](https://github.com/kodustech/poison_store/pull/425) | `qa-conventions` sent, `source.file: CLAUDE.md`; `[repo-instructions] PR#425: indexed=6 listed=5 dropped=0` |
| 1 | | GitLab [!53](https://gitlab.com/sartorijr/kodex/-/merge_requests/53) | sent, `CLAUDE.md`; `listed=1 dropped=0` |
| 1 | | Bitbucket [#37](https://bitbucket.org/kodustech/artemis/pull-requests/37) | sent, `CLAUDE.md`; `listed=1 dropped=0` |
| 1 | | Azure [190](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/190) | sent, posted with "**Rule** (`CLAUDE.md`)"; `listed=1 dropped=0` |
| 2 | Bug/Security/Performance off, only the agent | GitHub [#426](https://github.com/kodustech/poison_store/pull/426), GitLab [!54](https://gitlab.com/sartorijr/kodex/-/merge_requests/54), Bitbucket [#39](https://bitbucket.org/kodustech/artemis/pull-requests/39), Azure [191](https://dev.azure.com/kodus/Kodus%20QA/_git/athena/pullrequest/191) | all 4: `[repo-instructions] PR#n: … listed=≥1` (no skip) and `qa-conventions` sent citing `CLAUDE.md` |
| 3 | Nested `src/billing/AGENTS.md` | GitHub [#427](https://github.com/kodustech/poison_store/pull/427) | sent, `source.file: src/billing/AGENTS.md`; `listed=6` |
| 4 | Control (controller calls `pricingService.quote`) | GitHub [#428](https://github.com/kodustech/poison_store/pull/428) | no `qa-conventions` comment posted |
| 5 | Coding-agent instructions off | GitHub [#429](https://github.com/kodustech/poison_store/pull/429) | agent finding `not_sent`, `discardReason: "CLAUDE.md is not a guide linked to this review"` |
| 6 | Agent off + categories off | GitHub [#430](https://github.com/kodustech/poison_store/pull/430) | `[repo-instructions] skipped for PR#430: bug, security and performance are all off and no custom agent runs, so no agent reads them` |

Also seen (expected): agent findings citing `.rules/documentation_controller.txt` (not an instruction file) dropped with `… is not a guide linked to this review` (#426, #428).

Observations outside #2543:
- Azure 190: the generalist's own `repo_instruction` finding (separate check) was dropped with "The quoted instruction is not in the target-branch instruction files." while the custom agent's quote of the same rule passed.
- Centralized config sync drops `customAgents` from the repository config (`libs/centralized-config` has no handling for it).

Restored: repo configs (instructions off, categories on, no agents; artemis `kodusConfigFileOverridesWebPreferences` back on), `CLAUDE.md`/`AGENTS.md` removed from the default branches, GitLab centralized config re-enabled and its file reverted. Test PRs closed.
