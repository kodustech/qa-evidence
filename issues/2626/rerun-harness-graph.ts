import { DataSource } from 'typeorm';
import { AstGraphRepository } from '@libs/code-review/infrastructure/adapters/repositories/astGraph.repository';
import { GraphIndexerService } from '@libs/code-review/infrastructure/adapters/services/graph/graph-indexer.service';
import { KodusGraphCli } from '@libs/code-review/infrastructure/adapters/services/graph/kodus-graph-cli';
import { AstGraphBuildJobProcessor } from '@libs/code-review/workflow/ast-graph-build-job.processor';
import { AstGraphIncrementalJobProcessor } from '@libs/code-review/workflow/ast-graph-incremental-job.processor';
import { note, sleep, ts } from './lib';

export async function pgDs(db = 'postgres') {
    const ds = new DataSource({ type: 'postgres', host: 'localhost', port: 57127, username: 'postgres', password: 'qa2626', database: db });
    await ds.initialize();
    await ds.query(`CREATE TABLE IF NOT EXISTS ast_nodes (id bigserial primary key, repo_id uuid not null, kind text not null, name text not null, qualified_name text not null, file_path text not null, line_start int, line_end int, language text, parent_name text, params text, return_type text, modifiers text, is_test boolean default false, file_hash text, CONSTRAINT "UQ_ast_nodes_repo_qualified" UNIQUE (repo_id, qualified_name))`);
    await ds.query(`CREATE TABLE IF NOT EXISTS ast_edges (id bigserial primary key, repo_id uuid not null, kind text not null, source_qualified text not null, target_qualified text not null, file_path text not null, line int, confidence real, CONSTRAINT "UQ_ast_edges" UNIQUE (repo_id, kind, source_qualified, target_qualified))`);
    return ds;
}

/** In-memory stand-ins for Postgres-backed collaborators that are not under test. */
export function memRepos(repoId: string, status = 'pending', defaultBranch = 'main') {
    const repoState: any = { uuid: repoId, astGraphStatus: status, history: [] as any[], externalId: 'ext-1', defaultBranch, fullName: 'org/athena' };
    const repositoryService: any = {
        findById: async (id: string) => (id === repoId ? { ...repoState } : null),
        updateGraphStatus: async (id: string, s: string, extra?: any) => {
            repoState.astGraphStatus = s; Object.assign(repoState, extra || {});
            repoState.history.push({ t: ts(), status: s, ...(extra || {}) });
            note('repo.status', { status: s, ...(extra || {}) });
        },
    };
    const jobs = new Map<string, any>();
    const jobRepository: any = {
        findOne: async (id: string) => jobs.get(id) ?? null,
        update: async (id: string, patch: any) => {
            const j = jobs.get(id); if (!j) return;
            const meta = { ...(j.metadata || {}), ...(patch.metadata || {}) };
            Object.assign(j, patch, { metadata: meta });
            j.history = j.history || []; j.history.push({ t: ts(), status: patch.status, stage: patch.currentStage || patch.metadata?.stage });
            if (patch.status) note('job.update', { id, status: patch.status, stage: patch.metadata?.stage });
        },
    };
    const codeManagementService: any = { getCloneParams: async () => ({ url: 'https://example.invalid/r.git', auth: { token: 'x' } }) };
    return { repoState, repositoryService, jobs, jobRepository, codeManagementService };
}

/** The graph CLI transport: sandbox.run / readFile answer with a supplied graph JSON. */
export function cliTransport(ctl: { graph: () => any; parseDelayMs?: number; parseGate?: Promise<void>; failParse?: string; blankHead?: boolean; onParse?: (cmd: string) => void }) {
    return async (cmd: string, id: string) => {
        if (cmd.includes('rev-parse HEAD')) return { stdout: ctl.blankHead ? '' : 'f00dfacef00dfacef00dfacef00dfacef00dface\n', stderr: '', exitCode: 0 };
        if (cmd.includes('which kodus-graph')) return { stdout: '/home/user/.bun/bin/kodus-graph\nlatest\n', stderr: '', exitCode: 0 };
        if (/kodus-graph (parse|update)|kodus-graph\b.*--out/.test(cmd) || cmd.includes('parse')) {
            ctl.onParse?.(cmd);
            note('cli.parse.start', { id, cmd: cmd.slice(0, 120) });
            if (ctl.parseGate) await ctl.parseGate;
            if (ctl.parseDelayMs) await sleep(ctl.parseDelayMs);
            if (ctl.failParse) { note('cli.parse.fail', { id }); const e: any = new Error(ctl.failParse); throw e; }
            note('cli.parse.done', { id });
            return { stdout: '', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
    };
}

export async function buildGraphStack(ds: DataSource, mem: ReturnType<typeof memRepos>, leaseManager: any) {
    const astRepo = new AstGraphRepository(null as any, null as any, ds);
    const cli = new KodusGraphCli();
    const indexer = new GraphIndexerService(astRepo, mem.repositoryService, cli);
    const full = new AstGraphBuildJobProcessor(mem.jobRepository, leaseManager, mem.codeManagementService, indexer, mem.repositoryService);
    const incr = new AstGraphIncrementalJobProcessor(mem.jobRepository, leaseManager, mem.codeManagementService, indexer, mem.repositoryService);
    return { astRepo, indexer, full, incr };
}

export async function canon(ds: DataSource, repoId: string) {
    const n = await ds.query(`select kind,name,qualified_name,file_path,line_start,line_end,coalesce(parent_name,'') p,is_test from ast_nodes where repo_id=$1 order by file_path,qualified_name,kind`, [repoId]);
    const e = await ds.query(`select kind,source_qualified,target_qualified,file_path,line from ast_edges where repo_id=$1 order by kind,source_qualified,target_qualified,file_path`, [repoId]);
    const h = (rows: any[]) => require('crypto').createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16);
    return { nodes: n.length, edges: e.length, nh: h(n), eh: h(e), rows: { n, e } };
}
