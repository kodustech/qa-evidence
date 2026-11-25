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
        ...((opts as any).forcedProfile ? { adaptiveProfile: (opts as any).forcedProfile } : opts.stageProfile === false ? {} : { adaptiveProfile: resolveAdaptiveProfile(opts.window) }),
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


import { splitUnifiedDiff } from '@libs/common/utils/split-unified-diff';
import { CliInputConverter } from '@libs/cli-review/infrastructure/converters/cli-input.converter';
import { resolveAgentReviewSettings } from '@libs/code-review/pipeline/stages/agent-review-settings';
const OD = process.env.QA2205_PROMPTS!;
fs.mkdirSync(OD, { recursive: true });
const SHA = process.env.QA2205_SHA!;
afterAll(() => fs.writeFileSync(process.env.QA2205_OUT!, JSON.stringify(OUT, null, 1)));
function dump(name: string) {
    return async (p: any, _s: any, i: number) => {
        const diffText = p.changedFiles.map((f: any) => f.patchWithLinesStr ?? f.patch ?? '').join('\n');
        fs.writeFileSync(`${OD}/${SHA}-${name}-b${i}.json`, JSON.stringify({ system: p.systemPrompt, user: p.userPrompt, diff: diffText, files: p.changedFiles.map((f: any) => f.filename), window: p.contextWindowTokens }));
        return harnessResult(p);
    };
}
const prep = (files: any[]) => files.map((f: any) => { if (f.patch === undefined || f.patch === null) return f; const formatted = handlePatchDeletions(f.patch, f.filename, f.status) as string; return { ...f, patch: formatted, patchWithLinesStr: convertToUnifiedDiffWithLineNumbers(formatted, { filename: f.filename }) }; });
const body = 'Adds a capped late fee and includes it in the invoice total.';

it('A1 one-file PR across small windows', async () => {
    const small = fx('small20-GH.json');
    const one = { 'qa2205small20/fees/late-fee.ts': small['qa2205small20/fees/late-fee.ts'] };
    for (const w of [12288, 16000, 20000, 22000, 22500, 24000]) {
        const files = toFileChanges(one);
        const r = await run(`A1_${w}`, { files, window: w, prBody: body, loopImpl: dump(`A1_${w}`) });
        OUT[`A1_${w}`].O = P.estimateNonDiffOverheadTokens({ changedFiles: files, prTitle: 'qa', prBody: body, adaptiveProfile: resolveAdaptiveProfile(w) });
        OUT[`A1_${w}`].budget = Math.floor(w * 0.55);
        void r;
    }
    // M24 replica for calibration (3 sources + 2 specs at 24K)
    await run('CAL_M24', { files: toFileChanges(fx('c24-GH.json')), window: 24000, prBody: 'Small school helpers with two specs.', loopImpl: dump('CAL_M24') });
});

it('A2 real M18/M21 batches and a 128K window filling its diff budget', async () => {
    for (const [name, file] of [['A2_gh5', 'real-gh5.json'], ['A2_gl3', 'real-gl3.json']]) {
        await run(name, { files: prep(fx(file)), window: 64000, prBody: 'b'.repeat(500), loopImpl: dump(name) });
    }
    await run('A2_xl128k', { files: toFileChanges(fx('xl-GH.json')), window: 128000, prBody: body, loopImpl: dump('A2_xl128k') });
    await run('A2_xl200k', { files: toFileChanges(fx('xl-GH.json')), window: 200000, prBody: body, loopImpl: dump('A2_xl200k') });
});

it('A3 CLI chain 64K and 16K', async () => {
    const diff = fs.readFileSync(process.env.QA2205_FX + '/cli-large.diff', 'utf8');
    const conv = new CliInputConverter();
    const files = conv.convertToFileChanges({ diff } as any);
    const stage = resolveAgentReviewSettings(undefined as any);
    OUT.A3_stage = { effectiveContextWindow: stage.effectiveContextWindow, kind: stage.adaptiveProfile.kind };
    for (const w of [64000, 16000]) {
        const rec: any = await runWithProfile(`A3_cli_${w}`, files, w, stage.adaptiveProfile, dump(`A3_cli_${w}`));
        void rec;
    }
    const sdiff = fs.readFileSync(process.env.QA2205_FX + '/cli-small.diff', 'utf8');
    await runWithProfile('A3_cli_small_16000', conv.convertToFileChanges({ diff: sdiff } as any), 16000, stage.adaptiveProfile, dump('A3_cli_small_16000'));
    await runWithProfile('A3_cli_small_20000', conv.convertToFileChanges({ diff: sdiff } as any), 20000, stage.adaptiveProfile, dump('A3_cli_small_20000'));
});

async function runWithProfile(name: string, files: any[], w: number, profile: any, loopImpl: any) {
    // same as run() but with an explicit stage profile (the CLI stage's)
    const origResolve = resolveAdaptiveProfile;
    void origResolve;
    return run(name, { files, window: w, prBody: '', loopImpl, stageProfile: false, forcedProfile: profile } as any);
}

it('A4 real Azure / Bitbucket / Forgejo shapes', async () => {
    const { createFilePatchYielding } = require('@libs/platform/infrastructure/adapters/services/azureRepos/azure-file-patch');
    const large = fx('large-GH.json');
    const az: any[] = [];
    for (const fn of Object.keys(large).sort()) {
        const patch = await createFilePatchYielding(fn, fn, '', large[fn], '', 'abc1234');
        const lines = large[fn].split('\n').length - 1;
        az.push({ filename: fn, status: 'added', additions: lines, deletions: 0, patch });
    }
    OUT.A4_azure_head = az[0].patch.slice(0, 200);
    await run('A4_azure', { files: prep(az), window: 64000, prBody: body, loopImpl: dump('A4_azure') });
    const azUndef = az.map((f, i) => (i === 9 ? { ...f, patch: undefined } : f));
    await run('A4_azure_undefined_patch', { files: prep(azUndef), window: 64000, prBody: body, loopImpl: dump('A4_azure_undef') });
    for (const [name, file] of [['A4_bitbucket', 'raw-bb.diff'], ['A4_forgejo', 'raw-fj.diff']]) {
        const parts = splitUnifiedDiff(fs.readFileSync(process.env.QA2205_FX + '/' + file, 'utf8'));
        OUT[name + '_head'] = parts[0].patch.slice(0, 120);
        await run(name, { files: prep(parts.map((p) => ({ ...p }))), window: 64000, prBody: body, loopImpl: dump(name) });
    }
});
