# #2521 — worker event loop on large PRs and Kody Rules field updates (QA)

- Env: qa.kodus.io (deploy `2eca9610`, contains #2519), org poison, `kodustech/poison_store`, default ignore list (1,109 patterns). 2026-11-14 18:50–19:20 UTC.

## Large PR (glob filter)
- [#424](https://github.com/kodustech/poison_store/pull/424): 2,205 new `src/qa2521/fNNNN.ts` files. Retriggered at 19:15:31 UTC (empty commit).
- `automation_execution`: `skipped`, `Too Many Files — Reduce PR size for better review quality (Count: 2205, Limit: 2000)`; log `Skipping code review for PR#424 - Too Many Files …` at 19:16:35.
- `Stage 'FetchChangedFilesStage' completed in 3477ms` (includes the paginated file listing).
- `Event loop delay max=…` lines 19:15:20–19:21:00 (17 lines, all worker/API monitors): highest **3,467 ms** (19:16:51, the run's minute); the rest ≤ 109 ms. Prod before the fix: 67–68 s for 2,371 files. Same picture on 2026-11-13 (max 3,945 ms, stage 3.9 s).

## Kody Rules: only the rule's own fields change
- Snapshot of the org's 11 rules (`db.kodyRules`), then a new rule "Do not call console.log in TypeScript files." (`**/*.ts`).
- New rule after processing: `compileAttempt {outcome: declined, sourceHash: 0612f798…, attemptedAt: 19:00:31}`, `detector: null`; logs `KodyRule successfully processed with Context OS` and `Rule 420a2749… stays semantic (no-usable-examples)`. The 11 other rules are byte-identical to the snapshot.
- Edit title/text: both persisted (`QA 2521: no console.log or console.debug` / "…use the project logger."), `compileAttempt.sourceHash` → `c824510d…` (recompiled 19:04:51), the other 11 rules still identical.

## Regression
- Normal reviews completed on GitHub, GitLab, Bitbucket and Azure throughout the day (e.g. #2335, #2385, #2400 runs) with no new auth/integration errors.

## Not covered
- The GitHub rate-limit gate: it needs the installation's core bucket exhausted; `GitHub rate limit open for this installation…` has 0 occurrences in QA since 2026-11-11. Covered by `github.service.content-rate-limit.spec.ts`.
- Health-check kill/CPU (no ECS access); Kody Rules at production scale.
