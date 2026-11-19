# QA #2207 / PR #2250: local harness, merge vs first parent

Harness: the real `AgentReviewStage` call-graph block, real `GraphContextService` and real `KodusGraphCli` (kodus-graph 0.3.0), run on a local clone of kodustech/poison_store at the QA test PR branch (PR #494, `app/utils/date_formatter.rb`, signature change `format_date(date)` -> `format_date(date, separator = '/')`). Stubbed: the Postgres repository lookups and `exportSubgraphJsonString`. Failures injected: subgraph export rejects (`DB connection lost`), repository not found by UUID, and `kodus-graph context` returning exit 124 (stand-in for its 60 s timeout).

Commits: merge `f419e6780` (PR #2250) and its first parent `8e50ce840`. Harness source: [qa-2207.harness.spec.ts](qa-2207.harness.spec.ts).

| Scenario | Commit | reviewWarnings | callGraph chars | fallback baseBranch | base graph from origin/main |
|---|---|---|---|---|---|
| S0-db-baseline-ok | parent | none | 1549 | (no fallback) | no |
| S1-export-fails | parent | none | 1549 | none | no |
| S2-repo-not-found | parent | none | 1549 | none | no |
| S3-context-fails-both | parent | none | 0 | none | no |
| S4-repo-not-found-fallback-fails | parent | none | 0 | none | no |
| S0-db-baseline-ok | merge | none | 1549 | (no fallback) | no |
| S1-export-fails | merge | none | 2029 | main | yes |
| S2-repo-not-found | merge | none | 2029 | main | yes |
| S3-context-fails-both | merge | CALLGRAPH_FAILED | 0 | main | yes |
| S4-repo-not-found-fallback-fails | merge | CALLGRAPH_FAILED | 0 | main | yes |

## Graph service log lines per run

### S0-db-baseline-ok (merge)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
log: [KODUS-GRAPH] Step 3/4: Subgraph exported: 23 chars, writing to sandbox at <repo>/.kodus-graph/base-graph.json
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Step 4/4: Generating prompt context with base graph...
log: [KODUS-GRAPH] Context generated with DB baseline: 1464 chars
```

### S0-db-baseline-ok (parent)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
log: [KODUS-GRAPH] Step 3/4: Subgraph exported: 23 chars, writing to sandbox at <repo>/.kodus-graph/base-graph.json
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Step 4/4: Generating prompt context with base graph...
log: [KODUS-GRAPH] Context generated with DB baseline: 1464 chars
```

### S1-export-fails (merge)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Failed with DB baseline, falling back to legacy | error=DB connection lost
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=main, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] buildBaseGraphFromGit: base graph built from 1/1 files on origin/main
log: [KODUS-GRAPH] Context generated: 1930 chars for 1 changed files (baseGraph=yes)
```

### S1-export-fails (parent)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Failed with DB baseline, falling back to legacy | error=DB connection lost
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=none, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Context generated: 1464 chars for 1 changed files (baseGraph=no)
```

### S2-repo-not-found (merge)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Step 3/4: repo not found by UUID repo-uuid, falling back to legacy
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=main, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] buildBaseGraphFromGit: base graph built from 1/1 files on origin/main
log: [KODUS-GRAPH] Context generated: 1930 chars for 1 changed files (baseGraph=yes)
```

### S2-repo-not-found (parent)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Step 3/4: repo not found by UUID repo-uuid, falling back to legacy
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=none, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Context generated: 1464 chars for 1 changed files (baseGraph=no)
```

### S3-context-fails-both (merge)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
log: [KODUS-GRAPH] Step 3/4: Subgraph exported: 23 chars, writing to sandbox at <repo>/.kodus-graph/base-graph.json
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Step 4/4: Generating prompt context with base graph...
warn: [KODUS-GRAPH] Failed with DB baseline, falling back to legacy | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=main, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] buildBaseGraphFromGit: base graph built from 1/1 files on origin/main
warn: [KODUS-GRAPH] Failed to generate context | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
```

### S3-context-fails-both (parent)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
log: [KODUS-GRAPH] Step 3/4: Subgraph exported: 23 chars, writing to sandbox at <repo>/.kodus-graph/base-graph.json
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] Step 4/4: Generating prompt context with base graph...
warn: [KODUS-GRAPH] Failed with DB baseline, falling back to legacy | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=none, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
warn: [KODUS-GRAPH] Failed to generate context, proceeding without it | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
```

