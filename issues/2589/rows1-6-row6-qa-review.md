# #2589 row 6 on QA: a symbol-references rule on a hunk that defines no symbol

QA backend at 0305249b (contains merge c96dd79fc). PoisonIvy org, BYOK DeepSeek V4.1 Flash (Fireworks), repository kodustech/poison_store.

1. Created repo rule c724ba53 "QA-2589 Do not duplicate an existing repository helper" (POST /kody-rules/create-or-update, app/**/*.rb). The compiler classified it `contextNeed.need = "symbol-references"` (2026-11-19T21:59:50Z).
2. Opened https://github.com/kodustech/poison_store/pull/497. Its only hunk adds three top-level statements to `app/controllers/patient_prescriptions_controller.rb` at line 1 (header context empty, no def/class in the hunk), re-implementing `DateFormatter#format_date` inline:

```diff
@@ -1,3 +1,6 @@
+# Date printed on the prescriptions CSV export header
+PRESCRIPTIONS_EXPORT_DATE = Date.current
+PRESCRIPTIONS_EXPORT_LABEL = PRESCRIPTIONS_EXPORT_DATE.nil? ? '-' : PRESCRIPTIONS_EXPORT_DATE.strftime('%d/%m/%Y')
 require 'csv'
```

3. The same patch through `retrieveForShard` locally (qa2589/row6-real-hunk.harness.spec.ts):
   - d5526275e (first parent): warn "[rule-context] could not retrieve symbol-references for app/controllers/patient_prescriptions_controller.rb; the rules that need it will not be judged: the hunk defines no symbol to search the repository for", unmet = [rule].
   - c96dd79fc (merge): no warn, unmet = [].

## Result on QA (execution c6a8542d, 22:01:46Z-22:04:12Z, status success)

KodyRulesShardedAgent logs for PR#497: no `[rule-context]` record; "done for PR#497: 1 suggestions (1 confirmed across 1 shards ...)".

Kody posted the rule's finding on line 3: https://github.com/kodustech/poison_store/pull/497#discussion_r4635716367
"Export label re-implements date formatting instead of reusing the repo helper ... Kody rule violation: QA-2589 Do not duplicate an existing repository helper".

Before the fix, this rule would have been skipped on this hunk (step 3), which is the production `[rule-context] ... the hunk defines no symbol` warning. On QA the `[rule-context]` warning never appeared in either window (no symbol-references rule existed in QA before this test).
