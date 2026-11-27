# #1941 retest 2026-11-27: local harness at 144030af1

## r14-live.txt
```
    QA1941LIVE | R2 | classifyReply called: true
    QA1941LIVE | R3 | classifyReply called: true
    QA1941LIVE | R7 | classifyReply called: true
--- mutant: namesState removed
    QA1941LIVE | R2 | classifyReply called: false
    QA1941LIVE | R3 | classifyReply called: false
    QA1941LIVE | R7 | classifyReply called: true
```

## r14-r22-jest.txt
```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
  console.log
    QA1941R22 | https://tracker.acme.com/browse/PROJ-12 | [{"kind":"key","id":"PROJ-12"}]

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941R22 | https://acme.com/jira/browse/proj-12/ | [{"kind":"key","id":"PROJ-12"}]

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941R22 | https://tracker.acme.com/projects/P/issues/PROJ-12 | [{"kind":"key","id":"PROJ-12"}]

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941R22 | https://acme.atlassian.net/browse/PROJ-12 | [{"kind":"key","id":"PROJ-12"}]

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941R22 | https://bitbucket.example.com/projects/P/repos/web/browse/FOO-1 | []

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941R22 | https://github.com/o/r/browse/FOO-1 | []

      at Object.log (libs/agents/business-validation/qa1941-refs.spec.ts:16:21)

  console.log
    QA1941 | MISSING label | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | PARTIAL label | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | NOT IN TASK label | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | NOT  IN TASK (two spaces) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | lower-case missing (R5) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | "is missing" | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | MISSING_FIELD (R6) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | PARTIAL with no open partial | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote 4 requirement words, no "business logic" (R7) | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote 3 requirement words | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote of comment heading (R8) | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote of task title only, no id (R9) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | task id #31 alone | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | MISSING with every finding met | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

Test Suites: 4 passed, 4 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Time:        1.311 s, estimated 2 s
Ran all test suites matching libs/platform/application/services/qa1941-matrix.spec.ts|libs/platform/application/services/business-logic-replies.service.spec.ts|libs/agents/business-validation/qa1941-refs.spec.ts|libs/agents/business-validation/task-references.spec.ts.
```

## r14-mutant-jest.txt
```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
  console.log
    QA1941 | MISSING label | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | PARTIAL label | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | NOT IN TASK label | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | NOT  IN TASK (two spaces) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | lower-case missing (R5) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | "is missing" | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | MISSING_FIELD (R6) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | PARTIAL with no open partial | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote 4 requirement words, no "business logic" (R7) | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote 3 requirement words | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote of comment heading (R8) | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | quote of task title only, no id (R9) | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | task id #31 alone | classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

  console.log
    QA1941 | MISSING with every finding met | classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:136:21)

FAIL libs/platform/application/services/qa1941-matrix.spec.ts
  ● qa1941 reply routing matrix @ 144030af1 › MISSING label -> classifier called

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      135 |             // eslint-disable-next-line no-console
      136 |             console.log(`QA1941 | ${name} | classifyReply called: ${called}`);
    > 137 |             if (expected !== null) expect(called).toBe(expected);
          |                                                   ^
      138 |         });
      139 |     }
      140 | });

      at Object.toBe (libs/platform/application/services/qa1941-matrix.spec.ts:137:51)

  ● qa1941 reply routing matrix @ 144030af1 › PARTIAL label -> classifier called

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      135 |             // eslint-disable-next-line no-console
      136 |             console.log(`QA1941 | ${name} | classifyReply called: ${called}`);
    > 137 |             if (expected !== null) expect(called).toBe(expected);
          |                                                   ^
      138 |         });
      139 |     }
      140 | });

      at Object.toBe (libs/platform/application/services/qa1941-matrix.spec.ts:137:51)

  ● qa1941 reply routing matrix @ 144030af1 › NOT IN TASK label -> classifier called

    expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      135 |             // eslint-disable-next-line no-console
      136 |             console.log(`QA1941 | ${name} | classifyReply called: ${called}`);
    > 137 |             if (expected !== null) expect(called).toBe(expected);
          |                                                   ^
      138 |         });
      139 |     }
      140 | });

      at Object.toBe (libs/platform/application/services/qa1941-matrix.spec.ts:137:51)

Test Suites: 1 failed, 1 total
Tests:       3 failed, 11 passed, 14 total
Snapshots:   0 total
Time:        1.008 s
Ran all test suites matching libs/platform/application/services/qa1941-matrix.spec.ts.
```

