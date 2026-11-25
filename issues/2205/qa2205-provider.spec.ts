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

describe('qa2205 provider', () => {
    afterAll(() => fs.writeFileSync(process.env.QA2205_OUT!, JSON.stringify(OUT, null, 1)));

    it('M3a PR spec fixture, internal tiers, 200K', async () => {
        const files = Array.from({ length: 10 }, (_, i) => { const d = '@@ -1,1 +1,1 @@\n' + 'x'.repeat(60000); return { filename: `src/f${i}.ts`, patch: d, patchWithLinesStr: d }; });
        await run('M3a', { files, window: 200000, stageProfile: false });
    });

    it('M3b F-large GH at 64K (stage profile)', async () => {
        const files = toFileChanges(fx('large-GH.json'));
        const scores = computeFileScores(files as any);
        const tiers = assignFileTiers(scores);
        OUT.M3b_fixture = { files: files.map((f: any) => ({ f: f.filename, chars: f.patchWithLinesStr.length, adds: f.additions, score: +scores.get(f.filename)!.score.toFixed(3), tier: tiers.get(f.filename) })),
            totalDiffChars: files.reduce((s: number, f: any) => s + f.patchWithLinesStr.length, 0),
            estimateFull: P.estimatePromptTokens({ changedFiles: files, prTitle: 'qa', prBody: 'body', adaptiveProfile: resolveAdaptiveProfile(64000) }),
            estimateWithTiersArg: P.estimatePromptTokens({ changedFiles: files, prTitle: 'qa', prBody: 'body', adaptiveProfile: resolveAdaptiveProfile(64000), fileTiers: tiers }),
            overhead: P.estimateNonDiffOverheadTokens({ changedFiles: files, prTitle: 'qa', prBody: 'body', adaptiveProfile: resolveAdaptiveProfile(64000) }) };
        await run('M3b', { files, window: 64000 });
        // with a 6K-char callGraph to bound graph contribution
        await run('M3b_cg6k', { files, window: 64000, callGraph: 'edge: x -> y\n'.repeat(500) });
    });

    it('M4 compact 24K children tier their own subsets', async () => {
        const files = toFileChanges(fx('large-GH.json'));
        await run('M4_c24', { files, window: 24000 });
    });

    it('M5 F-filter at 64K', async () => {
        await run('M5', { files: toFileChanges(fx('filter-GH.json')), window: 64000 });
    });

    it('M6 filter edge cases', async () => {
        const large = fx('large-GH.json'); const filt = fx('filter-GH.json');
        const lowOnly = Object.fromEntries(Object.entries(filt).filter(([k]) => /\.(spec\.ts|md|css)$/.test(k)));
        const srcAndLow = { ...large, ...lowOnly };
        await run('M6a_retained_over', { files: toFileChanges(srcAndLow), window: 64000 });
        await run('M6b_all_low_signal_over', { files: toFileChanges(lowOnly), window: 64000 });
        await run('M6c_zero_files', { files: [], window: 64000 });
        await run('M6d_small_low_signal', { files: toFileChanges({ 'a/x.spec.ts': 'it(1)\n', 'a/README.md': '# x\n' }), window: 64000 });
    });

    it('M8/M9 preflight and full-profile controls', async () => {
        const small = toFileChanges(fx('small-GH.json'));
        await run('M8_16k', { files: small, window: 16000 });
        await run('M8_12288', { files: small, window: 12288 });
        await run('M23_20k', { files: small, window: 20000 });
        await run('M9_full_bigCallGraph', { files: small, window: 64000, callGraph: 'c'.repeat(100000) });
        await run('M9_full_O_ge_window', { files: small, window: 64000, callGraph: 'c'.repeat(200000) });
        const one = toFileChanges({ 'big/one.ts': ('export const v = 1;\n').repeat(12000) });
        await run('M9_single_oversized', { files: one, window: 64000 });
    });

    it('M10 prompt variants with mixed tiers', async () => {
        const files = toFileChanges(fx('large-GH.json'));
        const tiers = assignFileTiers(computeFileScores(files as any));
        const meta: any = { identity: { name: 'kodus-generalist', description: 'g', goal: 'g', expertise: [] }, categoryPrompt: 'Review.', categoryLabel: 'generalist', allowedLabels: ['bug'], supportsMixed: true };
        const base: any = { changedFiles: files, fileTiers: tiers, prNumber: 1, prTitle: 't', prBody: 'b', repositoryFullName: 'acme/repo', baseBranch: 'main', organizationAndTeamData: { organizationId: 'o', teamId: 't' } };
        const res: any = {};
        const variants: any = { full: (PB as any).buildUserPrompt, compact: (PB as any).buildCompactUserPrompt, selfContained: (PB as any).buildSelfContainedUserPrompt };
        for (const [k, fn] of Object.entries(variants) as any) {
            try {
                const p: string = fn({ ...base, adaptiveProfile: resolveAdaptiveProfile(k === 'compact' ? 24000 : 64000) }, meta);
                const blocks = files.map((f: any) => p.includes(f.patchWithLinesStr));
                res[k] = { chars: p.length, allDiffsWhole: blocks.every(Boolean), wholeCount: blocks.filter(Boolean).length, sentinels: sentinels(p).length, tierLabelsOnHeadings: (p.match(/^### .*\[(CRITICAL|warm|optional[^\]]*)\]$/gm) || []).length, hunkOnlyBlocks: (p.match(/\[optional, \+\d+ -\d+\]/g) || []).length, coverageTierWords: (p.replace(/```diff[\s\S]*?```/g, '').match(/\b(critical|warm|optional)\b/gi) || []).length };
            } catch (e: any) { res[k] = { error: String(e.message).slice(0, 200) }; }
        }
        OUT.M10 = res;
    });

    it('M13 batch failure aggregation', async () => {
        const files = toFileChanges(fx('large-GH.json'));
        const ctxErr = () => new AgentContextWindowTooSmallError({ contextWindow: 24000, overheadTokens: 13300, modelName: 'deepseek' });
        const rl = () => Object.assign(new Error('429 Too Many Requests: rate limit exceeded'), { statusCode: 429, status: 429 });
        await run('M13_ctx_on_batch2', { files, window: 64000, loopImpl: (p, _s, i) => { if (i === 2) throw ctxErr(); return harnessResult(p); } });
        await run('M13_429_on_batch1', { files, window: 64000, loopImpl: (p, _s, i) => { if (i === 1) throw rl(); return harnessResult(p); } });
        await run('M13_all_fail', { files, window: 64000, loopImpl: (_p, _s, i) => { throw i === 1 ? ctxErr() : rl(); } });
        await run('M13_hard_limit_batch2', { files, window: 64000, loopImpl: (p, _s, i) => harnessResult(p, i === 2 ? { finishReason: 'length', incompleteReason: 'max-steps', submittedResult: false } : {}) });
        await run('M13_verify_discards', { files, window: 64000, loopImpl: (p, _s, i) => harnessResult(p, i === 2 ? { findings: { reasoning: 'x', suggestions: [] }, droppedByVerify: [{ relevantFile: p.changedFiles[0].filename, suggestionContent: 'dropped' }] } : {}) });
        OUT.M13_classify = {
            ctx: (() => { const c: any = classifyLLMError(ctxErr()); return { category: c?.category ?? getClassification(c)?.category, friendly: String(c?.friendlyMessage ?? '').slice(0, 900) }; })(),
            r429: (() => { const c: any = classifyLLMError(rl()); return { category: c?.category, retryable: c?.retryable }; })(),
        };
    });

    it('M22 provider patch shapes', async () => {
        for (const shape of ['github', 'gitlab', 'bitbucket', 'azure', 'forgejo']) {
            await run('M22_' + shape, { files: toFileChanges(fx('large-GH.json'), shape), window: 64000 });
        }
    });

    it('M26 interleaved runs (in-process) distinct org, 64K vs 24K', async () => {
        const files = toFileChanges(fx('large-GH.json'));
        const [a, b] = await Promise.all([
            run('M26_A_64k', { files, window: 64000, org: { organizationId: 'org-A', teamId: 'team-A' }, loopImpl: async (p) => { await new Promise((r) => setTimeout(r, 30)); return harnessResult(p); } }),
            Promise.resolve().then(() => null),
        ]);
        void a; void b;
    });

    it('M4b full-profile handoff where the parent also chunks', async () => {
        const files = Array.from({ length: 10 }, (_, i) => { const d = '@@ -1,1 +1,1 @@\n' + 'x'.repeat(60000); return { filename: `src/f${i}.ts`, patch: d, patchWithLinesStr: d, additions: i < 4 ? 300 : 2, deletions: 0, status: 'added' }; });
        await run('M4b_full', { files, window: 64000 });
    });

    it('M16 classified error through the PR comment builder', async () => {
        const diag = require('@libs/llm/review-error-diagnostics');
        const e = new AgentContextWindowTooSmallError({ contextWindow: 20000, overheadTokens: 12117, modelName: 'openai_compatible:accounts/fireworks/models/deepseek-v4p1-flash' });
        const c: any = classifyLLMError(e);
        OUT.M16 = { category: c.category, isTerminal: c.terminal ?? c.isTerminal, body: diag.buildReviewErrorMessage({ friendlyMessage: c.friendlyMessage, provider: 'openai_compatible', model: 'accounts/fireworks/models/deepseek-v4p1-flash', httpStatus: c.httpStatus, providerMessage: c.providerMessage }), rawMessage: e.message,
            plainSerialized: (() => { const plain = { name: 'AgentContextWindowTooSmallError', message: e.message }; const c2: any = classifyLLMError(plain as any); return { category: c2.category, friendly: String(c2.friendlyMessage).slice(0, 300) }; })(),
            plainError: (() => { const c3: any = classifyLLMError(new Error(e.message)); return { category: c3.category, friendly: String(c3.friendlyMessage).slice(0, 300) }; })(),
        };
    });

    it('M18/M21 replay of the real QA patches', async () => {
        for (const [name, file] of [['REAL_gh5', 'real-gh5.json'], ['REAL_gl3', 'real-gl3.json']]) {
            const raw = fx(file);
            const files = raw.map((f: any) => { const formatted = handlePatchDeletions(f.patch, f.filename, f.status) as string; return { ...f, patch: formatted, patchWithLinesStr: convertToUnifiedDiffWithLineNumbers(formatted, { filename: f.filename }) }; });
            const tiers = assignFileTiers(computeFileScores(files as any));
            OUT[name + '_tiers'] = Object.fromEntries(tiers);
            OUT[name + '_est'] = { full: P.estimatePromptTokens({ changedFiles: files, prTitle: 'x'.repeat(54), prBody: 'b'.repeat(500), adaptiveProfile: resolveAdaptiveProfile(64000) }), withTiers: P.estimatePromptTokens({ changedFiles: files, prTitle: 'x'.repeat(54), prBody: 'b'.repeat(500), adaptiveProfile: resolveAdaptiveProfile(64000), fileTiers: tiers }) };
            await run(name, { files, window: 64000, prBody: 'b'.repeat(500) });
        }
    });
});
