/* QA #2205 provider harness: real BaseCodeReviewAgentProvider, real batch runner, real
 * planner/scorer/prompt builder. Stubbed: model resolution, the agent loop (model boundary)
 * and the Langfuse wrapper. Output JSON to QA2205_OUT. */
jest.mock('@libs/code-review/infrastructure/agents/collaborators/model-factory', () => ({ resolveReviewAgentModel: jest.fn() }));
jest.mock('@libs/code-review/infrastructure/agents/core/core-agent-loop.adapter', () => ({ runAgentLoopViaCore: jest.fn() }));
jest.mock('@libs/code-review/infrastructure/agents/collaborators/review-observability', () => ({ runAgentWithTrace: jest.fn() }));
jest.mock('@libs/code-review/infrastructure/agents/collaborators/batch-runner', () => {
    const actual = jest.requireActual('@libs/code-review/infrastructure/agents/collaborators/batch-runner');
    return { runChunkedReview: jest.fn(actual.runChunkedReview) };
});

import * as fs from 'fs';
import { BaseCodeReviewAgentProvider } from '@libs/code-review/infrastructure/agents/providers/base-code-review-agent.provider';
import { resolveReviewAgentModel } from '@libs/code-review/infrastructure/agents/collaborators/model-factory';
import { runAgentLoopViaCore } from '@libs/code-review/infrastructure/agents/core/core-agent-loop.adapter';
import { runAgentWithTrace } from '@libs/code-review/infrastructure/agents/collaborators/review-observability';
import { runChunkedReview } from '@libs/code-review/infrastructure/agents/collaborators/batch-runner';
import { resolveAdaptiveProfile } from '@libs/code-review/infrastructure/agents/engine/adaptive-fit';
import * as planner from '@libs/code-review/infrastructure/agents/collaborators/context-fit-planner';
import { computeFileScores, assignFileTiers } from '@libs/code-review/infrastructure/agents/engine/file-priority-scorer';
import { handlePatchDeletions, convertToUnifiedDiffWithLineNumbers } from '@libs/common/utils/patch';
import * as PB from '@libs/code-review/infrastructure/agents/prompts/prompt-builder';
import { classifyLLMError, getClassification } from '@libs/llm/error-classifier';
import { AgentContextWindowTooSmallError } from '@libs/llm/errors';

const P: any = planner;
const resolveModelMock = resolveReviewAgentModel as jest.Mock;
const runLoopMock = runAgentLoopViaCore as jest.Mock;
const runTraceMock = runAgentWithTrace as jest.Mock;
const runChunkedSpy = runChunkedReview as jest.Mock;
const OUT: any = {};
const SECRET = 'sk-qa2205-CANARY-not-a-real-key-000';

class Generalist extends BaseCodeReviewAgentProvider {
    protected getIdentity() { return { name: 'kodus-generalist', description: 'g', goal: 'g', expertise: ['x'] }; }
    protected getCategoryPrompt(): string { return 'Review.'; }
    protected getCategoryLabel(): string { return 'generalist'; }
    protected supportsMixedLabels(): boolean { return true; }
    protected getAllowedSuggestionLabels() { return ['bug', 'security', 'performance'] as any; }
}

type Rec = { logs: any[]; loops: any[] };
function newAgent(rec: Rec) {
    const a: any = new Generalist({} as any, {} as any, undefined, undefined);
    const push = (level: string) => (e: any) => rec.logs.push({ level, message: String(e?.message ?? e), metadata: e?.metadata });
    a.agentLogger = { log: push('log'), warn: push('warn'), error: push('error'), debug: push('debug'), info: push('info'), verbose: push('verbose') };
    return a;
}

function toFileChanges(files: Record<string, string>, shape: string = 'github'): any[] {
    return Object.keys(files).sort().map((filename) => {
        const content = files[filename];
        const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n');
        let patch = `@@ -0,0 +1,${lines.length} @@\n` + lines.map((l) => '+' + l).join('\n');
        if (shape === 'gitlab' || shape === 'bitbucket' || shape === 'azure') patch += '\n';
        if (shape === 'forgejo') patch = `diff --git a/${filename} b/${filename}\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/${filename}\n` + patch;
        const formatted = handlePatchDeletions(patch, filename, 'added') as string;
        return { filename, status: 'added', additions: lines.length, deletions: 0, changes: lines.length, patch: formatted, patchWithLinesStr: convertToUnifiedDiffWithLineNumbers(formatted, { filename }) };
    });
}