## x2-jest.txt
```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
  console.log
    QA1941X2 | sameResult(owner/repo#31 -> #31) = false | control (#31 -> #31) = true

      at Object.log (libs/agents/business-validation/runs/qa1941-same.spec.ts:14:13)

  console.log
    QA1941X2 | stored #31 | reply "#31 is covered now" -> classifyReply called: true

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:179:21)

  console.log
    QA1941X2 | stored kodus-olimpo/claude-athena#31 | reply "#31 is covered now" -> classifyReply called: false

      at Object.log (libs/platform/application/services/qa1941-matrix.spec.ts:179:21)

Test Suites: 2 passed, 2 total
Tests:       17 skipped, 2 passed, 19 total
Snapshots:   0 total
Time:        1.002 s, estimated 2 s
Ran all test suites matching libs/agents/business-validation/runs/qa1941-same.spec.ts|libs/platform/application/services/qa1941-matrix.spec.ts with tests matching "X2".
```

## qa1941-matrix.spec.ts
```
import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import { DEFAULT_BUSINESS_LOGIC_SETTINGS } from '@libs/agents/business-validation/settings';

import { BusinessLogicReplies } from './business-logic-replies.service';

const run = {
    id: 'run-1',
    organizationId: 'org-1',
    repositoryId: 'repo-1',
    pullRequestNumber: 47,
    outcome: 'validated',
    headSha: 'abc1234',
    comment: { id: 501 },
    trackers: ['Linear'],
    unseenFiles: [],
    references: [
        {
            kind: 'key',
            id: 'SAA-96',
            raw: 'SAA-96',
            source: 'title',
            intent: 'closes',
        },
    ],
    attempts: [{ reference: 'SAA-96', tracker: 'Linear', status: 'found' }],
    door: 'auto',
    createdAt: new Date(),
    tasks: [
        {
            tracker: 'Linear',
            id: 'SAA-96',
            url: 'https://linear.app/acme/issue/SAA-96',
            readAt: '2026-10-05T12:00:00Z',
            passed: false,
            requirements: [
                {
                    requirement: 'Order persists after reload',
                    state: 'met',
                    evidence: [],
                    confidence: 'high',
                },
                {
                    requirement: 'Keyboard reordering',
                    state: 'missing',
                    evidence: [],
                    confidence: 'high',
                },
            ],
            outOfScope: [],
        },
    ],
};

const request = {
    organizationAndTeamData: { organizationId: 'org-1', teamId: 'team-1' },
    repository: { id: 'repo-1', name: 'notes' },
    pullRequest: { number: 47 },
    platformType: PlatformType.GITHUB,
    diff: '',
};

function build(intent: any, revalidated?: any, latest: any = run) {
    const service = {
        classifyReply: jest.fn(async () => intent),
        inTeamLanguage: jest.fn(async (_org: unknown, text: string) => text),
        tryRead: jest.fn(async (_org: unknown, id: string) => ({
            status: id === 'SAA-102' ? 'found' : 'not_found',
        })),
        validate: jest.fn(async () => revalidated),
    };
    const publisher = {
        configFor: jest.fn(async () => ({
            settings: DEFAULT_BUSINESS_LOGIC_SETTINGS,
            enabled: true,
        })),
        withRepository: jest.fn((r: unknown) => r),
        headShaOf: jest.fn(async () => 'def5678'),
        publish: jest.fn(async (input: any) => ({
            outcome: input.result.outcome,
            comment: 'updated',
        })),
    };
    const runs = { latestForPullRequest: jest.fn(async () => latest) };
    return {
        replies: new BusinessLogicReplies(
            service as any,
            publisher as any,
            runs as any,
        ),
        service,
        publisher,
    };
}

const task = {
    tracker: 'Git Issues',
    id: '#31',
    url: 'https://github.com/o/r/issues/31',
    readAt: '2026-11-27T12:00:00Z',
    passed: false,
    requirements: [
        { requirement: 'GET /attendance/export returns a CSV file with one row per student', state: 'met', evidence: [], confidence: 'high' },
        { requirement: 'Each row includes the student name, the class code and the attendance date', state: 'partial', evidence: [], confidence: 'high' },
        { requirement: 'Only users with the teacher role can download the export', state: 'missing', evidence: [], confidence: 'high' },
    ],
    outOfScope: [{ change: 'Adds a /health/version endpoint returning the app version', files: [] }],
};
const fixture = { ...run, tasks: [task] } as any;
const noPartial = { ...run, tasks: [{ ...task, requirements: task.requirements.filter((r) => r.state !== 'partial') }] } as any;
const allMet = { ...run, tasks: [{ ...task, requirements: task.requirements.map((r) => ({ ...r, state: 'met' })), outOfScope: [] }] } as any;

const cases: Array<[string, string, any, boolean | null]> = [
    ['MISSING label', '@kody AC 3 MISSING is wrong: the role guard is in qa1941/attendance.controller.ts', fixture, true],
    ['PARTIAL label', '@kody PARTIAL is wrong: the class code is the third column', fixture, true],
    ['NOT IN TASK label', '@kody the NOT IN TASK row is fine: requested by ops, keep it', fixture, true],
    ['NOT  IN TASK (two spaces)', '@kody the NOT  IN TASK row is fine', fixture, null],
    ['lower-case missing (R5)', '@kody why is the export missing a header row?', fixture, false],
    ['"is missing"', '@kody the header is missing here, why?', fixture, false],
    ['MISSING_FIELD (R6)', '@kody where does MISSING_FIELD come from in the export service?', fixture, false],
    ['PARTIAL with no open partial', '@kody PARTIAL is wrong here', noPartial, false],
    ['quote 4 requirement words, no "business logic" (R7)', '> Only users with the teacher role can download the export\n\n@kody this is done in the guard, see qa1941/roles.guard.ts', fixture, true],
    ['quote 3 requirement words', '> teacher role can\n\n@kody done in the guard', fixture, null],
    ['quote of comment heading (R8)', '> Kody · Business Logic\n\n@kody the third requirement is covered in the controller guard', fixture, true],
    ['quote of task title only, no id (R9)', '> Attendance CSV export\n\n@kody the third requirement is covered', fixture, null],
    ['task id #31 alone', '@kody #31 is covered now', fixture, true],
    ['MISSING with every finding met', '@kody AC 3 MISSING is wrong', allMet, false],
];

describe('qa1941 reply routing matrix @ 144030af1', () => {
    for (const [name, message, latest, expected] of cases) {
        it(`${name} -> ${expected === null ? 'record' : expected ? 'classifier called' : 'chat'}`, async () => {
            const { replies, service } = build({ intent: 'other' }, undefined, latest);
            await replies.handle({ request, message, sender: { login: 'nina' } });
            const called = service.classifyReply.mock.calls.length > 0;
            // eslint-disable-next-line no-console
            console.log(`QA1941 | ${name} | classifyReply called: ${called}`);
            if (expected !== null) expect(called).toBe(expected);
        });
    }
});

const liveTask = {
    ...task,
    requirements: [
        { requirement: 'AC 1: GET /attendance/export returns a CSV file with one row per student', state: 'met', evidence: [], confidence: 'high' },
        { requirement: 'AC 2: Each row includes the student name, the class code and the attendance date', state: 'partial', evidence: [], confidence: 'high' },
        { requirement: 'AC 3: Only users with the teacher role can download the export', state: 'missing', evidence: [], confidence: 'high' },
    ],
    outOfScope: [
        { change: 'Adds an unrelated GET /health/version endpoint and registers it in the attendance module', files: [] },
        { change: "Adds a 'present' (yes/no) column to the export, which the task does not request", files: [] },
    ],
};
const live = { ...run, tasks: [liveTask] } as any;
const liveMessages: Array<[string, string]> = [
    ['R2', '@kody AC 3 MISSING is wrong: the role guard is in qa1941/attendance.controller.ts'],
    ['R3', '@kody the NOT IN TASK row is fine: /health/version was requested by ops, keep it'],
    ['R7', '> Only users with the teacher role can download the export\n\n@kody this is done in the guard, see qa1941/roles.guard.ts'],
];
describe('qa1941 live messages against the live PR #32 findings', () => {
    for (const [id, message] of liveMessages) {
        it(id, async () => {
            const { replies, service } = build({ intent: 'other' }, undefined, live);
            await replies.handle({ request, message, sender: { login: 'nina' } });
            // eslint-disable-next-line no-console
            console.log(`QA1941LIVE | ${id} | classifyReply called: ${service.classifyReply.mock.calls.length > 0}`);
        });
    }
});

describe('qa1941 X2 task id after a dispute re-check', () => {
    it('#31 named in a reply when the stored task id is kodus-olimpo/claude-athena#31', async () => {
        const after = { ...run, tasks: [{ ...liveTask, id: 'kodus-olimpo/claude-athena#31' }] } as any;
        const before = { ...run, tasks: [{ ...liveTask, id: '#31' }] } as any;
        for (const [label, latest] of [['stored #31', before], ['stored kodus-olimpo/claude-athena#31', after]] as const) {
            const { replies, service } = build({ intent: 'other' }, undefined, latest);
            await replies.handle({ request, message: '@kody #31 is covered now', sender: { login: 'nina' } });
            // eslint-disable-next-line no-console
            console.log(`QA1941X2 | ${label} | reply "#31 is covered now" -> classifyReply called: ${service.classifyReply.mock.calls.length > 0}`);
        }
    });
});
```

