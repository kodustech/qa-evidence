# QA #2509: judge prompts on PR kodustech/poison_store#495

Rule `883c2597-…` ("QA-2509 Ruby debugging and dynamic code hygiene", 1305 chars, path `qa2509/**`), decomposed on QA into 10 atoms, 7 with a detector:

| atom | title | detector |
|---|---|---|
| 1 | Do not print debug output with puts or print | `(?<![\w.])(?:puts\|print)\b\|\b(?:STDOUT\|STDERR\|\$stdout\|\$stderr)\.(?:puts\|print)\b` |
| 2 | Do not dump debug values with p or pp | `(?:^\s*\|[;{\|]\s*)p{1,2}(?:\(\|\s+(?![=:,>)\]?])[^\s])` |
| 3 | Do not leave binding.pry or binding.irb breakpoints | `binding\.(pry\|irb)\b` |
| 4 | Do not leave byebug or debugger breakpoints | `^\s*(?:byebug\|debugger)\s*;?\s*(?://.*\|#.*)?$` |
| 5 | Do not call eval with a string argument | `\beval\s*[("']` |
| 6 | Do not call instance_eval or class_eval with a string argument | `\.(instance_eval\|class_eval\|module_eval)\s*\(?\s*(['"]\|%[qQ]?\W\|<<[-~]?)` |
| 7 | Do not mutate a Hash argument in place | (semantic) |
| 8 | Do not mutate an Array argument in place | (semantic) |
| 9 | Do not mutate a String argument in place | (semantic) |
| 10 | Write diagnostics through Rails.logger with an explicit level | `(?<![\w.:])(?:\$std(?:out\|err)\|STD(?:OUT\|ERR))\s*(?:\.\s*(?:puts\|print\|printf\|write\|flush\|syswrite)\b\|<<)\|(?<![\w.:])(?<!def )(?:puts\|print\|printf\|warn)\b` |

## Round 1 (commit 7277bc7): Langfuse observations c3472fa09b31441e and 44533876577ad5cb (environment homolog)

Provider log: `(sharded) using model: openai_compatible:…deepseek-v4p1-flash for PR#495 (7 semantic, 7 mechanical rules; 3 with detector hits -> 3 candidate line(s) to confirm)`

### Shard c3472fa09b31441e: qa2509/report_service.rb

```
[1] Use Early Returns to Exclude Special Cases like days_supply 0
[2] Avoid Magic Numbers for Domain States
[3] Match Public Method and Module Names to the Requirement
[4] Verify Model Attributes Exist Before Reading Them
[5] Do not mutate a Hash argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[6] Do not mutate an Array argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[7] Do not mutate a String argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[8] Do not print debug output with puts or print
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[9] Write diagnostics through Rails.logger with an explicit level
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene

<Candidates>
- rule [8] -> line(s) 8
- rule [9] -> line(s) 8
```

### Shard 44533876577ad5cb: qa2509/export_job.rb

```
[1] Use Early Returns to Exclude Special Cases like days_supply 0
[2] Avoid Magic Numbers for Domain States
[3] Match Public Method and Module Names to the Requirement
[4] Verify Model Attributes Exist Before Reading Them
[5] Do not mutate a Hash argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[6] Do not mutate an Array argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[7] Do not mutate a String argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[8] Do not leave binding.pry or binding.irb breakpoints
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene

<Candidates>
- rule [8] -> line(s) 4
```

## Round 2 (commit 28850d3, incremental): Langfuse observation e45af4ae0f464a28

File qa2509/report_service.rb. No detector fired on the incremental diff, so no detector atom is in the shard and there is no <Candidates> block.

```
[1] Use Early Returns to Exclude Special Cases like days_supply 0
[2] Avoid Magic Numbers for Domain States
[3] Match Public Method and Module Names to the Requirement
[4] Verify Model Attributes Exist Before Reading Them
[5] Do not mutate a Hash argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[6] Do not mutate an Array argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[7] Do not mutate a String argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
```

The earlier Kody Rule decision in <PreviousReviewDecisions>:

```
<PreviousDecision index="3">
      Id: 4f70b670-de4a-4067-ac1f-82af54bfc529
      Location: qa2509/report_service.rb:8-8
      Type: Kody Rule — "QA-2509 Ruby debugging and dynamic code hygiene"
```

## Local harness: the same 10 atoms and the same two files, merge 183660ab9 vs first parent b28cc52f1

Real `expandForReview` -> `buildDetectorCandidates` -> `judgeKodyRulesSharded`, with a stub judge that records the prompt and one earlier kody_rules decision on the rule uuid.

### 183660ab9 (merge)

Detector hit index: `atom-1` -> qa2509/report_service.rb:[8], `atom-3` -> qa2509/export_job.rb:[4], `atom-10` -> qa2509/report_service.rb:[8]

- qa2509/report_service.rb: 5 units of the rule judged; candidates: - rule [1] -> line(s) 8; - rule [5] -> line(s) 8; "part of rule" lines: 5; earlier decision `Type: Kody Rule — "QA-2509 Ruby debugging and dynamic code hygiene"`
- qa2509/export_job.rb: 4 units of the rule judged; candidates: - rule [1] -> line(s) 4; "part of rule" lines: 4; earlier decision `Type: Kody Rule — "QA-2509 Ruby debugging and dynamic code hygiene"`

### b28cc52f1 (parent)

Detector hit index: `rule uuid` -> qa2509/report_service.rb:[8]; qa2509/export_job.rb:[4]

- qa2509/report_service.rb: 10 units of the rule judged; candidates: - rule [1] -> line(s) 8; - rule [2] -> line(s) 8; - rule [3] -> line(s) 8; - rule [4] -> line(s) 8; - rule [5] -> line(s) 8; - rule [6] -> line(s) 8; - rule [7] -> line(s) 8; - rule [8] -> line(s) 8; - rule [9] -> line(s) 8; - rule [10] -> line(s) 8; "part of rule" lines: 0; earlier decision `Type: Kody Rule — "Write diagnostics through Rails.logger with an explicit level"`
- qa2509/export_job.rb: 10 units of the rule judged; candidates: - rule [1] -> line(s) 4; - rule [2] -> line(s) 4; - rule [3] -> line(s) 4; - rule [4] -> line(s) 4; - rule [5] -> line(s) 4; - rule [6] -> line(s) 4; - rule [7] -> line(s) 4; - rule [8] -> line(s) 4; - rule [9] -> line(s) 4; - rule [10] -> line(s) 4; "part of rule" lines: 0; earlier decision `Type: Kody Rule — "Write diagnostics through Rails.logger with an explicit level"`

## Round 3 (commit 1849f4f, incremental): undecomposed detector rule, Langfuse observation 30bb0c313467b15f

Short rule `248b09c4-…` ("QA-2509 No HACK markers", detector `#\s*HACK\s*:`, no atoms). Provider log: `(7 semantic, 8 mechanical rules; 1 with detector hits -> 1 candidate line(s) to confirm)`.

```
[1] Use Early Returns to Exclude Special Cases like days_supply 0
[2] Avoid Magic Numbers for Domain States
[3] Match Public Method and Module Names to the Requirement
[4] Verify Model Attributes Exist Before Reading Them
[5] Do not mutate a Hash argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[6] Do not mutate an Array argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[7] Do not mutate a String argument in place
      part of rule: QA-2509 Ruby debugging and dynamic code hygiene
[8] QA-2509 No HACK markers

<Candidates>
- rule [8] -> line(s) 5
```

Posted: https://github.com/kodustech/poison_store/pull/495#discussion_r4634263697
