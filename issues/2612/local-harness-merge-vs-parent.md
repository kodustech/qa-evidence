# #2612 local harness: GithubService.getPullRequestAuthors, merge f0dc2806b vs first parent 20ab741fe

Real method body of each version, real Octokit against github.com (read-only list calls, gh CLI token). Only stubbed: integration config lookup (returns the repositories below) and the logger. Run 2026-11-19.

Ground truth for kodustech/kodus-ai, counted independently with gh api --paginate: 379 PRs created in the last 60 days, 30 distinct authors; 15 of them have their newest PR past position 100.

## 1. kodus-ai only

| | merge f0dc2806b | first parent 20ab741fe |
|---|---|---|
| authors | 30 | 15 |
| threw | - | - |
| requests | /repos/kodustech/kodus-ai/pulls?…, /repositories/956679248/pulls?…&page=2, /repositories/956679248/pulls?…&page=3, /repositories/956679248/pulls?…&page=4 | /repos/kodustech/kodus-ai/pulls |
| error logs | - | - |
| warn logs | - | - |

## 2. kodus-ai + a repository that does not exist (404), requireLoaded

| | merge f0dc2806b | first parent 20ab741fe |
|---|---|---|
| authors | 30 | 15 |
| threw | - | - |
| requests | /repos/kodustech/kodus-ai/pulls?…, /repos/kodustech/qa-2612-repo-does-not-exist/pulls?…, /repositories/956679248/pulls?…&page=2, /repositories/956679248/pulls?…&page=3, /repositories/956679248/pulls?…&page=4 | /repos/kodustech/kodus-ai/pulls, /repos/kodustech/qa-2612-repo-does-not-exist/pulls |
| error logs | - | Error in getPullRequestAuthors |
| warn logs | Repository not visible to the credential; listed with no pull request authors | - |

## 3. kodus-ai with page 2 forced to HTTP 502 (Octokit hook), requireLoaded

| | merge f0dc2806b | first parent 20ab741fe |
|---|---|---|
| authors | - | 15 |
| threw | Could not list pull request authors for 1 of the configured GitHub repositories | - |
| requests | /repos/kodustech/kodus-ai/pulls?… | /repos/kodustech/kodus-ai/pulls |
| error logs | Could not list the pull request authors of a repository | - |
| warn logs | - | - |

## 4. same failure, without requireLoaded

| | merge f0dc2806b | first parent 20ab741fe |
|---|---|---|
| authors | 15 | 15 |
| threw | - | - |
| requests | /repos/kodustech/kodus-ai/pulls?… | /repos/kodustech/kodus-ai/pulls |
| error logs | Could not list the pull request authors of a repository | - |
| warn logs | - | - |

First parent misses (scenario 1): 27Bslash6, alexurpi, Christian-Sidak, felipeggv, felixmr1, gtupak, JoshLogan235, luc-pimentel, MatheusMartinho, Mohil-Ahuja, Nalu-devs, PeterDaveHello, rostik1t, shehjaddev, zerone0x.

Merge misses (scenario 1): none.

Note: on the first parent requireLoaded does not exist yet, so scenarios 3-4 never request page 2 there.
