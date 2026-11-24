# #2655 / PR #2660 — QA runs (CLI built at cb2d2bb46, KODUS_API_URL=https://qa.api.kodus.io, slot-b org, repo codex-athena, staged fixture qa2655/enrollment.ts)

Each run: argv, start/end (UTC), exit code, stderr (complete), stdout (complete or head/tail). Secrets, paths and the fake key in the fixture are masked.


## M1

- `argv.txt`: `review --staged --format json --fail-on error`
- `start.txt`: `2026-11-24T12:50:10Z`
- `end.txt`: `2026-11-24T12:53:12Z`
- `code.txt`: `1`

stderr.txt:
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 7 issues meet or exceed `--fail-on error`.
CLI exited with code 1
```

stdout.txt (6159 bytes):
```
{
  "issues": [
    {
      "file": "qa2655/enrollment.ts",
      "line": 18,
      "title": "SQL injection in removeStudentsFromSchool via concatenated schoolId",
      "endLine": 20,
      "fixable": false,
      "message": "The DELETE statement concatenates req.query.schoolId directly into the SQL string without parameterization. An attacker can pass schoolId like `x' OR '1'='1` to delete every enrollment row, or use stacked/UNION payloads to read or destroy arbitrary data. Use the parameterized form already used in findClass: pool.query('DELETE FROM enrollments WHERE school_id = $1', [schoolId]).",
      "category": "security_vulnerability",
      "severity": "critical",
      "suggestion": "    await pool.query('DELETE FROM enrollments WHERE school_id = $1', [schoolId]);"
    },
    {
      "file": "qa2655/enrollment.ts",
      "line": 7,
      "title": "Live API key hard-coded as a source constant instead of loaded from env",
      "endLine": 7,
      "fixable": false,
      "message": "A live-looking secret key (`sk_live_...`) is committed as a source constant. Anyone with repository access can use the credential against the records service, and it cannot be rotated without 
…
ollment.ts",
      "line": 42,
      "title": "averageGrade divides by zero for empty grades array",
      "endLine": 42,
      "fixable": false,
      "message": "For an empty grades array, `total / grades.length` divides by zero and returns NaN rather than a defined result. Return 0 (or handle the empty case explicitly) when `grades.length === 0`.",
      "category": "bug",
      "severity": "warning",
      "suggestion": "    return grades.length === 0 ? 0 : total / grades.length;"
    }
  ],
  "summary": "Found 9 issues in 1 file (1 critical)",
  "duration": 175147,
  "filesAnalyzed": 1
}

```

## M2

- `start.txt`: `2026-11-24T12:53:45Z`
- `end.txt`: `2026-11-24T12:58:17Z`
- `pipestatus.txt`: `1 0`
- `jq-stdout.txt`: `9`

stderr-terminal.txt:
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 6 issues meet or exceed `--fail-on error`.
CLI exited with code 1
```

## M6

- `start.txt`: `2026-11-24T12:59:31Z`
- `end.txt`: `2026-11-24T13:01:33Z`
- `stderr.txt.code`: `1`
- `hunk-ledger.jsonl`: `{"t":1795525293821,"argv":["diff","--staged","--agent-context","--agent-notes","--experimental","--extension"],"annotations":7,"stdoutIsTTY":true,"exit":0}`

