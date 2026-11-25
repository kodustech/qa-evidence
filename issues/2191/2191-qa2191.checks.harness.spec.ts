/* QA harness for #2191: real observer -> real PipelineChecksService -> real
 * ChecksAdapterFactory -> real GithubChecksService / ForgejoChecksService /
 * NullChecksAdapter. Only the provider SDK transport is stubbed. Records to QA_OUT. */
import * as fs from 'fs';
import { PipelineChecksService } from './pipeline-checks.service';
import { ChecksAdapterFactory } from './checks-adapter.factory';
import { NullChecksAdapter } from './null-checks.adapter';
import { GithubChecksService } from '@libs/platform/infrastructure/adapters/services/github/github-checks.service';
import { ForgejoChecksService } from '@libs/platform/infrastructure/adapters/services/forgejo/forgejo-checks.service';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';
import { AutomationStatus } from '@libs/automation/domain/automation/enum/automation-status';
import { classifyLLMError, attachClassification } from '@libs/llm/error-classifier';

const forgejoCalls: any[] = [];
jest.mock('@llamaduck/forgejo-ts', () => {
    const actual = jest.requireActual('@llamaduck/forgejo-ts');
    return { ...actual, repoCreateStatus: jest.fn(async (req: any) => { forgejoCalls.push(req.body); return { data: {} }; }) };
});

const OUT: Record<string, any> = {};
afterAll(() => fs.writeFileSync(process.env.QA_OUT as string, JSON.stringify(OUT, null, 1)));

const q402 = () => Object.assign(new Error('Insufficient balance'), { status: 402 });
const Q = (agent = 'generalist') => ({
    stage: 'AgentReviewStage', substage: `agent:${agent}`,
    error: attachClassification(q402(), classifyLLMError(q402(), 'openai_compatible') as any),
    severity: 'critical',
    metadata: { agentName: agent, category: agent, errorCategory: 'QUOTA_EXCEEDED', orgOwnedKey: true },
});

const build = (githubAuthMode: string, updateImpl?: jest.Mock) => {
    const octoUpdate = updateImpl ?? jest.fn(async () => ({}));
    const gitHubService = {
        getGithubAuthDetails: jest.fn(async () => ({ authMode: githubAuthMode })),
        getAuthenticatedOctokit: jest.fn(async () => ({ checks: { update: octoUpdate, create: jest.fn(async () => ({ data: { id: 1 } })) } })),
        getGithubAppId: jest.fn(() => '123'),
    };
    const forgejoService = {
        getAuthDetails: jest.fn(async () => ({ host: 'https://forgejo.example', token: 'x' })),
        createForgejoClient: jest.fn(() => ({})),
    };
    const nullAdapter = new NullChecksAdapter();
    const nullSpy = jest.spyOn(nullAdapter, 'updateCheckRun');
    const factory = new ChecksAdapterFactory(new GithubChecksService(gitHubService as any), new ForgejoChecksService(forgejoService as any), nullAdapter);
    const checks = new PipelineChecksService(factory);
    const exec = {
        updateCodeReview: jest.fn().mockResolvedValue({ execution: { uuid: 'e' }, stageLog: { uuid: 's' } }),
        updateStageLog: jest.fn(), findLatestExecutionByFilters: jest.fn(), findLatestStageLog: jest.fn(),
    };
    const observer = new CodeReviewPipelineObserver(exec as any, checks);
    return { observer, octoUpdate, gitHubService, nullSpy };
};

const ctx = (platformType: string, errors: any[]) => ({
    organizationAndTeamData: { organizationId: 'org-1', teamId: 'team-1' },
    repository: { id: 'r', name: 'claude-athena', fullName: 'kodus/claude-athena' },
    pullRequest: { number: 7, head: { sha: 'abc123' } },
    platformType,
    errors,
    statusInfo: { status: AutomationStatus.ERROR },
    pipelineMetadata: { lastExecution: { uuid: 'exec-1' } },
    correlationId: 'exec-1',
});

