/* QA harness for #2191 / PR #2303. Runs the REAL AgentReviewStage, classifier,
 * usesOrgOwnedKey (when present), model failover and CodeReviewPipelineObserver.
 * Only external I/O is stubbed (orchestrator output/throw = the LLM boundary,
 * repositories, checks service). Records outcomes to QA_OUT; no assertions, so
 * the same file runs at M and at P and the two JSON files are diffed. */
import * as fs from 'fs';
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from './agent-review.stage';
import * as ctxmod from '../context/code-review-pipeline.context';
import { CodeReviewPipelineObserver } from '../../infrastructure/observers/code-review-pipeline.observer';
import { LLM } from '@libs/llm/llm';
import {
    attachClassification,
    classifyLLMError,
    LlmErrorCategory,
} from '@libs/llm/error-classifier';
import {
    attachAttemptedSlot,
    runWithModelFailover,
} from '@libs/llm/model-failover';
import { environment } from '@libs/ee/configs/environment';
import { AutomationStatus } from '@libs/automation/domain/automation/enum/automation-status';
import { SUMMARY_GENERATION_FAILED_REASON } from '@libs/code-review/pipeline/constants/error-reasons';

jest.mock(
    '@libs/code-review/infrastructure/agents/engine/classify-severity',
    () => ({ classifySeverity: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock(
    '@libs/code-review/infrastructure/agents/engine/format-suggestion-content',
    () => ({ formatSuggestionContent: jest.fn().mockResolvedValue(new Map()) }),
);
jest.mock('@libs/ee/configs/environment', () => ({
    environment: { API_CLOUD_MODE: true },
}));
jest.mock('@libs/llm/managed-slot', () => {
    const actual = jest.requireActual('@libs/llm/managed-slot');
    return { ...actual, hasManagedModelKey: jest.fn(() => false) };
});

const OUT: Record<string, any> = {};
const usesOrgOwnedKey: any = (ctxmod as any).usesOrgOwnedKey;
const ENV_KEYS = [
    'API_LLM_PROVIDER',
    'API_LLM_PROVIDER_MODEL',
    'API_OPEN_AI_API_KEY',
    'API_OPENAI_FORCE_BASE_URL',
    'API_GOOGLE_AI_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'API_VERTEX_AI_API_KEY',
    'GOOGLE_CLOUD_PROJECT',
    'API_LLM_CONFIG',
    'API_LLM_PROVIDER_CONFIG',
];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

const CANARY = 'sk-QA2191-CANARY-7f3a';
const BYOK_SLOT = {
    provider: 'openai_compatible',
    model: 'qa-model',
    credentialId: 'qa-cred-a',
    byokModelId: 'qa-model-a',
    apiKey: CANARY,
};

const err = (msg: string, extra: Record<string, unknown> = {}) =>
    Object.assign(new Error(msg), extra);
const q402 = () => err('Insufficient balance', { status: 402, statusCode: 402 });
const E: Record<string, () => unknown> = {
    s402: q402,
    s429_insufficient_quota: () =>
        err('You exceeded your current quota, please check your plan and billing details', { statusCode: 429, responseBody: '{"error":{"code":"insufficient_quota"}}' }),
    s429_balance: () => err('Insufficient balance', { statusCode: 429 }),
    s403_key_limit: () => err('Key limit exceeded', { statusCode: 403 }),
    gemini_per_minute_429: () =>
        err('Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10, model: gemini-2.5-pro. Please retry in 30s. GenerateRequestsPerMinutePerProjectPerModel', { statusCode: 429 }),
    plain_429: () => err('Too Many Requests', { statusCode: 429 }),
    s401: () => err('Incorrect API key provided', { statusCode: 401 }),
    s403: () => err('Forbidden', { statusCode: 403 }),
    s404: () => err('Not Found', { statusCode: 404 }),
    s500: () => err('Internal Server Error', { statusCode: 500 }),
    abort: () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    unknown: () => new Error('something odd happened'),
};

const recorder = () => {
    const calls: any[] = [];
    const lg: any = {};
    for (const lvl of ['log', 'info', 'warn', 'error', 'debug', 'verbose']) {
        lg[lvl] = (o: any) => calls.push({ level: lvl, message: o?.message });
    }
    return { lg, calls };
};

const makeStage = (orch: { out?: any; throws?: unknown }, beforeOrch?: unknown) => {
    const reviewOrchestrator = {
        execute: jest.fn(async () => {
            if (orch.throws !== undefined) throw orch.throws;
            return orch.out;
        }),
    };
    const graphContext = {
        generateContext: jest.fn(),
        generateContextLegacy: jest.fn(async () => {
            if (beforeOrch !== undefined) throw beforeOrch;
            return '';
        }),
    };
    const stage = new AgentReviewStage(
        { findLatestStageLog: jest.fn(), updateCodeReview: jest.fn(), updateStageLog: jest.fn() } as any,
        { findByExternalId: jest.fn().mockResolvedValue(null) } as any,
        reviewOrchestrator as any,
        { runLLMInSpan: jest.fn(async ({ runFn }: any) => runFn?.()) } as any,
        graphContext as any,
        { isEnabled: jest.fn().mockResolvedValue(false) } as any,
        { getReleaseTrack: jest.fn().mockResolvedValue('stable') } as any,
        { getRepositories: jest.fn().mockResolvedValue([]), getCloneParams: jest.fn().mockResolvedValue(null) } as any,
    );
    const rec = recorder();
    (stage as any).logger = rec.lg;
    return { stage, reviewOrchestrator, rec };
};

const makeContext = (over: Record<string, unknown> = {}) =>
    frozenContext({
        organizationAndTeamData: { organizationId: 'org-1', teamId: 'team-1' },
        repository: { id: 'repo-1', name: 'repo-1' },
        pullRequest: { number: 7 },
        platformType: 'FORGEJO',
        changedFiles: [{ filename: 'src/user.ts' }],
        codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: { ...BYOK_SLOT } },
        validSuggestions: [],
        discardedSuggestions: [],
        errors: [],
        ...over,
    }) as any;

const orchOut = (o: Record<string, unknown> = {}) => ({
    suggestions: [], agentResults: [], failures: [], incomplete: [], unverified: [], warnings: [], ...o,
});

const conclude = async (context: any, statusInfo: any = { status: AutomationStatus.ERROR }) => {
    const finalize: any[] = [];
    const checks = {
        startCheck: jest.fn(),
        updateCheck: jest.fn(),
        finalizeCheck: jest.fn(async (_o: any, _c: any, conclusion: any, stage: any, reason: any) => {
            finalize.push({ conclusion, stage, reason });
        }),
    };
    const exec = {
        updateCodeReview: jest.fn().mockResolvedValue({ execution: { uuid: 'e' }, stageLog: { uuid: 's' } }),
        updateStageLog: jest.fn(), findLatestExecutionByFilters: jest.fn(), findLatestStageLog: jest.fn(),
    };
    const obs = new CodeReviewPipelineObserver(exec as any, checks as any);
    const rec = recorder();
    (obs as any).logger = rec.lg;
    const ctx = { ...context, statusInfo, pipelineMetadata: { lastExecution: { uuid: 'exec-1' } }, correlationId: 'exec-1' };
    await obs.onPipelineFinish(ctx as any, {} as any);
    return { finalize, logs: rec.calls };
};

const summarizeErrors = (errors: any[]) =>
    (errors || []).map((e) => ({
        stage: e.stage, substage: e.substage, severity: e.severity ?? null,
        errorCategory: e.metadata?.errorCategory ?? null,
        orgOwnedKey: e.metadata?.orgOwnedKey ?? null,
        metadataKeys: Object.keys(e.metadata ?? {}).sort(),
    }));

async function stageCase(name: string, opts: {
    failures?: Array<{ agentName: string; error: unknown; customAgent?: boolean }>;
    throws?: unknown; beforeOrch?: unknown; out?: Record<string, unknown>;
    ctx?: Record<string, unknown>; preErrors?: any[]; statusInfo?: any;
}) {
    const out = orchOut({
        ...(opts.out ?? {}),
        failures: (opts.failures ?? []).map((f) => ({ agentName: f.agentName, category: f.agentName, error: f.error, customAgent: f.customAgent })),
    });
    const { stage, reviewOrchestrator, rec } = makeStage({ out, throws: opts.throws }, opts.beforeOrch);
    const llmSpy = LLM.run as unknown as jest.Mock;
    const before = llmSpy.mock.calls.length;
    const ctx = makeContext(opts.ctx ?? {});
    const result = await (stage as any).executeStage(ctx);
    const errors = [...(opts.preErrors ?? []), ...(result.errors ?? [])];
    const obs = await conclude({ ...result, errors }, opts.statusInfo);
    OUT[name] = {
        errors: summarizeErrors(errors),
        conclusion: obs.finalize.map((f) => f.conclusion),
        checkStage: obs.finalize.map((f) => f.stage),
        reasonHead: obs.finalize.map((f) => (f.reason ?? '').slice(0, 300)),
        finalizeCalls: obs.finalize.length,
        orchestratorCalls: reviewOrchestrator.execute.mock.calls.length,
        llmRunCalls: llmSpy.mock.calls.length - before,
        stageLogLevels: rec.calls.filter((c) => /Agent review failed|failed/i.test(c.message ?? '')).map((c) => `${c.level}: ${c.message?.slice(0, 80)}`),
        observerLogLevels: obs.logs.filter((c) => c.level === 'error' || c.level === 'warn').map((c) => `${c.level}: ${c.message?.slice(0, 80)}`),
        canaryInNewMetadata: JSON.stringify(summarizeErrors(errors)).includes(CANARY),
        canaryInCheckReason: obs.finalize.some((f) => (f.reason ?? '').includes(CANARY)),
        lastReviewError: result.lastReviewError ? { category: result.lastReviewError.category, provider: result.lastReviewError.provider } : null,
    };
}

async function observerCase(name: string, errors: any[], statusInfo: any = { status: AutomationStatus.ERROR }) {
    const obs = await conclude({ ...makeContext(), errors }, statusInfo);
    OUT[name] = {
        conclusion: obs.finalize.map((f) => f.conclusion),
        checkStage: obs.finalize.map((f) => f.stage),
        reasonHead: obs.finalize.map((f) => (f.reason ?? '').slice(0, 400)),
        finalizeCalls: obs.finalize.length,
    };
}

const Q = (agent = 'generalist', extra: Record<string, unknown> = {}) => ({
    stage: 'AgentReviewStage', substage: `agent:${agent}`,
    error: attachClassification(q402(), classifyLLMError(q402(), 'openai_compatible') as any),
    severity: 'critical',
    metadata: { agentName: agent, category: agent, errorCategory: 'QUOTA_EXCEEDED', orgOwnedKey: true, ...extra },
});

let runSpy: jest.SpyInstance;
beforeAll(() => {
    runSpy = jest.spyOn(LLM, 'run').mockResolvedValue({ groups: [], unique: [] } as any);
});
afterAll(() => {
    runSpy.mockRestore();
    for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
    }
    fs.writeFileSync(process.env.QA_OUT as string, JSON.stringify(OUT, null, 1));
});
beforeEach(() => {
    (environment as any).API_CLOUD_MODE = true;
    clearEnv();
});

describe('qa2191 harness', () => {
    it('M13: owned quota alone, and mixed critical', async () => {
        OUT.revision_has_usesOrgOwnedKey = typeof usesOrgOwnedKey === 'function';
        await stageCase('M13.owned_quota_only', { failures: [{ agentName: 'generalist', error: q402() }] });
        await stageCase('M13.owned_quota_plus_unknown', { failures: [{ agentName: 'generalist', error: q402() }, { agentName: 'bug', error: E.unknown() }] });
        await observerCase('M13.observer_literal_Q', [Q()]);
        await observerCase('M13.observer_Q_plus_mixed', [Q(), { stage: 'AgentReviewStage', substage: 'agent:bug', error: new Error('x'), severity: 'critical', metadata: { errorCategory: 'UNKNOWN', orgOwnedKey: true } }]);
    });

    it('M14: cloud ownership', async () => {
        await stageCase('M14.cloud_no_slot', { failures: [{ agentName: 'generalist', error: q402() }], ctx: { codeReviewConfig: { reviewOptions: {} } } });
        await stageCase('M14.cloud_managed_slot_no_credential', { failures: [{ agentName: 'generalist', error: q402() }], ctx: { codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: { provider: 'openai', model: 'gpt-4o-mini' } } } });
        await stageCase('M14.kodus_credential', { failures: [{ agentName: 'generalist', error: q402() }], ctx: { codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: { provider: 'kodus', model: 'kodus-default', credentialId: 'qa-kodus-cred' } } } });
    });

    it('M15: self-hosted env ownership through the real resolver', async () => {
        const noSlot = { codeReviewConfig: { reviewOptions: {} } };
        const cases: Array<[string, Record<string, string>, boolean]> = [
            ['explicit_openai_env_key', { API_LLM_PROVIDER_MODEL: 'gpt-4o-mini', API_OPEN_AI_API_KEY: 'sk-env-test' }, false],
            ['inferred_openai_base_url', { API_LLM_PROVIDER_MODEL: 'my-model', API_OPEN_AI_API_KEY: 'sk-env-test', API_OPENAI_FORCE_BASE_URL: 'https://llm.example.internal/v1' }, false],
            ['auto_no_env', { API_LLM_PROVIDER_MODEL: 'auto' }, false],
            ['model_set_no_key', { API_LLM_PROVIDER_MODEL: 'gpt-4o-mini' }, false],
            ['invalid_declared', { API_LLM_PROVIDER: 'not-a-provider', API_LLM_PROVIDER_MODEL: 'x' }, false],
            ['vertex_adc', { API_LLM_PROVIDER_MODEL: 'gemini-2.5-pro', GOOGLE_CLOUD_PROJECT: 'qa-project' }, false],
            ['explicit_openai_env_key_cloud', { API_LLM_PROVIDER_MODEL: 'gpt-4o-mini', API_OPEN_AI_API_KEY: 'sk-env-test' }, true],
            ['vertex_adc_cloud', { API_LLM_PROVIDER_MODEL: 'gemini-2.5-pro', GOOGLE_CLOUD_PROJECT: 'qa-project' }, true],
        ];
        for (const [label, env, cloud] of cases) {
            clearEnv();
            Object.assign(process.env, env);
            (environment as any).API_CLOUD_MODE = cloud;
            let resolved: any = null;
            try {
                resolved = jest.requireActual('@libs/llm/managed-slot').resolveEnvProvider();
            } catch (e: any) {
                resolved = { threw: e?.message };
            }
            await stageCase(`M15.${label}`, { failures: [{ agentName: 'generalist', error: q402() }], ctx: noSlot });
            OUT[`M15.${label}`].envResolution = resolved ? { kind: resolved.kind, name: resolved.name, threw: resolved.threw } : null;
            OUT[`M15.${label}`].cloud = cloud;
        }
    });

    it('M16: real failover stamps decide ownership and category', async () => {
        const byokA = { provider: 'openai_compatible', model: 'byok-a', credentialId: 'cred-a', byokModelId: 'm-a' } as any;
        const byokB = { provider: 'anthropic', model: 'byok-b', credentialId: 'cred-b', byokModelId: 'm-b' } as any;
        const funded = { provider: 'kodus', model: 'kodus-default', credentialId: 'cred-k', byokModelId: 'm-k' } as any;
        const drive = async (slots: any[], errs: Array<() => unknown>) => {
            let i = 0;
            try {
                await runWithModelFailover(slots, async () => { throw errs[i++](); }, { runName: 'qa2191', organizationId: 'org-1' });
                return null;
            } catch (e) {
                return { e, attempts: i };
            }
        };
        const scenarios: Array<[string, any[], Array<() => unknown>]> = [
            ['byok_then_funded_both_402', [byokA, funded], [q402, q402]],
            ['funded_then_byok_both_402', [funded, byokA], [q402, q402]],
            ['byokA_then_byokB_both_402', [byokA, byokB], [q402, q402]],
            ['byok_402_then_funded_500', [byokA, funded], [q402, E.s500]],
            ['funded_402_then_byok_401', [funded, byokA], [q402, E.s401]],
        ];
        for (const [label, slots, errs] of scenarios) {
            const r = await drive(slots, errs);
            const ctx = { codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: slots[0] } };
            await stageCase(`M16.${label}.returned`, { failures: [{ agentName: 'generalist', error: r?.e }], ctx });
            OUT[`M16.${label}.returned`].attempts = r?.attempts;
            await stageCase(`M16.${label}.catch`, { throws: r?.e, ctx });
        }
    });

    it('M17: effective route ownership (slot shapes produced by routing)', async () => {
        const shapes: Array<[string, any]> = [
            ['web_byokModelId_slot', { provider: 'openai_compatible', model: 'x', byokModelId: 'm1', credentialId: 'c1' }],
            ['legacy_model_name_no_credential', { provider: 'openai', model: 'gpt-4o-mini' }],
            ['heavy_slot_byok', { provider: 'anthropic', model: 'claude', byokModelId: 'm-heavy', credentialId: 'c2' }],
            ['managed_default_undefined', undefined],
        ];
        for (const [label, slotShape] of shapes) {
            await stageCase(`M17.${label}`, { failures: [{ agentName: 'generalist', error: q402() }], ctx: { codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: slotShape } } });
        }
    });

    it('M18: each core agent alone and all together', async () => {
        for (const a of ['generalist', 'bug', 'security', 'performance']) {
            await stageCase(`M18.${a}_alone`, { failures: [{ agentName: a, error: q402() }] });
        }
        await stageCase('M18.all_four', { failures: ['generalist', 'bug', 'security', 'performance'].map((a) => ({ agentName: a, error: q402() })) });
    });

    it('M19: Q plus sibling critical, both orders', async () => {
        const funded402 = () => attachAttemptedSlot(q402(), { provider: 'kodus', model: 'kodus-default' } as any);
        const sib: Array<[string, () => unknown]> = [['unknown', E.unknown], ['auth401', E.s401], ['rate429', E.plain_429], ['funded_quota', funded402]];
        for (const [label, mk] of sib) {
            await stageCase(`M19.Q_then_${label}`, { failures: [{ agentName: 'generalist', error: q402() }, { agentName: 'bug', error: mk() }] });
            await stageCase(`M19.${label}_then_Q`, { failures: [{ agentName: 'generalist', error: mk() }, { agentName: 'bug', error: q402() }] });
        }
        await stageCase('M19.Q_only_control', { failures: [{ agentName: 'generalist', error: q402() }] });
    });

    it('M20: Q plus truncated / step-limit / unverified', async () => {
        const f = [{ agentName: 'generalist', error: q402() }];
        await stageCase('M20.Q_plus_truncated', { failures: f, out: { incomplete: [{ agentName: 'bug', category: 'bug', finishReason: 'truncated', durationMs: 10, suggestionsFound: 0 }] } });
        await stageCase('M20.Q_plus_step_limit', { failures: f, out: { incomplete: [{ agentName: 'security', category: 'security', finishReason: 'max-steps', durationMs: 10, suggestionsFound: 1 }] } });
        await stageCase('M20.Q_plus_unverified', { failures: f, out: { unverified: [{ agentName: 'performance', category: 'performance', unverifiedCount: 2 }] } });
        await stageCase('M20.Q_plus_kody_rules_quota_partial', { failures: [...f, { agentName: 'kody-rules', error: q402() }] });
        await stageCase('M20.Q_plus_custom_agent_quota_partial', { failures: [...f, { agentName: 'my-custom-agent', error: q402(), customAgent: true }] });
        await stageCase('M20.auxiliary_only_quota', { failures: [{ agentName: 'kody-rules', error: q402() }] });
        await stageCase('M20.auxiliary_only_quota_status_success', { failures: [{ agentName: 'kody-rules', error: q402() }], statusInfo: { status: AutomationStatus.SUCCESS } });
        await stageCase('M20.auxiliary_only_quota_status_partial', { failures: [{ agentName: 'kody-rules', error: q402() }], statusInfo: { status: AutomationStatus.PARTIAL_ERROR } });
    });

    it('M21: outer catch', async () => {
        const funded402 = () => attachAttemptedSlot(q402(), { provider: 'kodus', model: 'kodus-default' } as any);
        await stageCase('M21.throw_owned_402', { throws: q402() });
        await stageCase('M21.throw_funded_402', { throws: funded402() });
        await stageCase('M21.throw_plain_error', { throws: new Error('boom') });
        await stageCase('M21.throw_string', { throws: 'string failure' });
        await stageCase('M21.throw_string_quota_words', { throws: 'Insufficient balance' });
        await stageCase('M21.before_orchestration_402', { beforeOrch: q402() });
    });

    it('M22: classifier boundary through the stage', async () => {
        for (const [label, mk] of Object.entries(E)) {
            await stageCase(`M22.${label}`, { failures: [{ agentName: 'generalist', error: mk() }] });
        }
    });

    it('M23: attached classification, RetryError, provenance', async () => {
        const attached = attachClassification(err('Internal Server Error', { statusCode: 500 }), { category: LlmErrorCategory.QUOTA_EXCEEDED, provider: 'openai_compatible', rawMessage: 'x', friendlyMessage: 'x' } as any);
        await stageCase('M23.attached_quota_on_500', { failures: [{ agentName: 'generalist', error: attached }] });
        const attachedUnknownOn402 = attachClassification(q402(), { category: LlmErrorCategory.UNKNOWN, provider: 'openai_compatible', rawMessage: 'x', friendlyMessage: 'x' } as any);
        await stageCase('M23.attached_unknown_on_402', { failures: [{ agentName: 'generalist', error: attachedUnknownOn402 }] });
        const retry = Object.assign(new Error('Failed after 3 attempts. Last error: Insufficient balance'), { name: 'AI_RetryError', reason: 'maxRetriesExceeded', lastError: q402(), errors: [q402(), q402(), q402()] });
        await stageCase('M23.retry_error_wrapping_402', { failures: [{ agentName: 'generalist', error: retry }] });
        await stageCase('M23.plain_object_402_no_symbols', { failures: [{ agentName: 'generalist', error: { status: 402, message: 'Insufficient balance' } }] });
        await stageCase('M23.stamped_funded_no_classification', { failures: [{ agentName: 'generalist', error: attachAttemptedSlot(q402(), { provider: 'kodus', model: 'k' } as any) }] });
        await stageCase('M23.stamped_byok_no_classification', { failures: [{ agentName: 'generalist', error: attachAttemptedSlot(q402(), { provider: 'openai_compatible', model: 'qa' } as any) }] });
    });

    it('M24: executor-appended critical', async () => {
        await stageCase('M24.Q_plus_executor_critical_no_metadata', { failures: [{ agentName: 'generalist', error: q402() }], preErrors: [{ stage: 'FetchChangedFilesStage', error: new Error('stage threw'), severity: 'critical' }] });
        await stageCase('M24.executor_quota_throw_outside_agentreview', { preErrors: [{ stage: 'UpdateCommentsAndGenerateSummaryStage', error: q402() }] });
        await stageCase('M24.Q_only_control', { failures: [{ agentName: 'generalist', error: q402() }] });
    });

    it('M25: legacy metadata shapes', async () => {
        const base = { stage: 'AgentReviewStage', substage: 'agent:generalist', error: q402() };
        await observerCase('M25.no_severity_Q', [{ ...base, metadata: { errorCategory: 'QUOTA_EXCEEDED', orgOwnedKey: true } }]);
        await observerCase('M25.no_metadata', [{ ...base, severity: 'critical' }]);
        await observerCase('M25.owner_false', [{ ...base, severity: 'critical', metadata: { errorCategory: 'QUOTA_EXCEEDED', orgOwnedKey: false } }]);
        await observerCase('M25.owner_string_true', [{ ...base, severity: 'critical', metadata: { errorCategory: 'QUOTA_EXCEEDED', orgOwnedKey: 'true' } }]);
        await observerCase('M25.missing_errorCategory', [{ ...base, severity: 'critical', metadata: { orgOwnedKey: true } }]);
        await observerCase('M25.agent_category_is_QUOTA', [{ ...base, severity: 'critical', metadata: { category: 'QUOTA_EXCEEDED', orgOwnedKey: true } }]);
        await observerCase('M25.no_severity_no_metadata_plus_Q', [{ ...base }, Q()]);
    });

    it('M26: status combinations', async () => {
        await observerCase('M26.empty_errors_success', [], { status: AutomationStatus.SUCCESS });
        await observerCase('M26.status_only_error', [], { status: AutomationStatus.ERROR });
        await observerCase('M26.partial_only', [{ stage: 'X', error: new Error('p'), severity: 'partial' }], { status: AutomationStatus.SUCCESS });
        await observerCase('M26.Q_under_ERROR', [Q()], { status: AutomationStatus.ERROR });
        await observerCase('M26.Q_under_IN_PROGRESS', [Q()], { status: AutomationStatus.IN_PROGRESS });
        await observerCase('M26.Q_under_SUCCESS', [Q()], { status: AutomationStatus.SUCCESS });
        await observerCase('M26.Q_under_PARTIAL_ERROR', [Q()], { status: AutomationStatus.PARTIAL_ERROR });
    });

    it('M27: invalid-license skip control', async () => {
        const { stage, reviewOrchestrator } = makeStage({ out: orchOut() });
        await observerCase('M27.license_skip', [], { status: AutomationStatus.SKIPPED, message: 'User does not have a valid license' });
        OUT['M27.license_skip'].orchestratorCalls = reviewOrchestrator.execute.mock.calls.length;
        void stage;
    });

    it('M28: summary failure filter', async () => {
        const S = { stage: 'UpdateCommentsAndGenerateSummaryStage', error: new Error('Failed to generate summary'), severity: 'partial', metadata: { reason: SUMMARY_GENERATION_FAILED_REASON } };
        await observerCase('M28.Q_plus_summary', [Q(), S]);
        await observerCase('M28.summary_alone', [S], { status: AutomationStatus.SUCCESS });
        await observerCase('M28.summary_plus_partial', [S, { stage: 'X', error: new Error('p'), severity: 'partial' }], { status: AutomationStatus.SUCCESS });
        await observerCase('M28.summary_plus_critical', [S, { stage: 'X', error: new Error('c'), severity: 'critical' }]);
    });

    it('M33: canaries', async () => {
        const e = err(`Insufficient balance for key ${CANARY}`, { status: 402, requestBodyValues: { apiKey: CANARY }, responseHeaders: { authorization: `Bearer ${CANARY}` } });
        await stageCase('M33.canary_in_slot_and_error', { failures: [{ agentName: 'generalist', error: e }] });
        await stageCase('M33.canary_in_slot_only', { failures: [{ agentName: 'generalist', error: q402() }] });
    });

    it('M34: sizes', async () => {
        const many = Array.from({ length: 100 }, (_, i) => Q('generalist', { i }));
        many.forEach((m, i) => (m.error = attachClassification(err(`Insufficient balance #${i} — ünïcødé 配额`, { status: 402 }), classifyLLMError(q402(), 'openai_compatible') as any)));
        await observerCase('M34.hundred_Q', many);
        await observerCase('M34.hundred_Q_tail_critical', [...many, { stage: 'X', error: new Error('tail critical'), severity: 'critical' }]);
        await observerCase('M34.hundred_Q_tail_partial', [...many, { stage: 'X', error: new Error('tail partial'), severity: 'partial' }]);
    });

    it('M35: empty changed files vs one', async () => {
        await stageCase('M35.empty_changed_files', { failures: [{ agentName: 'generalist', error: q402() }], ctx: { changedFiles: [] } });
        await stageCase('M35.empty_changed_files_status_success', { failures: [{ agentName: 'generalist', error: q402() }], ctx: { changedFiles: [] }, statusInfo: { status: AutomationStatus.SUCCESS } });
        await stageCase('M35.one_changed_file', { failures: [{ agentName: 'generalist', error: q402() }] });
    });


    it('M8h: primary 402 then successful fallback', async () => {
        const byokA = { provider: 'openai_compatible', model: 'quota-a', credentialId: 'cred-a', byokModelId: 'm-a' } as any;
        const fb = { provider: 'openai_compatible', model: 'deepseek', credentialId: 'cred-d', byokModelId: 'm-d' } as any;
        for (const [label, suggestions] of [['clean', []], ['one_finding', [{ id: 's1', relevantFile: 'src/user.ts', suggestionContent: 'x', label: 'bug', severity: 'high' }]]] as const) {
            const seen: string[] = [];
            const value = await runWithModelFailover([byokA, fb], async (slot: any) => {
                seen.push(slot.model);
                if (slot.model === 'quota-a') throw q402();
                return 'ok';
            }, { runName: 'qa2191-m8', organizationId: 'org-1' });
            await stageCase(`M8h.${label}`, { out: { suggestions: [...suggestions] }, ctx: { codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: byokA } }, statusInfo: { status: AutomationStatus.SUCCESS } });
            OUT[`M8h.${label}`].failoverAttempts = seen;
            OUT[`M8h.${label}`].failoverValue = value;
        }
    });

    it('M6h: in-process interleave of an owned and a funded org', async () => {
        const fundedCtx = { organizationAndTeamData: { organizationId: 'org-B', teamId: 't-B' }, codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: { provider: 'kodus', model: 'k', credentialId: 'ck' } } };
        const slow = (ms: number, e: unknown) => new Promise((r) => setTimeout(() => r(e), ms));
        const runOne = async (name: string, delay: number, ctx: Record<string, unknown>) => {
            const e = await slow(delay, q402());
            const t0 = new Date().toISOString();
            await stageCase(name, { failures: [{ agentName: 'generalist', error: e }], ctx });
            OUT[name].startedAt = t0;
            OUT[name].endedAt = new Date().toISOString();
        };
        await Promise.all([runOne('M6h.A_owned_slow', 30, {}), runOne('M6h.B_funded_fast', 5, fundedCtx)]);
        await Promise.all([runOne('M6h.A_owned_fast', 5, {}), runOne('M6h.B_funded_slow', 30, fundedCtx)]);
    });
});
