// QA harness for #2452: real LicenseService (axios) + real PermissionValidationService
// + real ValidatePrerequisitesStage, billing URL pointed at a local HTTP stub.
import * as http from 'http';
import * as fs from 'fs';
import { AddressInfo } from 'net';
import { Test } from '@nestjs/testing';
import { PlatformType } from '@libs/core/domain/enums';
import { ParametersKey } from '@libs/core/domain/enums/parameters-key.enum';
import { PARAMETERS_SERVICE_TOKEN } from '@libs/organization/domain/parameters/contracts/parameters.service.contract';
import { ORGANIZATION_PARAMETERS_SERVICE_TOKEN } from '@libs/organization/domain/organizationParameters/contracts/organizationParameters.service.contract';
import { PULL_REQUESTS_SERVICE_TOKEN } from '@libs/platformData/domain/pullRequests/contracts/pullRequests.service.contracts';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import { AutoAssignLicenseUseCase } from '@libs/ee/license/use-cases/auto-assign-license.use-case';
import { LICENSE_SERVICE_TOKEN } from '@libs/ee/license/interfaces/license.interface';
import { LicenseService } from '@libs/ee/license/license.service';
import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import { NotificationService } from '@libs/notifications/application/notification.service';
import { NotificationRateLimiter } from '@libs/notifications/application/notification-rate-limiter.service';
import { PrAuthorRecipientResolver } from '@libs/notifications/application/pr-author-recipient.resolver';
import { USER_SERVICE_TOKEN } from '@libs/identity/domain/user/contracts/user.service.contract';
import { CODE_BASE_CONFIG_SERVICE_TOKEN } from '@libs/code-review/domain/contracts/CodeBaseConfigService.contract';
import { PULL_REQUEST_MANAGER_SERVICE_TOKEN } from '@libs/code-review/domain/contracts/PullRequestManagerService.contract';
import { ValidatePrerequisitesStage } from '@libs/code-review/pipeline/stages/validate-prerequisites.stage';

jest.mock('@libs/ee/configs/environment', () => {
    const actual = jest.requireActual('@libs/ee/configs/environment');
    return {
        ...actual,
        environment: { ...actual.environment, API_CLOUD_MODE: true, API_DEVELOPMENT_MODE: false },
    };
});

type Mode = { status?: number; body?: any; drop?: boolean };
let mode: Mode;
let trialMode: Mode;
let hits: string[] = [];
let server: http.Server;
let port: number;
const results: any[] = [];