stderr.txt:
```
[verbose] Staged diff: 1739 chars
[verbose] Getting staged diff only
[verbose] Diff result: 1739 characters
[verbose] Diff preview:
diff --git a/qa2655/enrollment.ts b/qa2655/enrollment.ts
new file mode 100644
index 0000000..f17fe22
--- /dev/null
+++ b/qa2655/enrollment.ts
@@ -0,0 +1,48 @@
+import { Request, Response } from 'express';
+import { Pool } from 'pg';
+
+const pool = new Pool();
+
+// Hard-coded credential for the school records service.
+const RECORDS_API_KEY = 'sk_live_<fake-redacted>';
+
+interface ClassRoom {
+    id: string;
+    capacity: number;
+    enrolled: number;
+}
+
+expo
... (truncated)
[verbose] Reading project context files...
[verbose] Found context files: claude.md
[verbose] Total context size: 44 characters
[verbose] Review config: rulesOnly=false, fast=false
[verbose] Diff size: 1805 characters
[verbose] Full file contents: 1 file(s)
[verbose]   - qa2655/enrollment.ts: 1532 chars, status=modified
[verbose] Using personal token (no metrics)
[verbose] Sending to API:
[verbose]   - diff length: 1805 chars
[verbose]   - config: {"files":[{"path":"qa2655/enrollment.ts","content":"import { Request, Response } from 'express';\nimport { Pool } from 'pg';\n\nconst pool = new Pool();\n\n// Hard-coded credential for the school records service.\nconst RECORDS_API_KEY = 'sk_live_<fake-redacted>';\n\ninterface ClassRoom {\n    id: string;\n    capacity: number;\n    enrolled: number;\n}\n\nexport async function removeStudentsFromSchool(req: Request, res: Response) {\n    const schoolId = req.query.schoolId as string;\n    // Deletes every enrollment of the school the caller asks for.\n    await pool.query(\n        \"DELETE FROM enrollments WHERE school_id = '\" + schoolId + \"'\",\n    );\n    res.json({ ok: true });\n}\n\nexport async function enrollStudent(req: Request, res: Response) {\n    const classRoom: ClassRoom | null = await findClass(req.body.classId);\n    // Reject when the class is full.\n    if (classRoom!.enrolled <= classRoom!.capacity) {\n        throw new Error('Class is full');\n    }\n    await pool.query(\n        `INSERT INTO enrollments (class_id, student_id) VALUES ('${req.body.classId}', '${req.body.studentId}')`,\n    );\n    classRoom!.enrolled += 1;\n    res.json({ ok: true, key: RECORDS_API_KEY });\n}\n\nexport function averageGrade(grades: number[]): number {\n    let total = 0;\n    for (let i = 0; i <= grades.length; i++) {\n        total += grades[i];\n    }\n    return total / grades.length;\n}\n\nasync function findClass(id: string): Promise<ClassRoom | null> {\n    const { rows } = await pool.query('SELECT * FROM classes WHERE id = $1', [id]);\n    return rows[0] ?? null;\n}\n","status":"modified","diff":"diff --git a/qa2655/enrollment.ts b/qa2655/enrollment.ts\nnew file mode 100644\nindex 0000000..f17fe22\n--- /dev/null\n+++ b/qa2655/enrollment.ts\n@@ -0,0 +1,48 @@\n+import { Request, Response } from 'express';\n+import { Pool } from 'pg';\n+\n+const pool = new Pool();\n+\n+// Hard-coded credential for the school records service.\n+const RECORDS_API_KEY = 'sk_live_<fake-redacted>';\n+\n+interface ClassRoom {\n+    id: string;\n+    capacity: number;\n+    enrolled: number;\n+}\n+\n+export async function removeStudentsFromSchool(req: Request, res: Response) {\n+    const schoolId = req.query.schoolId as string;\n+    // Deletes every enrollment of the school the caller asks for.\n+    await pool.query(\n+        \"DELETE FROM enrollments WHERE school_id = '\" + schoolId + \"'\",\n+    );\n+    res.json({ ok: true });\n+}\n+\n+export async function enrollStudent(req: Request, res: Response) {\n+    const classRoom: ClassRoom | null = await findClass(req.body.classId);\n+    // Reject when the class is full.\n+    if (classRoom!.enrolled <= classRoom!.capacity) {\n+        throw new Error('Class is full');\n+    }\n+    await pool.query(\n+        `INSERT INTO enrollments (class_id, student_id) VALUES ('${req.body.classId}', '${req.body.studentId}')`,\n+    );\n+    classRoom!.enrolled += 1;\n+    res.json({ ok: true, key: RECORDS_API_KEY });\n+}\n+\n+export function averageGrade(grades: number[]): number {\n+    let total = 0;\n+    for (let i = 0; i <= grades.length; i++) {\n+        total += grades[i];\n+    }\n+    return total / grades.length;\n+}\n+\n+async function findClass(id: string): Promise<ClassRoom | null> {\n+    const { rows } = await pool.query('SELECT * FROM classes WHERE id = $1', [id]);\n+    return rows[0] ?? null;\n+}\n"}]}
[API] POST https://qa.api.kodus.io/cli/review
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, statusUrl, deviceToken]",
  "statusCode": 202,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[API] GET https://qa.api.kodus.io/cli/review/jobs/554efc54-7dfd-4d66-94a3-64251b5f22ba
[API] Raw response structure: [ 'data', 'statusCode', 'type' ]
[API] Response preview: {
  "data": "[object: jobId, status, result, createdAt, startedAt, completedAt]",
  "statusCode": 200,
  "type": "Object"
}
[verbose] API response:
[verbose]   - summary: Found 7 issues in 1 file (1 critical)
[verbose]   - issues: 7
[verbose]   - filesAnalyzed: 1
✔ Review complete!
[verbose] hunk routing: useHunkViewer=true ttyOut=true platformSupported=true scopeSupported=true format=terminal output=∅ agent=false interactive=false hunkOpt=true
[verbose] hunk: feeding 7 issue(s) to converter
[verbose]   #1 file="qa2655/enrollment.ts" line=18 endLine=20 severity=critical msg="`schoolId` from `req.query` is concatenated directly into the DELETE statement, "
[verbose]   #2 file="qa2655/enrollment.ts" line=27 endLine=29 severity=error msg="The fullness check is inverted: `enrolled <= capacity` means the class still has"
[verbose]   #3 file="qa2655/enrollment.ts" line=34 endLine=34 severity=error msg="The response returns `RECORDS_API_KEY`, exposing a server-side secret to every c"
[verbose]   #4 file="qa2655/enrollment.ts" line=30 endLine=32 severity=error msg="`req.body.classId` and `req.body.studentId` are interpolated into the INSERT str"
[verbose]   #5 file="qa2655/enrollment.ts" line=25 endLine=27 severity=warning msg="`findClass` returns `ClassRoom | null`, but the result is dereferenced with `cla"
[verbose]   #6 file="qa2655/enrollment.ts" line=39 endLine=41 severity=warning msg="The loop condition `i <= grades.length` iterates one past the last element, read"
[verbose]   #7 file="qa2655/enrollment.ts" line=7 endLine=7 severity=warning msg="A live-looking API key is hard-coded in source, so it is committed to the reposi"
[verbose] hunk: agent-context written to /tmp/kodus-review-64c7c70f-9dbf-442a-b5cb-600e3153e0a0.json
[verbose] hunk: 1 file(s), 7 annotation(s) after conversion
[verbose]   - qa2655/enrollment.ts: 7-7, 18-20, 25-27, 27-29, 30-32, 34-34, 39-41
[verbose] hunk: spawning `hunk diff --staged --agent-context /tmp/kodus-review-64c7c70f-9dbf-442a-b5cb-600e3153e0a0.json --agent-notes --experimental --extension <work>/wt-M/apps/cli/hunk-extension/kodus`
[verbose] hunk: agent-context kept at /tmp/kodus-review-64c7c70f-9dbf-442a-b5cb-600e3153e0a0.json, findings at /tmp/kodus-findings-64c7c70f-9dbf-442a-b5cb-600e3153e0a0.json
Exiting with code 1 because 4 issues meet or exceed `--fail-on error`.
CLI exited with code 1
CliExitError: CLI exited with code 1
    at exitWithCode (file://<work>/wt-M/apps/cli/dist/utils/cli-exit.js:12:11)
    at Command.reviewAction (file://<work>/wt-M/apps/cli/dist/features/review/command.js:286:21)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async Command.parseAsync (file://<work>/wt-M/apps/cli/node_modules/commander/lib/command.js:1113:5)
    at async main (file://<work>/wt-M/apps/cli/dist/index.js:15:5)
    at async file://<work>/wt-M/apps/cli/dist/index.js:18:5
```

stdout (pty) contains "Exiting with code": False

## M7

- `argv.txt`: `review --staged --fast --format json --fail-on error --quiet -o <work>/ev/qa/M7/review.json`
- `start.txt`: `2026-11-24T12:59:33Z`
- `end.txt`: `2026-11-24T13:01:55Z`
- `code.txt`: `1`

stderr.txt:
```
CLI exited with code 1
```

stdout.txt (0 bytes):
```

```

## M9o

- `argv.txt`: `review --staged --format json --fail-on error -o <work>/ev/qa/M9o/res.json`
- `start.txt`: `2026-11-24T12:59:35Z`
- `end.txt`: `2026-11-24T13:02:23Z`
- `code.txt`: `1`

stderr.txt:
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 6 issues meet or exceed `--fail-on error`.
CLI exited with code 1
```

stdout.txt (157 bytes):
```

Output saved to <work>/ev/qa/M9o/res.json

```

## M9p

- `argv.txt`: `review --staged --prompt-only --fail-on error`
- `start.txt`: `2026-11-24T12:59:39Z`
- `end.txt`: `2026-11-24T13:02:11Z`
- `code.txt`: `1`

stderr.txt:
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 7 issues meet or exceed `--fail-on error`.
CLI exited with code 1
```

stdout.txt (4329 bytes):
```
REVIEW_ANALYSIS_COMPLETE

FILES_ANALYZED: 1
ISSUES_FOUND: 9
DURATION_MS: 144509

SEVERITY_BREAKDOWN:
  CRITICAL: 0
  ERROR: 7
  WARNING: 2
  INFO: 0

ISSUES:

ISSUE_1:
  file: qa2655/enrollment.ts
  line: 18
  end_line: 19
  severity: error
  category: security_vulnerability
  message: schoolId comes from req.query and is concatenated directly into the DELETE statement, so an attacker can inject arbitrary SQL (e.g. schoolId="' OR '1'='1" wipes every enrollment). Use a parameterized query: `DELETE FROM enrollments WHERE school_id = $1` with [schoolId].
  fixable: false

ISSUE_2:
  file: qa2655/enrollment.ts
  line: 31
  end_line: 31
  severity: error
  category: security_vulnerability
  message: req.body.classId and req.body.studentId are interpolated into the INSERT string, allowing SQL injection through request body fields. Bind them as parameters: `INSERT INTO enrollments (class_id, student_id) VALUES ($1, $2)` with [req.body.classId, req.body.studentId].
  fixable: false

ISSUE_3:
  file: qa2655/enrollment.ts
  line: 15
  end_line: 20
  severity: error
  category: security_vulnerability
  message: removeStudentsFromSchool deletes every enrollment for any schoolId the caller supp
…
throws a TypeError at runtime. Guard for null before dereferencing.
  fixable: false

ISSUE_9:
  file: qa2655/enrollment.ts
  line: 39
  end_line: 42
  severity: warning
  category: bug
  message: The loop bound `i <= grades.length` reads grades[grades.length], which is undefined, so `total += undefined` makes total NaN and averageGrade always returns NaN for any non-empty input. Use `i < grades.length`.
  suggestion:     for (let i = 0; i < grades.length; i++) {
        total += grades[i];
    }
    return total / grades.length;
  fixable: false

SUMMARY:
Found 9 issues in 1 file

END_REVIEW

```

## M13

- `argv.txt`: `review --staged --agent --fail-on error`
- `start.txt`: `2026-11-24T12:59:41Z`
- `end.txt`: `2026-11-24T13:03:13Z`
- `code.txt`: `1`

stderr.txt:
```

```

stdout.txt (6484 bytes):
```
{
  "ok": true,
  "command": "review",
  "data": {
    "issues": [
      {
        "file": "qa2655/enrollment.ts",
        "line": 15,
        "title": "Unauthenticated bulk DELETE wipes any school's enrollments",
        "endLine": 19,
        "fixable": false,
        "message": "This bulk DELETE of every enrollment for a caller-supplied `schoolId` has no authentication or authorization check, so any caller can wipe another school's records. Enforce that the requester owns/administers `schoolId` before executing the delete.",
        "category": "security_vulnerability",
        "severity": "error"
      },
      {
        "file": "qa2655/enrollment.ts",
        "line": 27,
        "title": "Inverted fullness check rejects classes with free seats",
        "endLine": 28,
        "fixable": false,
        "message": "The fullness check is inverted: `enrolled <= capacity` throws 'Class is full' precisely when the class still has free seats, so non-full classes reject and full classes accept. It must be `if (classRoom.enrolled >= classRoom.capacity)` to reject only when full.",
        "category": "bug",
        "severity": "error",
        "suggestion": ""
      },
      {
        
…
o).",
        "category": "bug",
        "severity": "warning",
        "suggestion": ""
      }
    ],
    "summary": "Found 9 issues in 1 file",
    "duration": 209472,
    "filesAnalyzed": 1
  },
  "error": null,
  "meta": {
    "schemaVersion": "1.0",
    "cliVersion": "0.4.22",
    "mode": "agent",
    "durationMs": 212518
  }
}
{
  "ok": false,
  "command": "review",
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "CLI exited with code 1"
  },
  "meta": {
    "schemaVersion": "1.0",
    "cliVersion": "0.4.22",
    "mode": "agent",
    "durationMs": 212520
  }
}

```

## QA `kodus_workflow.workflow_jobs` rows (slot-b org, window 12:49–13:04 UTC): one job per CLI run

| job | status | created | completed | issues | high/error+critical | run |
|---|---|---|---|---|---|---|
| 60c4bd8e | COMPLETED | 12:50:12 | 12:53:09 | 9 | 7 | M1 (gate line said 7) |
| 8128bd96 | COMPLETED | 12:53:46 | 12:58:14 | 9 | 6 | M2 (jq printed 9, gate said 6) |
| 554efc54 | COMPLETED | 12:59:34 | 13:01:33 | 7 | 4 | M6 (gate said 4) |
| d9532e77 | COMPLETED | 12:59:34 | 13:01:50 | 7 | 5 | M7 (-o file: 7 issues, 5 blockers) |
| d5ff835b | COMPLETED | 12:59:36 | 13:02:19 | 8 | 6 | M9 -o (gate said 6) |
| 7640b010 | COMPLETED | 12:59:40 | 13:02:07 | 9 | 7 | M9 --prompt-only (gate said 7) |
| ef01bca8 | COMPLETED | 12:59:42 | 13:03:12 | 9 | 7 | M13 --agent |

Team key `qa-2655-streams` revoked at the end (`active: false`).
