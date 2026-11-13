# #2534 — QA runs (QA `homolog`, includes #2535; 2026-11-12/13)

## 1. Hold reason when a commit lands during the review

`kodustech/poison_store`, label-based conditional approval switched on for the run (`pullRequestApprovalActive: true`, `approvalLabels: ["qa-2534-approve"]`; org on the beta track). Config restored afterwards: original row reactivated, identical to its backup.

- PR 422 opened 03:14:46 UTC (`32ac1183`); second commit `275e31db` pushed at 03:15:11 while Kody reviewed the first.
- `automation_execution` b4b69b42 (`success`, reviewed `32ac1183`): `approvalDecision = { kind: "hold", reason: "A newer commit arrived while Kody reviewed this one; Kody decides on the next reviewed commit." }`.
- Reason comment on the PR (03:16:56): **Automatic approval held** — same text.

## 3. One reason comment per PR

Approval cron runs at 03:16, 03:20, 03:24, 03:28 UTC: PR 422 still has exactly one `kodus-conditional-approval` comment (created 03:16:56, never re-posted). No `bounded timeout` log in the window.

## 2. Area-map backoff on repositories that cannot be listed

`codeAreaHistorySync` on QA: one org whose GitHub App cannot list 6 repositories.

| Run (UTC) | `Could not refresh code-area history batch` logs | `listingFailures` / `retryAfter` |
|---|---|---|
| every 2h on 2026-11-11 → 2026-11-12 00:00 | 6 per run | — |
| 2026-11-12 02:00, 06:00 (after #2535) | 0 | 2 → 3; `retryAfter` 06:00 + 8h − 10 min = 13:50 (2h → 4h → 8h) |
| after 13:50 | 0 | unchanged (not retried) |

The org has not been picked by the cron since then; the cron only takes orgs that pass the conditional-approval access check (beta + Teams/Enterprise license). Why this org fails it now was not verified, so retry after the deadline and the "listing recovered" log were not observed.

Not observed in QA: base-moved / unreadable-labels / unreadable-PR hold texts, and the per-installation write queue (covered by the PR's specs).