beforeAll(async () => {
    server = http.createServer((req, res) => {
        hits.push(`${req.method} ${req.url?.split('?')[0]}`);
        const m = req.url?.includes('validate-org-license') ? mode : req.url?.includes('/trial') ? trialMode : { status: 200, body: [] };
        if (m.drop) { req.socket.destroy(); return; }
        res.writeHead(m.status ?? 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(m.body ?? {}));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
    server.close();
    fs.writeFileSync(process.env.QA_OUT || 'qa-2452-results.json', JSON.stringify(results, null, 2));
});

async function run(name: string, m: Mode, t: Mode = { status: 500, body: { error: 'Erro ao validar token' } }) {
    mode = m; trialMode = t; hits = [];
    process.env.GLOBAL_KODUS_SERVICE_BILLING = m.status === -1 ? 'http://127.0.0.1:1' : `http://127.0.0.1:${port}`;
    const comments: string[] = [];
    const license = new LicenseService();
    const params = {
        findByKey: jest.fn(async (key: string) =>
            key === ParametersKey.PLATFORM_CONFIGS
                ? { configValue: { finishOnboard: true } }
                : { configValue: { configs: { showStatusFeedback: true }, repositories: [] } }),
    };
    const orgParams = { findByKey: jest.fn().mockResolvedValue(undefined), findOne: jest.fn().mockResolvedValue(undefined) };
    const mod = await Test.createTestingModule({
        providers: [
            ValidatePrerequisitesStage,
            PermissionValidationService,
            { provide: LICENSE_SERVICE_TOKEN, useValue: license },
            { provide: ORGANIZATION_PARAMETERS_SERVICE_TOKEN, useValue: orgParams },
            { provide: PARAMETERS_SERVICE_TOKEN, useValue: params },
            { provide: CODE_BASE_CONFIG_SERVICE_TOKEN, useValue: { getConfig: jest.fn().mockResolvedValue({ automatedReviewActive: true }) } },
            { provide: PULL_REQUEST_MANAGER_SERVICE_TOKEN, useValue: { getChangedFilesMetadata: jest.fn().mockResolvedValue([{ filename: 'a.ts' }]) } },
            { provide: AutoAssignLicenseUseCase, useValue: { execute: jest.fn() } },
            { provide: PULL_REQUESTS_SERVICE_TOKEN, useValue: { find: jest.fn().mockResolvedValue([]) } },
            { provide: CodeManagementService, useValue: {
                addReactionToPR: jest.fn(), addReactionToComment: jest.fn(), createResponseToComment: jest.fn(),
                createIssueComment: jest.fn(async (p: any) => { comments.push(p.body); }) } },
            { provide: NotificationService, useValue: { emit: jest.fn() } },
            { provide: NotificationRateLimiter, useValue: { shouldEmit: jest.fn().mockResolvedValue(true) } },
            { provide: PrAuthorRecipientResolver, useValue: { resolve: jest.fn().mockResolvedValue(null) } },
            { provide: USER_SERVICE_TOKEN, useValue: { find: jest.fn().mockResolvedValue([]) } },
        ],
    }).compile();
    const stage = mod.get(ValidatePrerequisitesStage);
    const ctx: any = {
        organizationAndTeamData: { organizationId: 'org-qa-2452', teamId: 'team-qa-2452' },
        repository: { id: 'r1', name: 'r1' }, pullRequest: { number: 1, state: 'open', locked: false },
        userGitId: 'u1', platformType: PlatformType.GITHUB, branch: 'b', teamAutomationId: 'a1',
        origin: 'command', action: 'opened', errors: [], preparedFileContexts: [], validSuggestions: [],
        discardedSuggestions: [], validSuggestionsByPR: [], validCrossFileSuggestions: [], pipelineMetadata: {},
        statusInfo: { status: 'in_progress', message: 'started' }, pipelineVersion: '1.0.0',
    };
    const out = await stage.execute(ctx);
    const r = {
        scenario: name,
        billingCalls: hits,
        status: out.statusInfo?.status,
        statusMessage: out.statusInfo?.message,
        prComment: comments.map((c) => c.split('\n')[0]),
    };
    results.push(r);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(r));
    return r;
}

jest.setTimeout(60000);
it('500 (the QA incident body)', () => run('validate-org-license 500', { status: 500, body: { error: 'Erro ao validar token' } }));
it('503', () => run('validate-org-license 503', { status: 503 }));
it('429', () => run('validate-org-license 429', { status: 429 }));
it('408', () => run('validate-org-license 408', { status: 408 }));
it('socket dropped', () => run('validate-org-license socket hang up', { drop: true }));
it('connection refused', () => run('billing unreachable (ECONNREFUSED)', { status: -1 }));
it('404 (real answer, no license) -> heal tried, trial POST 500', () => run('validate-org-license 404, POST /trial 500', { status: 404 }));
it('401', () => run('validate-org-license 401', { status: 401 }));
it('expired trial answered by billing', () => run('200 {valid:false, subscriptionStatus:trial} (expired)', { status: 200, body: { valid: false, subscriptionStatus: 'trial' } }));
it('active trial', () => run('200 {valid:true, subscriptionStatus:trial} (active)', { status: 200, body: { valid: true, subscriptionStatus: 'trial', planType: 'teams_managed' } }));
