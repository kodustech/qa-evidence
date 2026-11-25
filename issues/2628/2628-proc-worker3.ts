/* Paid local review (M14/M16/M19): real CreateSandboxStage + real AgentReviewStage + REAL ReviewOrchestratorService
 * with the REAL GeneralistAgentProvider on DeepSeek V4.1 Flash (Fireworks, BYOK slot) + real lease manager on the
 * disposable Mongo + the real sandbox provider of the mode (E2BSandboxService / LocalSandboxService / NullSandboxProvider)
 * + real pipeline observer. Only publication is absent. Roles: e2b-kill-after-stage, e2b-kill-during-orchestrator, local, null. */
import 'reflect-metadata';
import * as fs from 'fs';
import mongoose from 'mongoose';
import { Test } from '@nestjs/testing';
import { encrypt } from '@libs/common/utils/crypto';
import { handlePatchDeletions, convertToUnifiedDiffWithLineNumbers } from '@libs/common/utils/patch';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { E2BSandboxService } from '@libs/sandbox/infrastructure/providers/e2b-sandbox.service';
import { LocalSandboxService } from '@libs/sandbox/infrastructure/providers/local-sandbox.service';
import { NullSandboxProvider } from '@libs/sandbox/infrastructure/providers/null-sandbox.service';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { AgentReviewStage } from '@libs/code-review/pipeline/stages/agent-review.stage';
import { ReviewOrchestratorService } from '@libs/code-review/infrastructure/agents/review-orchestrator.service';
import { GeneralistAgentProvider } from '@libs/code-review/infrastructure/agents/providers/generalist-agent.provider';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';
import { ObservabilityService } from '@libs/core/log/observability.service';
import { AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@libs/automation/domain/automationExecution/contracts/automation-execution.service';
import { GraphContextService } from '@libs/code-review/infrastructure/adapters/services/graph/graph-context.service';
import { FeatureGateService } from '@libs/feature-gate';
import { ORGANIZATION_SERVICE_TOKEN } from '@libs/organization/domain/organization/contracts/organization.service.contract';
import { REPOSITORY_SERVICE_TOKEN } from '@libs/code-review/domain/contracts/RepositoryService.contract';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { PlatformType } from '@libs/core/domain/enums';
import { CodeReviewVersion } from '@libs/core/domain/enums/code-review.enum';

const [, , , role] = process.argv;
const REV = process.env.H_REV!;
const ORG = '77777777-2628-4aaa-8bbb-000000000007';
const PR = 2;
const PRKEY = `${ORG}:athena-${REV}-${role}:${PR}`;
const out = (event: string, data: any = {}) => { const l = JSON.stringify({ rev: REV, role, pid: process.pid, event, at: new Date().toISOString(), ...data }); fs.appendFileSync(process.env.H_OUT!, l + '\n'); console.log(l); };
const cfg = { get: (k: string) => process.env[k] } as any;
const fn = (v: any = undefined) => async () => v;

(async () => {
    const fx = JSON.parse(fs.readFileSync(process.env.H_FIXTURE!, 'utf8'));
    const slot: any = { provider: 'openai_compatible', model: 'accounts/fireworks/models/deepseek-v4p1-flash', baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: encrypt(process.env.QA_FW_KEY!), reasoningEffort: 'medium' };
    delete process.env.QA_FW_KEY;
    const conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_paid_${REV}?directConnection=true`);
    const leaseModel = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    const leaseRepo = new SandboxLeaseRepository(leaseModel as any);
    const leaseDoc = async () => { const d: any = await leaseModel.findById(PRKEY).lean(); return d ? { leaseCount: d.leaseCount, killAt: d.killAt ?? null, sandboxId: d.sandboxId, state: d.state } : null; };
    const provider = role.startsWith('e2b') ? new E2BSandboxService(cfg) : role === 'local' ? new LocalSandboxService(cfg) : new NullSandboxProvider();
    const mgr = new SandboxLeaseManager(provider as any, leaseRepo, cfg);
    const perm: any = { resolveTaskSlot: async () => slot, validateBYOKPermission: async () => true };
    const obsStub: any = { runInSpan: (_n: string, f: any) => f(), recordAgentRunUsage: () => undefined, runAiSdkLLMInSpan: undefined };
    const generalist = new GeneralistAgentProvider(perm, obsStub);
    const orchestrator = new ReviewOrchestratorService(generalist as any, generalist as any, generalist as any, generalist as any);
    const origExec = orchestrator.execute.bind(orchestrator);
    (orchestrator as any).execute = async (input: any) => { out('orchestrator-start'); try { return await origExec(input); } finally { out('orchestrator-returned'); } };
    const mod = await Test.createTestingModule({ providers: [
        AgentReviewStage,
        { provide: ReviewOrchestratorService, useValue: orchestrator },
        { provide: ObservabilityService, useValue: obsStub },
        { provide: AUTOMATION_EXECUTION_SERVICE_TOKEN, useValue: { updateCodeReview: fn(), findLatestStageLog: fn(), updateStageLog: fn() } },
        { provide: GraphContextService, useValue: { generateContext: fn(''), generateContextLegacy: fn('') } },
        { provide: REPOSITORY_SERVICE_TOKEN, useValue: { findOrCreate: fn(), findByExternalId: fn(), updateStatus: fn() } },
        { provide: FeatureGateService, useValue: { isEnabled: fn(false) } },
        { provide: ORGANIZATION_SERVICE_TOKEN, useValue: { getReleaseTrack: fn('beta') } },
        { provide: CodeManagementService, useValue: { getRepositories: fn([]), getCloneParams: fn(null) } },
    ] }).compile();
    const stage = mod.get(AgentReviewStage);
    const anyFn: any = new Proxy({}, { get: () => async () => undefined });
    const observer = new CodeReviewPipelineObserver(anyFn, anyFn);
    const create = new CreateSandboxStage(mgr as any, { resolve: async () => ({ url: 'https://github.com/kodus-olimpo/codex-athena', authToken: process.env.QA_GH_TOKEN, platform: 'github', branch: 'qa-2628-f', prNumber: PR, baseBranch: 'main' }) } as any);
    const changedFiles = fx.files.filter((f: any) => !f.filename.startsWith('qa2628/custom/')).map((f: any) => ({ ...f, patchWithLinesStr: convertToUnifiedDiffWithLineNumbers(handlePatchDeletions(f.patch, f.filename, f.status), f) }));
    const ctx: any = { organizationAndTeamData: { organizationId: ORG, teamId: 'qa2628-team' }, repository: { id: `athena-${REV}-${role}`, name: 'codex-athena', fullName: 'kodus-olimpo/codex-athena', defaultBranch: 'main' }, branch: 'qa-2628-f', pullRequest: { number: PR, title: 'qa-2628: enrollment waitlist and late enrollment', body: '', head: { sha: fx.headSha, ref: 'qa-2628-f' }, base: { repo: { fullName: 'kodus-olimpo/codex-athena' }, ref: 'main', sha: fx.baseSha }, repository: {}, isDraft: false, stats: { total_additions: 38, total_deletions: 3, total_files: changedFiles.length, total_lines_changed: 41 } }, teamAutomationId: 'ta', origin: 'github', action: 'opened', platformType: PlatformType.GITHUB, codeReviewConfig: { codeReviewVersion: CodeReviewVersion.V3_AGENT, reviewOptions: { bug: true, security: true, performance: true }, languageResultPrompt: 'en-US' }, changedFiles, preparedFileContexts: [], validSuggestions: [], discardedSuggestions: [], correlationId: `qa2628-${role}`, statusInfo: { status: 'success' } };
    const t0 = Date.now();
    const c1 = await (create as any).executeStage(ctx);
    out('sandbox', { type: c1.sandboxHandle?.type, sandboxId: c1.sandboxHandle?.sandboxId, lease: await leaseDoc() });
    if (role === 'e2b-kill-during-orchestrator') setTimeout(() => out('ready-to-kill-during-orchestrator'), 15_000);
    const c2 = await (stage as any).executeStage(c1);
    const suggestions = (c2.validSuggestions ?? []).length || (c2.fileAnalysisResults ?? []).reduce((n: number, f: any) => n + (f.analysis?.codeSuggestions?.length ?? 0), 0);
    out('stage-done', { ms: Date.now() - t0, lease: await leaseDoc(), usage: c1.sandboxHandle?.usage?.() ?? null, suggestions, files: (c2.validSuggestions ?? []).map((s: any) => `${s.relevantFile}:${s.relevantLinesStart}`), errors: (c2.errors ?? []).map((e: any) => String(e.error?.message ?? e.error).slice(0, 160)), localDirExists: role === 'local' ? fs.existsSync(c1.sandboxHandle?.sandboxId ?? '') : undefined });
    if (role === 'e2b-kill-after-stage') { out('publishing'); await new Promise(() => {}); }
    await new Promise((r) => setTimeout(r, 1500)); // publication stands here
    await observer.onPipelineFinish(c2, {} as any);
    out('pipeline-finished', { lease: await leaseDoc(), localDirExists: role === 'local' ? fs.existsSync(c1.sandboxHandle?.sandboxId ?? '') : undefined, usage: c1.sandboxHandle?.usage?.() ?? null });
    process.exit(0);
})().catch((e) => { out('error', { error: String(e?.stack ?? e).slice(0, 900) }); process.exit(2); });