## qa1941-refs.spec.ts
```
import { extractTaskReferences } from './task-references';

const cases: Array<[string, boolean]> = [
    ['https://tracker.acme.com/browse/PROJ-12', true],
    ['https://acme.com/jira/browse/proj-12/', true],
    ['https://tracker.acme.com/projects/P/issues/PROJ-12', true],
    ['https://acme.atlassian.net/browse/PROJ-12', true],
    ['https://bitbucket.example.com/projects/P/repos/web/browse/FOO-1', false],
    ['https://github.com/o/r/browse/FOO-1', false],
];
describe('qa1941 R22 Jira Server/DC links', () => {
    for (const [url, hasKey] of cases) {
        it(`${url} -> ${hasKey ? 'key PROJ-12' : 'no key'}`, () => {
            const refs = extractTaskReferences({ command: url } as any);
            // eslint-disable-next-line no-console
            console.log('QA1941R22 |', url, '|', JSON.stringify(refs.map((r: any) => ({ kind: r.kind, id: r.id }))));
            const keys = refs.filter((r: any) => r.kind === 'key').map((r: any) => String(r.id).toUpperCase());
            if (hasKey) expect(keys).toContain('PROJ-12');
            else expect(keys).toHaveLength(0);
        });
    }
});
```

## qa1941-same.spec.ts
```
import { sameResult } from './run-mapping';

const task = (id: string) => ({
    tracker: 'Git Issues', id, url: 'https://github.com/kodus-olimpo/claude-athena/issues/31', passed: false,
    requirements: [{ requirement: 'AC 3: Only users with the teacher role can download the export', state: 'missing', evidence: [], confidence: 'high' }],
    outOfScope: [],
});
const base = (id: string) => ({ outcome: 'validated', passed: false, attempts: [{ reference: id, tracker: 'Git Issues', status: 'found' }], references: [{ kind: 'git_issue', id: '31' }], tasks: [task(id)] });

it('X2 identical verdict, task id #31 vs owner/repo#31', () => {
    const same = sameResult(base('kodus-olimpo/claude-athena#31') as any, base('#31') as any);
    const control = sameResult(base('#31') as any, base('#31') as any);
    // eslint-disable-next-line no-console
    console.log(`QA1941X2 | sameResult(owner/repo#31 -> #31) = ${same} | control (#31 -> #31) = ${control}`);
});
```

