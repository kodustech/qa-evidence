# #2343 heavy mode: QA runs (qa on 5e886f252, 2026-11-05 UTC)

Fixture: `billing/` (5 files: HMAC compare with `===`, fallback secret, missing `await`, page offset, metric name mismatch, log of request headers, stack in response, a test that does not verify, a flag comment that says the opposite). Same files on every platform.

Finder runs = `code-review-generalist` spans in `observability_telemetry` (generalist + synthesis rescue + one per lens).

| # | Where | Trigger | Plan | `heavy` on PR | Route | Finder runs | Model | Wall time |
|---|---|---|---|---|---|---|---|---|
| 1 | GitHub poison_store#396 | PR open | trial | false | codeReview | 2 | Sonnet 4.5 (BYOK) | 4m14 |
| 2 | GitLab kodex!48 | PR open | trial | false | codeReview | 2 | DeepSeek V4.1 Flash (managed) | 5m44 |
| 3 | Bitbucket artemis#33 | PR open | trial | false | codeReview | 2 | DeepSeek V4.1 Flash | 5m26 |
| 4 | Azure athena#185 | PR open | trial | false | codeReview | 2 | DeepSeek V4.1 Flash | 5m53 |
| 5 | GitHub #396 | `@kody review --heavy` | trial | true | codeReviewHeavy | 11 (10 start together) | Sonnet 4.5 | 5m39 |
| 6 | GitLab !48 | `@kody review --heavy` | trial | true | heavy | 11 | DeepSeek V4.1 Flash | 7m21 |
| 7 | Bitbucket #33 | `@kody review --heavy` | trial | true | heavy | 11 | DeepSeek V4.1 Flash | 11m03 (rescue pass 397 s) |
| 8 | Azure #185 | `@kody review --heavy` | trial | true | heavy | 11 | DeepSeek V4.1 Flash | 8m30 |
| 9 | GitHub #396 | `@kody review --balanced` | trial | false | codeReview | 2 | Sonnet 4.5 | 3m53 |
| 10 | GitHub #397 | PR open, repo Review mode = Heavy, Security off | trial | true | codeReviewHeavy | 9 (7 bug lenses) | Sonnet 4.5 | 5m43 |
| 11 | GitHub #396 | `--heavy`, Routing Heavy = Kimi K2.5, Security off | trial | true | codeReviewHeavy | 9 | Kimi K2.5 (whole pipeline) | 4m43 |
| 12 | CLI, poison_store branch | no flag, repo Review mode = Heavy | trial | — | codeReview | 2 | Sonnet 4.5 | 5m05 |
| 13 | CLI | `--balanced` | trial | — | codeReview | 2 | Sonnet 4.5 | 4m03 |
| 14 | CLI | `--heavy` | trial | — | codeReviewHeavy | 11 | Kimi K2.5 | 5m34 |
| 15 | CLI | `--fast --heavy` | trial | — | codeReview | 1 (fast) | Sonnet 4.5 | 2m55 |
| 16 | CLI | no flag, global Review mode = Heavy | trial | — | codeReviewHeavy | 11 | Kimi K2.5 | 6m30 |
| 17 | GitHub #396 | `@kody review --heavy` | free_byok | false | codeReview | 2 | Sonnet 4.5 | 3m02 + plan notice posted |
| 18 | CLI | `--heavy` | free_byok | — | codeReview | — | Sonnet 4.5 | notice printed |
| 19 | Settings API | save `reviewMode: heavy` | free_byok | — | — | — | — | 400, plan message |
| 20 | CLI, repo with unreachable remote | `--heavy` | trial | — | codeReviewHeavy | 10 | Kimi K2.5 | 5m26, `Running self-contained agent review (no sandbox available)` |

Logs seen: `Forcing full re-review for PR#N: heavy review asked after a balanced one` (and the reverse), `Heavy mode asked on a plan that is not Teams/Enterprise — the review runs Balanced`, `Refused a save asking for heavy review mode — plan is not Teams/Enterprise`.

## Directory and kodus-config.yml (added 2026-11-05 ~16:40 UTC)

| # | Where | Trigger | Setting | `heavy` on PR | Route | Finder runs |
|---|---|---|---|---|---|---|
| 21 | GitHub poison_store#398 | PR open | directory `/billing` Review mode = Heavy (repo and global Balanced) | true | codeReviewHeavy | 11 |
| 22 | CLI, same branch | no flag | same | — | codeReview | 2 |
| 23 | GitHub poison_store#399 | PR open | `kodus-config.yml` on main with `reviewMode: heavy`, file override on at repo | true | codeReviewHeavy | 11 |
| 24 | CLI, same branch | no flag | same | — | codeReview | 2 |

The directory, the file (main commits 38d61c0 add, 5763f44 remove) and the toggle were removed afterwards; the stored config is identical to the backup taken before.
