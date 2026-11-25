/* QA worker-process harness for #2191 (M6). One OS process per "worker" (the
 * launcher starts several of these jest processes at once). Each runs the real
 * observer start -> real AgentReviewStage (orchestrator answers after a delay with
 * a 402 failure) -> real observer finish -> real PipelineChecksService -> real
 * ChecksAdapterFactory -> real ForgejoChecksService, posting real commit statuses
 * to Codeberg kodus/claude-athena on the SHA given. Only the LLM boundary and
 * the Forgejo auth lookup are stubbed (token comes from env, never printed). */
import * as fs from 'fs';
import { createClient } from '@llamaduck/forgejo-ts/client';
import { frozenContext } from '../../../../test/fixtures/frozen-pipeline-context';
import { AgentReviewStage } from './agent-review.stage';
import { CodeReviewPipelineObserver } from '../../infrastructure/observers/code-review-pipeline.observer';
import { PipelineChecksService } from '@libs/core/infrastructure/pipeline/services/pipeline-checks.service';
import { ChecksAdapterFactory } from '@libs/core/infrastructure/pipeline/services/checks-adapter.factory';
import { NullChecksAdapter } from '@libs/core/infrastructure/pipeline/services/null-checks.adapter';
import { GithubChecksService } from '@libs/platform/infrastructure/adapters/services/github/github-checks.service';
import { ForgejoChecksService } from '@libs/platform/infrastructure/adapters/services/forgejo/forgejo-checks.service';
import { LLM } from '@libs/llm/llm';
import { AutomationStatus } from '@libs/automation/domain/automation/enum/automation-status';

jest.mock('@libs/code-review/infrastructure/agents/engine/classify-severity', () => ({ classifySeverity: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@libs/code-review/infrastructure/agents/engine/format-suggestion-content', () => ({ formatSuggestionContent: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@libs/ee/configs/environment', () => ({ environment: { API_CLOUD_MODE: true } }));

jest.setTimeout(120000);
const KIND = process.env.QA_KIND as 'owned' | 'funded';
const SHA = process.env.QA_SHA as string;
const DELAY = Number(process.env.QA_DELAY_MS ?? '0');
const OUTF = process.env.QA_OUT as string;
const ts = () => new Date().toISOString();

it(`proc ${KIND} ${SHA?.slice(0, 8)}`, async () => {
    jest.spyOn(LLM, 'run').mockResolvedValue({ groups: [], unique: [] } as any);
    const rec: any = { kind: KIND, sha: SHA, pid: process.pid, events: [] as any[] };
    const forgejoService = {
        getAuthDetails: async () => ({ host: 'https://codeberg.org' }),
        createForgejoClient: () => createClient({ baseURL: 'https://codeberg.org/api/v1', headers: { Authorization: `token ${process.env.QA_FJ_TOKEN}` } }),
    };
    const factory = new ChecksAdapterFactory(new GithubChecksService({} as any), new ForgejoChecksService(forgejoService as any), new NullChecksAdapter());
    const checks = new PipelineChecksService(factory);
    const origFinalize = checks.finalizeCheck.bind(checks);
    (checks as any).finalizeCheck = async (...a: any[]) => {
        rec.events.push({ at: ts(), ev: 'finalize', conclusion: a[2], stage: a[3] });
        return origFinalize(...(a as [any, any, any, any, any]));
    };
    const exec = { updateCodeReview: jest.fn().mockResolvedValue({ execution: { uuid: 'e' }, stageLog: { uuid: 's' } }), updateStageLog: jest.fn(), findLatestExecutionByFilters: jest.fn(), findLatestStageLog: jest.fn() };
    const observer = new CodeReviewPipelineObserver(exec as any, checks);
    const slot = KIND === 'owned'
        ? { provider: 'openai_compatible', model: 'quota-a', credentialId: 'cred-a', byokModelId: 'm-a' }
        : { provider: 'kodus', model: 'kodus-default', credentialId: 'cred-k', byokModelId: 'm-k' };
    const base = frozenContext({
        organizationAndTeamData: { organizationId: KIND === 'owned' ? 'org-A' : 'org-B', teamId: 't' },
        repository: { id: '2929808', name: 'claude-athena', fullName: 'kodus/claude-athena' },
        pullRequest: { number: 99, head: { sha: SHA } },
        platformType: 'FORGEJO',
        changedFiles: [{ filename: 'qa2191/x.ts' }],
        codeReviewConfig: { reviewOptions: {}, resolvedModelSlot: slot },
        validSuggestions: [], discardedSuggestions: [], errors: [],
        pipelineMetadata: { lastExecution: { uuid: `exec-${KIND}` } }, correlationId: `exec-${KIND}`,
    }) as any;
    const oc: any = {};
    rec.events.push({ at: ts(), ev: 'start' });
    await observer.onPipelineStart(base, oc);
    rec.events.push({ at: ts(), ev: 'started', checkRunId: oc.checkRunId });
    const orchestrator = { execute: jest.fn(async () => {
        await new Promise((r) => setTimeout(r, DELAY));
        rec.events.push({ at: ts(), ev: 'llm-402' });
        return { suggestions: [], agentResults: [], failures: [{ agentName: 'generalist', category: 'generalist', error: Object.assign(new Error('Insufficient balance'), { status: 402 }) }], incomplete: [], unverified: [], warnings: [] };
    }) };
    const stage = new AgentReviewStage(
        { findLatestStageLog: jest.fn(), updateCodeReview: jest.fn(), updateStageLog: jest.fn() } as any,
        { findByExternalId: jest.fn().mockResolvedValue(null) } as any,
        orchestrator as any,
        { runLLMInSpan: jest.fn(async ({ runFn }: any) => runFn?.()) } as any,
        { generateContext: jest.fn(), generateContextLegacy: jest.fn().mockResolvedValue('') } as any,
        { isEnabled: jest.fn().mockResolvedValue(false) } as any,
        { getReleaseTrack: jest.fn().mockResolvedValue('stable') } as any,
        { getRepositories: jest.fn().mockResolvedValue([]), getCloneParams: jest.fn().mockResolvedValue(null) } as any,
    );
    const result = await (stage as any).executeStage(base);
    rec.errors = (result.errors ?? []).map((e: any) => ({ substage: e.substage, errorCategory: e.metadata?.errorCategory, orgOwnedKey: e.metadata?.orgOwnedKey }));
    await observer.onPipelineFinish({ ...result, statusInfo: { status: AutomationStatus.ERROR } }, oc);
    rec.events.push({ at: ts(), ev: 'finished', checkRunIdAfter: oc.checkRunId ?? null });
    fs.writeFileSync(OUTF, JSON.stringify(rec, null, 1));
});