### S4-repo-not-found-fallback-fails (merge)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Step 3/4: repo not found by UUID repo-uuid, falling back to legacy
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=main, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
log: [KODUS-GRAPH] buildBaseGraphFromGit: base graph built from 1/1 files on origin/main
warn: [KODUS-GRAPH] Failed to generate context | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
```

### S4-repo-not-found-fallback-fails (parent)

```
log: [KODUS-GRAPH] Step 1/4: Installing kodus-graph...
log: [KODUS-GRAPH] Step 2/4: Parsing 1 changed files...
log: [KODUS-GRAPH] Step 3/4: Exporting subgraph from DB for repo repo-uuid...
warn: [KODUS-GRAPH] Step 3/4: repo not found by UUID repo-uuid, falling back to legacy
log: [KODUS-GRAPH] generateContextLegacy called: changedFiles=1, baseBranch=none, sandboxType=local
log: [KODUS-GRAPH] Diff written to sandbox: 447 chars, 1 files
warn: [KODUS-GRAPH] Failed to generate context, proceeding without it | error=kodus-graph context failed (exit=124): simulated: kodus-graph context timed out after 60000ms
```

## What the base branch adds (S1, DB export fails)

Parent (fallback without base branch):

```xml
<CallGraph>
  <!-- Static analysis of this repo at one commit. Absence here is not absence in the codebase:
       reflection, dynamic dispatch and external consumers are invisible. Each edge carries the
       tier and confidence it was resolved with — verify low-confidence claims with the tools
       before acting on them. Reason from this map; answer from the code. -->
  <Summary changedFunctions="2" untestedFunctions="2" impactedCallers="1" riskLevel="MEDIUM" riskScore="0.49" />

  <ChangedFunction name="DateFormatter.format_date" file="app/utils/date_formatter.rb" lines="1-4" tested="false" status="new" exported="true">
    <WhatChanged>New function added</WhatChanged>
    <RiskSignals>
      <Signal type="untested-with-callers" severity="high">1 callers depend on this untested function</Signal>
    </RiskSignals>
    <Callers count="1" untestedCount="1">
      <Caller name="format_range" file="app/utils/date_formatter.rb" line="7" confidence="0.85" tier="same" />
    </Callers>
  </ChangedFunction>

  <ChangedFunction name="DateFormatter.format_range" file="app/utils/date_formatter.rb" lines="6-8" tested="false" status="new" exported="true">
    <WhatChanged>New function added</WhatChanged>
    <RiskSignals>
      <Signal type="calls-new-function" severity="medium">Calls 1 newly added function(s): format_date</Signal>
    </RiskSignals>
  </ChangedFunction>

  <Hierarchy>
    <Class name="DateFormatter" />
  </Hierarchy>
</CallGraph>
```

Merge (fallback with `main`):

```xml
<CallGraph>
  <!-- Static analysis of this repo at one commit. Absence here is not absence in the codebase:
       reflection, dynamic dispatch and external consumers are invisible. Each edge carries the
       tier and confidence it was resolved with — verify low-confidence claims with the tools
       before acting on them. Reason from this map; answer from the code. -->
  <Summary changedFunctions="2" untestedFunctions="2" impactedCallers="1" riskLevel="MEDIUM" riskScore="0.49" />

  <ReviewFocus>
    <Focus>Verify 1 callers of DateFormatter.format_date pass correct params after signature change</Focus>
  </ReviewFocus>

  <CriticalPaths>
    <Path risk="medium">
      <Step>format_range</Step>
      <Step annotation="params changed">DateFormatter.format_date</Step>
      <Risk>Caller format_range may pass wrong arguments</Risk>
    </Path>
  </CriticalPaths>

  <ChangedFunction name="DateFormatter.format_date" file="app/utils/date_formatter.rb" lines="1-4" tested="false" status="modified" exported="true">
    <WhatChanged>Parameters changed: (date) → (date, separator = &apos;/&apos;). Function body modified. 1 callers may need param update</WhatChanged>
    <RiskSignals>
      <Signal type="param-changed" severity="high">Parameters changed: (date) → (date, separator = &apos;/&apos;)</Signal>
      <Signal type="untested-with-callers" severity="high">1 callers depend on this untested function</Signal>
    </RiskSignals>
    <Callers count="1" untestedCount="1">
      <Caller name="format_range" file="app/utils/date_formatter.rb" line="7" confidence="0.85" tier="same" />
    </Callers>
  </ChangedFunction>

  <ChangedFunction name="DateFormatter.format_range" file="app/utils/date_formatter.rb" lines="6-8" tested="false" status="new" exported="true">
    <WhatChanged>New function added</WhatChanged>
  </ChangedFunction>

  <Hierarchy>
    <Class name="DateFormatter" />
  </Hierarchy>
</CallGraph>
```
