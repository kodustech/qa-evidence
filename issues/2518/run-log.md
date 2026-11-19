# QA run log, issue #2518 (monthly auto top-up limit)

Environment: qa.web.kodus.io + QA billing (kodus-service-billing `93835ed`, deploy job 2026-11-19 17:26 UTC; migration `AddAutoTopUpMonthlyLimit1794322000000` present in `billing.migrations`).
Fresh org `qa-2518-wallet` (Kodus provider, DeepSeek V4.1 Flash), Stripe test mode. Auto top-up: add $20 when below $5.
To reach the threshold without spending credits on reviews, `billing.organization_licenses.creditBalanceUsd` was set to 0 directly; the 5-minute sweep (`resumeCappedWallets`) then did the rest.

## Ledger (`billing.credit_ledger_entries`, organization of the test org)

| createdAt (UTC) | type | amount | metadata.auto | attempt key | how it got there |
|---|---|---|---|---|---|
| 2026-11-19 20:15:59 | purchase | 20 | - | - | manual Checkout (also saved the card) |
| 2026-11-19 20:20:01 | purchase | 20 | true | auto-topup:v2:…:1795119600398 | sweep, limit $40, balance 0 (later backdated to 2026-10-31 23:59:59.999) |
| 2026-11-19 20:25:00 | purchase | 20 | true | auto-topup:v2:…:1795119900150 | sweep, limit $40 now used (later backdated to 2026-11-01 00:00:00) |
| — | — | — | — | — | balance 0 + lastAt null at 21:16:16; sweeps 21:20 + (none) → **no entry, lastAt stayed null, no key minted** |
| 2026-11-19 21:25:01 | purchase | 20 | true | auto-topup:v2:…:1795123500198 | limit raised 40→60 in the UI at 21:23 with balance 0 → next sweep resumed |
| 2026-11-19 21:30:01 | purchase | 20 | true | auto-topup:v2:…:1795123800325 | after backdating: month = $40 (Nov 1 00:00 counted, Oct 31 23:59:59.999 not), balance 0 → resumed |
| 2026-11-19 21:35:35 | purchase | 20 | - | - | manual Checkout while blocked at $60/$60; month stayed $60 |

`billing.credit_auto_topup_reservations` was empty after every settled purchase (released atomically with the ledger insert).

## Pending reservation (simulated legacy unresolved charge)

Set `creditAutoTopUpAttemptKey = auto-topup:v2:…:qa2518-simulated-unresolved`, `creditAutoTopUpAttemptRequest = null`, inserted a $20 reservation with the same key; balance kept at $20 (> $5 threshold) so no sweep could try to charge it.

- UI: "This month: $60 added automatically · $20 pending · limit $60".
- Limit 80 saved: remaining = 80 − 60 − 20 = 0 < $20 pack → "Monthly limit blocks the next auto top-up".
- Amount $20 → $50: toast "Previous top-up pending — Resolve the previous charge before changing its amount or card"; amount stayed $20 in DB.
- Remove card: same warning; card, key and reservation unchanged.
- Auto top-up off → on (same amount): both succeed; key and reservation still present.
- Cleanup: reservation deleted, key nulled.

## Billing tests at merge `93835ed` (local, disposable Postgres 17, Stripe mocked)

`pnpm run test:credits:integration`: 22/22 passed, including
- serializes concurrent reservations and counts one replay only once
- concurrent delivery of the same attempt credits and counts it only once
- holds an unknown charge across retries, settings changes and a later successful replay
- resolves the reserved request after amount / card / detach changes without orphaning capacity
- resumes after the monthly reset without needing a new debit, even with concurrent sweeps
- releases capacity only for definitive failures

`jest AutoTopUpService.spec CreditService.spec cron/index.spec`: 76/76 passed.