describe('qa2191 checks harness', () => {
    it('M29: GitHub App vs TOKEN vs missing check id', async () => {
        for (const mode of ['oauth', 'token']) {
            const { observer, octoUpdate, gitHubService } = build(mode);
            const oc: any = { checkRunId: 4242 };
            await observer.onPipelineFinish(ctx('GITHUB', [Q()]) as any, oc);
            OUT[`M29.github_${mode}`] = {
                octokitUpdateCalls: octoUpdate.mock.calls.map((c: any[]) => ({ conclusion: c[0].conclusion, status: c[0].status, title: c[0].output?.title, summary: (c[0].output?.summary ?? '').slice(0, 200) })),
                octokitAcquired: gitHubService.getAuthenticatedOctokit.mock.calls.length,
                checkRunIdAfter: oc.checkRunId ?? null,
            };
        }
        const { observer, octoUpdate } = build('oauth');
        await observer.onPipelineFinish(ctx('GITHUB', [Q()]) as any, {} as any);
        OUT['M29.github_app_missing_check_id'] = { octokitUpdateCalls: octoUpdate.mock.calls.length };
    });

    it('M30/M3h: Forgejo, GitLab, Bitbucket, Azure', async () => {
        forgejoCalls.length = 0;
        const { observer } = build('oauth');
        await observer.onPipelineFinish(ctx('FORGEJO', [Q()]) as any, { checkRunId: 'sha:abc123' } as any);
        OUT['M30.forgejo'] = forgejoCalls.map((b) => ({ state: b.state, context: b.context, description: b.description }));
        for (const p of ['GITLAB', 'BITBUCKET', 'AZURE_REPOS']) {
            const b = build('oauth');
            let threw: string | null = null;
            const oc: any = { checkRunId: 'x' };
            try {
                await b.observer.onPipelineFinish(ctx(p, [Q()]) as any, oc);
            } catch (e: any) {
                threw = e?.message;
            }
            OUT[`M30.${p}`] = { nullAdapterUpdateCalls: b.nullSpy.mock.calls.map((c: any[]) => c[0].conclusion), octokitUpdates: b.octoUpdate.mock.calls.length, threw };
        }
    });

    it('M42: CLI-shaped context (no PR head, no platform)', async () => {
        for (const [label, errs] of [['quota', [Q()]], ['success', []]] as const) {
            const b = build('oauth');
            forgejoCalls.length = 0;
            const c: any = { ...ctx(undefined as any, [...errs]), pullRequest: undefined, repository: { id: 'r', name: 'cli' }, platformType: undefined, statusInfo: { status: errs.length ? AutomationStatus.ERROR : AutomationStatus.SUCCESS } };
            let threw: string | null = null;
            try { await b.observer.onPipelineFinish(c, {} as any); } catch (e: any) { threw = e?.message; }
            OUT[`M42.cli_${label}`] = { octokitUpdates: b.octoUpdate.mock.calls.length, nullAdapterCalls: b.nullSpy.mock.calls.length, forgejoCalls: forgejoCalls.length, threw };
        }
    });

    it('M32: provider finalization rejects once / returns false, then next review', async () => {
        const upd = jest.fn().mockRejectedValueOnce(new Error('GitHub 502')).mockResolvedValue({});
        const { observer } = build('oauth', upd);
        const oc1: any = { checkRunId: 1 };
        let threw1: string | null = null;
        try { await observer.onPipelineFinish(ctx('GITHUB', [Q()]) as any, oc1); } catch (e: any) { threw1 = e?.message; }
        const oc2: any = { checkRunId: 2 };
        await observer.onPipelineFinish(ctx('GITHUB', [Q()]) as any, oc2);
        OUT['M32.reject_then_next'] = {
            firstRunThrew: threw1, firstRunCheckRunIdAfter: oc1.checkRunId ?? null,
            calls: upd.mock.calls.map((c: any[]) => ({ id: c[0].check_run_id, conclusion: c[0].conclusion })),
            secondRunCheckRunIdAfter: oc2.checkRunId ?? null,
        };
        const tok = build('token');
        const oc3: any = { checkRunId: 3 };
        await tok.observer.onPipelineFinish(ctx('GITHUB', [Q()]) as any, oc3);
        OUT['M32.adapter_returns_false_token'] = { checkRunIdAfter: oc3.checkRunId ?? null, note: 'finalizeCheck ignores the false return and clears the id' };
    });
});