function model(window: number) {
    return {
        byokConfig: { provider: 'openai_compatible', model: 'accounts/fireworks/models/deepseek-v4p1-flash', apiKey: SECRET },
        main: { role: 'main', modelName: 'openai_compatible:accounts/fireworks/models/deepseek-v4p1-flash', modelId: 'accounts/fireworks/models/deepseek-v4p1-flash', maxInputTokens: window, byokProvider: 'openai_compatible' },
    };
}

function harnessResult(params: any, extra: any = {}) {
    const first = params.changedFiles?.[0]?.filename;
    return {
        findings: { reasoning: 'ok', suggestions: first ? [{ suggestionContent: 'finding in ' + first, relevantFile: first, oneSentenceSummary: 's ' + first, relevantLinesStart: 1, relevantLinesEnd: 1, severity: 'high', existingCode: 'a', improvedCode: 'b', language: 'typescript', label: 'bug' }] : [] },
        text: 'ok', steps: 3, toolCalls: [], finishReason: 'stop', source: 'json-parse', submittedResult: true,
        usage: { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
        discardedBySeverity: [], droppedByVerify: [], coverage: { covered: 1, total: 1 }, verification: null,
        anomalies: { stepsLe2: false, zeroToolCalls: false, zeroStrongEvidenceFiles: false, zeroCoverage: false, lowCoverage: false, lowStrongEvidenceFiles: false },
        warnings: [], ...extra,
    };
}

function sentinels(text: string) { return (text.match(/F2205_[A-Z]+_[A-Z0-9]+_(HEAD|TAIL)/g) || []).sort(); }

async function run(name: string, opts: { files: any[]; window: number; stageProfile?: boolean; callGraph?: string; reviewMode?: string; prBody?: string; loopImpl?: (p: any, s: any, i: number) => any; parentSignal?: AbortSignal; org?: any; }) {
    const rec: Rec = { logs: [], loops: [] };
    resolveModelMock.mockReset(); resolveModelMock.mockResolvedValue(model(opts.window));
    runLoopMock.mockReset();
    let n = 0;
    runLoopMock.mockImplementation(async (params: any, secrets: any) => {
        const idx = ++n;
        rec.loops.push({
            idx, at: Date.now(),
            files: params.changedFiles.map((f: any) => f.filename),
            fileTiers: params.fileTiers ? Object.fromEntries(params.fileTiers) : undefined,
            userPromptChars: params.userPrompt.length, systemPromptChars: params.systemPrompt.length,
            userSentinels: sentinels(params.userPrompt),
            tierLabelsOnDiffHeadings: (params.userPrompt.match(/^### .*\[(CRITICAL|warm|optional[^\]]*)\]$/gm) || []).length,
            hunkHeaderOnlyBlocks: (params.userPrompt.match(/\[optional, \+\d+ -\d+\]/g) || []).length,
            coverageMentionsTier: /critical|optional/i.test(params.userPrompt.replace(/```diff[\s\S]*?```/g, '')),
            telemetry: params.telemetryMetadata,
            secretInParams: JSON.stringify({ ...params, onStepFinish: undefined, onHeavyLensesStarted: undefined, conventionGuideReader: undefined }).includes(SECRET),
            secretInSecrets: JSON.stringify(secrets?.byokConfig ?? {}).includes(SECRET),
            contextWindowTokens: params.contextWindowTokens,
            estimate: P.estimatePromptTokens({ changedFiles: params.changedFiles, callGraph: params.callGraph, prTitle: 'qa', prBody: opts.prBody ?? 'body', adaptiveProfile: opts.stageProfile === false ? resolveAdaptiveProfile(opts.window) : resolveAdaptiveProfile(opts.window) }),
            systemPromptHash: require('crypto').createHash('sha1').update(params.systemPrompt).digest('hex').slice(0, 12),
        });
        if (opts.loopImpl) return opts.loopImpl(params, secrets, idx);
        return harnessResult(params);
    });
    runTraceMock.mockImplementation((_m: any, _i: any, fn: () => any) => fn());
    runChunkedSpy.mockClear();
    const input: any = {
        organizationAndTeamData: opts.org ?? { organizationId: 'org-canary-2205', teamId: 'team-canary-2205' },
        changedFiles: opts.files, prNumber: 2205, repositoryId: 'repo-canary-2205', repositoryFullName: 'acme/repo',
        prTitle: 'qa', prBody: opts.prBody ?? 'body', baseBranch: 'main', languageResultPrompt: 'en-US', reviewMode: opts.reviewMode ?? 'balanced',
        callGraph: opts.callGraph, parentSignal: opts.parentSignal,
        ...(opts.stageProfile === false ? {} : { adaptiveProfile: resolveAdaptiveProfile(opts.window) }),
    };
    const agent = newAgent(rec);
    const origBuild = agent.buildUserPrompt.bind(agent);
    (rec as any).promptInputs = [];
    agent.buildUserPrompt = (inp: any) => { (rec as any).promptInputs.push({ files: inp.changedFiles.map((f: any) => f.filename), tierKeys: inp.fileTiers ? [...inp.fileTiers.keys()] : null, batchIndex: inp.batchIndex }); const up = origBuild(inp); (rec as any).promptInputs[(rec as any).promptInputs.length - 1].coverageTierWords = (up.replace(/```diff[\s\S]*?```/g, '').match(/\b(critical|warm|optional)\b/gi) || []).length; return up; };
    let output: any, error: any;
    try { output = await agent.execute(input); } catch (e: any) { error = { name: e?.constructor?.name, message: String(e?.message).slice(0, 400), contextWindow: e?.contextWindow, overheadTokens: e?.overheadTokens }; }
    const chunkCalls = runChunkedSpy.mock.calls.map((c: any) => ({ depth: c[0].recursionDepth ?? 0, files: c[0].changedFiles.length, parentFileTiers: c[0].fileTiers ? Object.fromEntries(c[0].fileTiers) : undefined, diffBudget: c[1].diffBudget }));
    const res = {
        loops: rec.loops, chunkCalls, promptInputs: (rec as any).promptInputs,
        logs: rec.logs.filter((l) => /context window|aggressive filter|priority tiering|exceeds context budget|reviewing \d+ files|batch \d+\/\d+|all batches|chunker|recursion|failed/i.test(l.message)).map((l) => ({ level: l.level, message: l.message.slice(0, 300), metadata: l.metadata })),
        secretInLogs: JSON.stringify(rec.logs).includes(SECRET),
        output: output && { suggestions: (output.suggestions || []).map((s: any) => s.relevantFile), finishReason: output.finishReason, hitHardLimit: output.hitHardLimit, warnings: (output.warnings || output.reviewWarnings || []).map((w: any) => ({ kind: w.kind, reason: w.reason, detail: w.detail })), keys: Object.keys(output) },
        error,
    };
    OUT[name] = res;
    return res;
}

const fx = (p: string) => JSON.parse(fs.readFileSync(process.env.QA2205_FX + '/' + p, 'utf8'));


const EV = process.env.QA2205_EVENTS!;
const ev = (o: any) => fs.appendFileSync(EV, JSON.stringify({ t: new Date().toISOString(), pid: process.pid, worker: process.env.QA2205_WORKER, ...o }) + '\n');
it('worker', async () => {
    const window = Number(process.env.QA2205_WINDOW);
    const delay = Number(process.env.QA2205_DELAY || '1500');
    const files = toFileChanges(fx('large-GH.json'));
    const ac = new AbortController();
    if (process.env.QA2205_ABORT_AFTER) setTimeout(() => { ev({ e: 'abort-signal' }); ac.abort(); }, Number(process.env.QA2205_ABORT_AFTER));
    ev({ e: 'start', window });
    try {
        const r = await run('w', { files, window, parentSignal: ac.signal, org: { organizationId: process.env.QA2205_ORG, teamId: process.env.QA2205_ORG + '-team' }, loopImpl: async (p: any, _s: any, i: number) => {
            ev({ e: 'model-call-start', idx: i, files: p.changedFiles.length, tiers: p.fileTiers ? p.fileTiers.size : 0, org: p.telemetryMetadata.organizationId, ctx: p.contextWindowTokens, est: rec_est(p) });
            await new Promise<void>((res, rej) => { const tm = setTimeout(res, delay); p.parentSignal?.addEventListener?.('abort', () => { clearTimeout(tm); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }); });
            ev({ e: 'model-call-end', idx: i });
            return harnessResult(p);
        } });
        ev({ e: 'done', loops: r.loops.length, error: r.error?.name, finish: r.output?.finishReason, hitHardLimit: r.output?.hitHardLimit, suggestions: r.output?.suggestions?.length });
    } catch (e: any) { ev({ e: 'threw', name: e?.name }); }
}, 120000);
function rec_est(p: any) { return P.estimatePromptTokens({ changedFiles: p.changedFiles, prTitle: 'qa', prBody: 'body', adaptiveProfile: resolveAdaptiveProfile(p.contextWindowTokens) }); }
