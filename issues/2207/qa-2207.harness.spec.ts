/**
 * QA harness for kodus-ai#2207 / PR #2250. Not committed.
 * Runs the real AgentReviewStage call-graph block + the real GraphContextService
 * + the real KodusGraphCli (kodus-graph 0.3.0) against a local clone of the
 * test PR branch. Only the DB/repository lookups are stubbed, and failures are
 * injected into the sandbox shell.
 */
import { exec } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { frozenContext } from '../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from '@libs/code-review/pipeline/stages/agent-review.stage';
import { GraphContextService } from '@libs/code-review/infrastructure/adapters/services/graph/graph-context.service';
import { KodusGraphCli } from '@libs/code-review/infrastructure/adapters/services/graph/kodus-graph-cli';
import { LLM } from '@libs/llm/llm';

jest.mock(
    '@libs/code-review/infrastructure/agents/engine/classify-severity',
    () => ({ classifySeverity: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock(
    '@libs/code-review/infrastructure/agents/engine/format-suggestion-content',
    () => ({ formatSuggestionContent: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock('@libs/llm/managed-slot', () => {
    const actual = jest.requireActual('@libs/llm/managed-slot');
    return { ...actual, hasManagedModelKey: jest.fn(() => false) };
});
jest.setTimeout(180_000);

const REPO_DIR = process.env.QA_REPO_DIR!;
const PATCH = process.env.QA_PATCH!;
const LABEL = process.env.QA_LABEL || 'run';

type Fail = { contextCmd?: boolean };

const makeSandbox = (fail: Fail, cmds: string[]) => ({
    type: 'local',
    baseBranch: 'main',
    repoDir: REPO_DIR,
    remoteCommands: { grep: jest.fn(), readFile: jest.fn() },
    run: (cmd: string, opts?: { timeoutMs?: number }) => {
        cmds.push(cmd);
        if (fail.contextCmd && cmd.includes('kodus-graph context')) {
            // Stand-in for `kodus-graph context` passing its 60s timeout.
            return Promise.resolve({
                exitCode: 124,
                stdout: '',
                stderr: 'simulated: kodus-graph context timed out after 60000ms',
            });
        }
        return new Promise((resolve) =>
            exec(
                cmd,
                { shell: '/bin/bash', timeout: opts?.timeoutMs ?? 30_000 },
                (err: any, stdout, stderr) =>
                    resolve({
                        exitCode: err ? (err.code ?? 1) : 0,
                        stdout,
                        stderr,
                    }),
            ),
        );
    },
    writeFile: async (p: string, c: string) => {
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, c);
    },
    readFile: (p: string) => readFile(p, 'utf8'),
});

async function scenario(
    name: string,
    opts: { exportFails?: boolean; repoNotFound?: boolean; fail?: Fail },
) {
    const logs: string[] = [];
    const cmds: string[] = [];
    const astGraphRepo = {
        exportSubgraphJsonString: opts.exportFails
            ? jest.fn().mockRejectedValue(new Error('DB connection lost'))
            : jest.fn().mockResolvedValue('{"nodes":[],"edges":[]}'),
    };
    const repoServiceForGraph = {
        findById: jest
            .fn()
            .mockResolvedValue(
                opts.repoNotFound ? null : { uuid: 'repo-uuid', astGraphSha: null },
            ),
    };
    const graph = new GraphContextService(
        astGraphRepo as any,
        repoServiceForGraph as any,
        new KodusGraphCli(),
    );
    for (const lvl of ['log', 'warn', 'error'] as const) {
        const orig = (graph as any).logger[lvl].bind((graph as any).logger);
        (graph as any).logger[lvl] = (o: any) => {
            logs.push(`${lvl}: ${o.message}${o.error ? ` | error=${o.error.message}` : ''}`);
            return orig(o);
        };
    }
    const orchestrator = {
        execute: jest.fn().mockResolvedValue({
            suggestions: [],
            agentResults: [],
            failures: [],
            incomplete: [],
            warnings: [],
        }),
    };
    const stage = new AgentReviewStage(
        { findLatestStageLog: jest.fn(), updateCodeReview: jest.fn(), updateStageLog: jest.fn() } as any,
        {
            findByExternalId: jest
                .fn()
                .mockResolvedValue({ uuid: 'repo-uuid', astGraphStatus: 'ready' }),
        } as any,
        orchestrator as any,
        { runLLMInSpan: jest.fn(async ({ runFn }: any) => runFn?.()) } as any,
        graph as any,
        { isEnabled: jest.fn().mockResolvedValue(false) } as any,
        { getReleaseTrack: jest.fn().mockResolvedValue('stable') } as any,
        { getRepositories: jest.fn().mockResolvedValue([]), getCloneParams: jest.fn().mockResolvedValue(null) } as any,
    );
    const ctx = frozenContext({
        organizationAndTeamData: { organizationId: 'org-qa', teamId: 'team-qa' },
        repository: { id: '930932849', name: 'poison_store', defaultBranch: 'main' },
        pullRequest: { number: 494, base: { ref: 'main' } },
        platformType: 'GITHUB',
        changedFiles: [{ filename: 'app/utils/date_formatter.rb', patch: PATCH }],
        sandboxHandle: makeSandbox(opts.fail ?? {}, cmds),
        codeReviewConfig: {
            reviewOptions: {},
            resolvedModelSlot: { provider: 'openai', model: 'gpt-4o-mini' },
        },
        validSuggestions: [],
        discardedSuggestions: [],
        errors: [],
    }) as any;
    const result = await (stage as any).executeStage(ctx);
    const input = JSON.stringify(orchestrator.execute.mock.calls[0] ?? []);
    const cg = /"callGraph":"((?:[^"\\]|\\.)*)"/.exec(input)?.[1] ?? '';
    const out = {
        label: LABEL,
        scenario: name,
        reviewWarnings: (result.reviewWarnings ?? []).map((w: any) => w.kind),
        callGraphChars: cg.length,
        callGraphHasContractDiffs: /contract/i.test(cg),
        gitShowOriginMain: cmds.some((c) => c.includes('git show') && c.includes('origin/main')),
        graphLogs: logs.filter((l) => l.includes('KODUS-GRAPH')),
    };
    if (process.env.QA_OUT) await writeFile(`${process.env.QA_OUT}/${LABEL}-${name}.callgraph.txt`, JSON.parse(`"${cg}"`));
    // eslint-disable-next-line no-console
    console.log('QA2207RESULT ' + JSON.stringify(out));
    return out;
}

beforeEach(() => {
    jest.spyOn(LLM, 'run').mockResolvedValue({ groups: [], unique: [] } as any);
});

describe('QA #2207 harness', () => {
    it('S0 control: DB baseline path succeeds', async () => {
        await scenario('S0-db-baseline-ok', {});
    });
    it('S1 DB baseline (subgraph export) fails', async () => {
        await scenario('S1-export-fails', { exportFails: true });
    });
    it('S2 repository not found by UUID', async () => {
        await scenario('S2-repo-not-found', { repoNotFound: true });
    });
    it('S3 kodus-graph context fails in DB path and in the fallback', async () => {
        await scenario('S3-context-fails-both', { fail: { contextCmd: true } });
    });
    it('S4 repo not found and fallback fails', async () => {
        await scenario('S4-repo-not-found-fallback-fails', {
            repoNotFound: true,
            fail: { contextCmd: true },
        });
    });
});
