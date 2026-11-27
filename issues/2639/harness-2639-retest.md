# #2639 retest harness (PR #2750): merge `666ed9407` vs first parent `3c800a052`

Real `SimpleLogger`, real `deepSanitize`, real `MongoDBExporter` (only `collections.logs.insertMany` faked), real producers:
`KodyLearningCronProvider.handleCron()` (team / parameters / lock services stubbed) with the real `GenerateKodyRulesUseCase`
whose PR listing returns `null` (the cause of 17 of the 19 QA rows on 2026-11-27: `ServiceUnavailableException`
"Could not fetch pull requests from the code management integration; no rules were generated"), and the real
`SaveCodeReviewFeedbackUseCase` with a real `ReactionSyncAbortedError` built like `get-reactions.use-case.ts` builds it.
Same spec file at both revisions: [qa2639r-harness.spec.ts](qa2639r-harness.spec.ts).

| case | merge | parent |
|---|---|---|
| R1 cron catch "Error generating kody rules" (real use case / execute rejects / findByKey throws) | org, team, tenant, top tenant = O1/T1/O1/O1 (3 of 3) | `unknown` x4 (3 of 3) |
| R2 "Error save code review feedback" (ReactionSyncAbortedError / listing failure) | O2/T2/O2/O2, rethrows `ReactionSyncAbortedError` / `Error` | `unknown`, same rethrow |
| R3 "Platform configs not found", "stuck and exhausted retries" | O1/T1 | org `unknown`, team T1 |
| R6 precedence (13 cases + clean pair after each) | all as expected, 13/13 clean pairs correct | (a)(b)(f)(h)(j)(k) `unknown` |
| R6b teamId-only, no org anywhere: (l) `params.organizationAndTeamData = {teamId}`, (m) top `{teamId}`, (n) flat `params.teamId`, (o) flat `payload.teamId` | org `unknown`, team kept in all 4 (TL/TM/TN/TO) | (l)(m) team kept, (n)(o) team `unknown`: the fix never stores less than the parent |
| R13 flat payload with token/password | org O2, both `[REDACTED]`, literals absent | org `unknown` (redaction same) |

Results: [h-merge.json](h-merge.json) (7/7 pass), [h-parent.json](h-parent.json) (7/7 fail).
PR specs: [r4-summary.txt](r4-summary.txt) (merge 19/19 + 4/4; transplanted onto parent 14/19 + 2/4, the new cases fail).

Mutants on the merge exporter ([mutants-clean.json](mutants-clean.json)), each reverted after:

| mutant | killed by |
|---|---|
| MA drop flat `ctx?.params` | R1, R1b, R6 |
| MB drop flat `ctx?.payload` | R2, R6, R13 |
| MC first object wins | R6 (a) `unknown`/TA, (b) `unknown` |
| MD `ctx?.payload` before the top pair | R6 (c) B/TB instead of A/TA |
| ME teamId-only fallback removed (`mongodb-exporter.ts:1094-1097`) | R6b: (l)(m)(n)(o) team `unknown` |
