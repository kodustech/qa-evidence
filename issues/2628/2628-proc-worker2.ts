/* M13 v2 worker: the real AutomationCodeReviewService (advisory lock, IN_PROGRESS gate, heartbeat,
 * completion write) on a disposable Postgres, running the real CreateSandboxStage + real AgentReviewStage
 * (real ReviewOrchestratorService; agent providers stubbed, no LLM) + real lease manager on the disposable
 * Mongo + real pipeline observer. Roles: review-A (killed during publication), review-B, watchdog, lease-reaper, read. */
import 'reflect-metadata';
for (const k of Object.keys(process.env)) if (/(_API_KEY|OPENAI|ANTHROPIC|FIREWORKS|TOGETHER|OPENROUTER|GOOGLE|NOVITA)/.test(k)) delete process.env[k];
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import mongoose from 'mongoose';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { SandboxLeaseManager } from '@libs/sandbox/infrastructure/services/sandbox-lease-manager.service';
import { SandboxLeaseReaperService } from '@libs/sandbox/infrastructure/services/sandbox-lease-reaper.service';
import { SandboxLeaseRepository } from '@libs/sandbox/infrastructure/repositories/sandbox-lease.repository';
import { SandboxLeaseSchema } from '@libs/sandbox/infrastructure/repositories/schemas/sandbox-lease.model';
import { CreateSandboxStage } from '@libs/code-review/pipeline/stages/create-sandbox.stage';
import { AgentReviewStage } from '@libs/code-review/pipeline/stages/agent-review.stage';
import { ReviewOrchestratorService } from '@libs/code-review/infrastructure/agents/review-orchestrator.service';
import { CodeReviewPipelineObserver } from '@libs/code-review/infrastructure/observers/code-review-pipeline.observer';
import { ObservabilityService } from '@libs/core/log/observability.service';
import { AUTOMATION_EXECUTION_SERVICE_TOKEN } from '@libs/automation/domain/automationExecution/contracts/automation-execution.service';
import { GraphContextService } from '@libs/code-review/infrastructure/adapters/services/graph/graph-context.service';
import { FeatureGateService } from '@libs/feature-gate';
import { ORGANIZATION_SERVICE_TOKEN } from '@libs/organization/domain/organization/contracts/organization.service.contract';
import { REPOSITORY_SERVICE_TOKEN } from '@libs/code-review/domain/contracts/RepositoryService.contract';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { AutomationExecutionRepository } from '@libs/automation/infrastructure/adapters/repositories/automationExecution.repository';
import { AutomationExecutionModel } from '@libs/automation/infrastructure/adapters/repositories/schemas/automationExecution.model';
import { CodeReviewExecutionRepository } from '@libs/automation/infrastructure/adapters/repositories/codeReviewExecution.repository';
import { CodeReviewExecutionModel } from '@libs/automation/infrastructure/adapters/repositories/schemas/codeReviewExecution.model';
import { CodeReviewExecutionService } from '@libs/automation/infrastructure/adapters/services/codeReviewExecution.service';
import { AutomationExecutionService } from '@libs/automation/infrastructure/adapters/services/automationExecution.service';
import { AutomationCodeReviewService } from '@libs/automation/infrastructure/adapters/services/processAutomation/strategies/automationCodeReview';
import { DistributedLockService } from '@libs/core/workflow/infrastructure/distributed-lock.service';
import { PlatformType } from '@libs/core/domain/enums';
import { CodeReviewVersion } from '@libs/core/domain/enums/code-review.enum';

const [, , , role, prArg] = process.argv;
const REV = process.env.H_REV!;
const PR = Number(prArg);
const ORG = '66666666-2628-4fff-8fff-000000000006', TEAM = '66666666-2628-4fff-8fff-000000000007', TA = '66666666-2628-4fff-8fff-000000000009';
const REPO = `rq13${REV}`;
const PRKEY = `${ORG}:${REPO}:${PR}`;
const out = (event: string, data: any = {}) => { const l = JSON.stringify({ rev: REV, pid: process.pid, role, event, at: new Date().toISOString(), ...data }); fs.appendFileSync(process.env.H_OUT!, l + '\n'); console.log(l); };
const cfg = { get: (k: string) => (k === 'API_E2B_KEY' ? 'test-key' : undefined) } as any;
const fn = (v: any = undefined) => async () => v;

(async () => {
    const WT = process.env.H_WT!;
    const files = execSync(`grep -rl "@Entity(" libs --include='*.ts' | grep -v spec`, { cwd: WT }).toString().trim().split('\n');
    const entities = files.flatMap((f) => Object.values(require(path.join(WT, f))).filter((v: any) => typeof v === 'function'));
    const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 55433, username: 'postgres', password: 'qa2628', database: 'qa2628', entities: entities as any, synchronize: false });
    await ds.initialize();
    const conn = await mongoose.connect(`mongodb://localhost:57017/qa2628_m13v2_${REV}?directConnection=true`);
    const leaseModel = conn.model('SandboxLeaseModel', SandboxLeaseSchema);
    const leaseRepo = new SandboxLeaseRepository(leaseModel as any);
    const aeSvc = new AutomationExecutionService(new AutomationExecutionRepository(ds.getRepository(AutomationExecutionModel)) as any, new CodeReviewExecutionService(new CodeReviewExecutionRepository(ds.getRepository(CodeReviewExecutionModel)) as any) as any, new EventEmitter2());
    const lock = new DistributedLockService(ds);
    const leaseDoc = async () => { const d: any = await leaseModel.findById(PRKEY).lean(); return d ? { leaseCount: d.leaseCount, killAt: d.killAt ?? null, expiresAt: d.expiresAt, sandboxId: d.sandboxId } : null; };
    const execRows = async () => ds.query(`select uuid, status, "createdAt", "updatedAt", left(coalesce("errorMessage",''),120) as err from automation_execution where "repositoryId"=$1 and "pullRequestNumber"=$2 order by "createdAt"`, [REPO, PR]);

    if (role === 'read') { out('state', { lease: await leaseDoc(), executions: await execRows() }); process.exit(0); }
    if (role === 'lease-reaper') {
        const reaper = new SandboxLeaseReaperService(leaseRepo, { acquire: async () => ({ release: async () => undefined }) } as any, cfg);
        await reaper.reapExpiredLeases(); await reaper.killIdleSandboxes();
        out('lease-reaper-ran', { lease: await leaseDoc() }); process.exit(0);
    }
    if (role === 'watchdog') {
        const { StaleReviewWatchdogCronProvider } = require(path.join(WT, 'apps/api/src/cron/staleReviewWatchdog.cron'));
        const anyFn: any = new Proxy({}, { get: () => async () => undefined });
        const wd = new StaleReviewWatchdogCronProvider(aeSvc, { getAdapter: () => anyFn, create: () => anyFn } as any, lock);
        await wd.handleCron();
        out('watchdog-ran', { executions: await execRows() }); process.exit(0);
    }

    // review roles
    const provider = { isAvailable: () => true, createSandboxWithRepo: async () => ({ type: 'e2b', sandboxId: `sbx-m13-${REV}-${Date.now()}`, repoDir: '/r', baseBranch: 'main', remoteCommands: { read: async (p: string) => `file ${p}`, grep: async () => '', listDir: async () => '' }, cleanup: async () => undefined, run: async () => ({ stdout: '', stderr: '', exitCode: 0 }), readFile: async (p: string) => `file ${p}`, writeFile: async () => undefined }) };
    const mgr = new SandboxLeaseManager(provider as any, leaseRepo, cfg);
    const generalist = { execute: async (inp: any) => { await inp.remoteCommands.read('policy.ts', 1, 5); out('agent-read-done'); return { agentName: 'generalist', suggestions: [{ relevantFile: 'a.ts', suggestionContent: 'bug', label: 'bug', severity: 'high', relevantLinesStart: 1, relevantLinesEnd: 1 }], turnsUsed: 1, durationMs: 1 }; } };
    const empty = { execute: async () => ({ agentName: 'x', suggestions: [], turnsUsed: 0, durationMs: 0 }) };
    const orchestrator = new ReviewOrchestratorService(empty as any, empty as any, empty as any, generalist as any);
    const mod = await Test.createTestingModule({ providers: [
        AgentReviewStage,
        { provide: ReviewOrchestratorService, useValue: orchestrator },
        { provide: ObservabilityService, useValue: { runInSpan: (_n: string, f: any) => f(), recordAgentRunUsage: () => undefined } },
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
    const handler = {
        handlePullRequest: async (orgTeam: any, repository: any, branch: any, pullRequest: any, platformType: any, teamAutomationId: any, origin: any, action: any, executionUuid: string) => {
            out('pipeline-start', { executionUuid });
            const create = new CreateSandboxStage(mgr as any, { resolve: async () => ({ url: 'https://example.invalid/r', platform: 'github', branch: 'f', prNumber: PR }) } as any);
            const ctx: any = { organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, repository: { id: REPO, name: 'r', fullName: 'o/r' }, branch: 'f', pullRequest: { number: PR, title: 'qa', base: { repo: { fullName: 'o/r' }, ref: 'main' }, repository: {}, isDraft: false, stats: { total_additions: 1, total_deletions: 0, total_files: 1, total_lines_changed: 1 } }, teamAutomationId, origin: 'github', action: 'opened', platformType: PlatformType.GITHUB, codeReviewConfig: { codeReviewVersion: CodeReviewVersion.V3_AGENT, reviewOptions: { bug: true, security: true, performance: true } }, changedFiles: [{ filename: 'a.ts', patch: '@@ -1 +1 @@\n-a\n+b', status: 'modified' }], preparedFileContexts: [], validSuggestions: [], discardedSuggestions: [], correlationId: 'qa2628-m13', statusInfo: { status: 'success' } };
            const c1 = await (create as any).executeStage(ctx);
            const c2 = await (stage as any).executeStage(c1);
            await new Promise((r) => setTimeout(r, 200));
            out('stage-done', { lease: await leaseDoc(), usage: c1.sandboxHandle?.usage?.(), errors: (c2.errors ?? []).map((e: any) => String(e.error?.message ?? e.error)) });
            out('publishing');
            await new Promise((r) => setTimeout(r, role === 'review-A' ? 600_000 : 1000));
            await observer.onPipelineFinish(c2, {} as any);
            out('pipeline-finished', { lease: await leaseDoc() });
            return { lastAnalyzedCommit: 'qa', commentId: 1, noteId: 1, statusInfo: { status: 'success' } };
        },
    };
    const svc = new AutomationCodeReviewService(
        { find: fn([]), findOne: fn({ uuid: TA, status: true }) } as any,
        { find: fn([]) } as any,
        aeSvc as any,
        { findOne: fn({ uuid: ORG, name: 'qa2628-org', status: true }) } as any,
        handler as any,
        lock,
        { execute: fn() } as any,
    );
    const r = await svc.run({ organizationAndTeamData: { organizationId: ORG, teamId: TEAM }, repository: { id: REPO, name: 'r' }, branch: 'f', pullRequest: { number: PR }, platformType: PlatformType.GITHUB, teamAutomationId: TA, origin: 'System', action: 'opened' });
    out('run-returned', { result: r, executions: await execRows(), lease: await leaseDoc() });
    process.exit(0);
})().catch((e) => { out('error', { error: String(e?.stack ?? e).slice(0, 800) }); process.exit(2); });
