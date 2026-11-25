/* QA #2205 harness: pure planner functions at this checkout. Writes JSON to QA2205_OUT. */
import * as fs from 'fs';
import * as planner from '@libs/code-review/infrastructure/agents/collaborators/context-fit-planner';
import { resolveAdaptiveProfile } from '@libs/code-review/infrastructure/agents/engine/adaptive-fit';
import { convertToUnifiedDiffWithLineNumbers } from '@libs/common/utils/patch';

const out: any = {};
const P: any = planner;
const est = (input: any) => P.estimatePromptTokens(input);
const throws = (fn: () => void) => { try { fn(); return false; } catch (e: any) { return e?.constructor?.name || 'Error'; } };

describe('qa2205 planner', () => {
    afterAll(() => fs.writeFileSync(process.env.QA2205_OUT!, JSON.stringify(out, null, 1)));

    it('M2 estimator across tiers and field precedence', () => {
        const diff = '@@ -1,1 +1,1 @@\n' + 'x'.repeat(4000);
        const f = { filename: 'src/a.ts', patch: diff, patchWithLinesStr: diff } as any;
        const r: any = { diffChars: diff.length };
        for (const tier of ['optional', 'warm', 'critical', 'absent']) {
            const fileTiers = tier === 'absent' ? undefined : new Map([['src/a.ts', tier]]);
            r[tier] = est({ changedFiles: [f], fileTiers });
        }
        r.overheadOnly = P.estimateNonDiffOverheadTokens({ changedFiles: [f] });
        r.diffTokensExpected = Math.ceil(diff.length / 4);
        // precedence
        r.linesWinsOverPatch = est({ changedFiles: [{ filename: 'a', patch: 'short', patchWithLinesStr: 'y'.repeat(4000) }] }) - P.estimateNonDiffOverheadTokens({ changedFiles: [{}] });
        r.emptyLinesStr_patchLong = est({ changedFiles: [{ filename: 'a', patch: 'z'.repeat(4000), patchWithLinesStr: '' }] }) - P.estimateNonDiffOverheadTokens({ changedFiles: [{}] });
        r.nullLinesStr_patchLong = est({ changedFiles: [{ filename: 'a', patch: 'z'.repeat(4000), patchWithLinesStr: null }] }) - P.estimateNonDiffOverheadTokens({ changedFiles: [{}] });
        r.undefinedBoth = est({ changedFiles: [{ filename: 'a' }] }) - P.estimateNonDiffOverheadTokens({ changedFiles: [{}] });
        r.hasEstimateHunkHeaderChars = typeof P.estimateHunkHeaderChars === 'function';
        out.M2 = r;
    });

    it('M7 preflight matrix', () => {
        const windows = [12000, 12288, 16000, 20000, 21999, 22000, 22500, 23000, 24000, 28000, 32000, 32768, 40000, 63999, 64000, 128000];
        const counts = [0, 1, 50, 95, 96, 100, 150, 200];
        const body = 'b'.repeat(500);
        const rows: any[] = [];
        for (const w of windows) {
            const profile = resolveAdaptiveProfile(w);
            const row: any = { w, kind: profile?.kind, compact: profile?.compactPrompt, budget: Math.floor(w * 0.55) };
            for (const n of counts) {
                const changedFiles = Array.from({ length: n }, (_, i) => ({ filename: `f${i}.ts`, patch: '+x' }));
                const input = { changedFiles, prTitle: 'Add things', prBody: body, adaptiveProfile: profile };
                row['O@' + n] = P.estimateNonDiffOverheadTokens(input);
                row['throw@' + n] = throws(() => P.assertContextWindowFitsOverhead({ input, contextWindow: w, modelName: 'm' }));
            }
            // threshold file count: smallest n that throws
            let thr: any = null;
            for (let n = 0; n <= 3000; n++) {
                const changedFiles = Array.from({ length: n }, (_, i) => ({ filename: `f${i}.ts` }));
                const input = { changedFiles, prTitle: 'Add things', prBody: body, adaptiveProfile: profile };
                if (throws(() => P.assertContextWindowFitsOverhead({ input, contextWindow: w, modelName: 'm' }))) { thr = n; break; }
            }
            row.firstThrowingFileCount = thr;
            rows.push(row);
        }
        out.M7 = rows;
        // 24K compact vs non compact
        const c24 = resolveAdaptiveProfile(24000);
        out.M7_24k = {
            compact: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [], adaptiveProfile: c24 }, contextWindow: 24000, modelName: 'm' })),
            nonCompact: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [], adaptiveProfile: { ...c24, compactPrompt: false } }, contextWindow: 24000, modelName: 'm' })),
        };
        const l32 = resolveAdaptiveProfile(32768);
        const cg = 'edge: a→b\n'.repeat(2000);
        out.M7_32k_callgraph = {
            dropped: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [], callGraph: cg, adaptiveProfile: l32 }, contextWindow: 32768, modelName: 'm' })),
            kept: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [], callGraph: cg, adaptiveProfile: { ...l32, dropCallGraph: false } }, contextWindow: 32768, modelName: 'm' })),
        };
        // fencepost: overhead exactly == limit. compact 48000 chars static => 12000 + ceil((300+80n)/4)
        // find window w (light/compact) where floor(.55w) == O exactly
        const fence: any[] = [];
        for (const w of [24000, 32000]) {
            const prof = resolveAdaptiveProfile(w);
            const limit = Math.floor(w * 0.55);
            // craft prBody length to make O == limit, and O == limit-1
            for (const delta of [0, -1]) {
                const base = P.estimateNonDiffOverheadTokens({ changedFiles: [], prTitle: '', prBody: '', adaptiveProfile: prof });
                const needTokens = limit + delta - base; // tokens to add via callGraph (kept on compact? compact drops callGraph) -> use files
                const files = Math.max(0, Math.round((needTokens * 4) / 80));
                const changedFiles = Array.from({ length: files }, (_, i) => ({ filename: `f${i}` }));
                const input = { changedFiles, prTitle: '', prBody: '', adaptiveProfile: prof };
                const O = P.estimateNonDiffOverheadTokens(input);
                fence.push({ w, limit, files, O, eq: O === limit, throw: throws(() => P.assertContextWindowFitsOverhead({ input, contextWindow: w, modelName: 'm' })) });
            }
        }
        out.M7_fence = fence;
        // full profile: whole-window rule
        const f64 = resolveAdaptiveProfile(64000);
        out.M7_full = {
            w63999: resolveAdaptiveProfile(63999)?.kind,
            w64000: f64?.kind,
            fullOverhead40k_on64k: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [], callGraph: 'c'.repeat(100000), adaptiveProfile: f64 }, contextWindow: 64000, modelName: 'm' })),
            fullOverheadEqWindow: (() => { const cg = 'c'.repeat(64000 * 4 - 62000 - 300); const input = { changedFiles: [], callGraph: cg, adaptiveProfile: f64 }; return { O: P.estimateNonDiffOverheadTokens(input), throw: throws(() => P.assertContextWindowFitsOverhead({ input, contextWindow: 64000, modelName: 'm' })) }; })(),
            noProfileAt20k: throws(() => P.assertContextWindowFitsOverhead({ input: { changedFiles: [] }, contextWindow: 20000, modelName: 'm' })),
        };
    });

    it('M8 natural compact/minimal windows, O independent of diff', () => {
        const r: any[] = [];
        for (const w of [12288, 16000]) {
            const prof = resolveAdaptiveProfile(w);
            for (const diffChars of [10, 400000]) {
                const input = { changedFiles: [{ filename: 'a.ts', patch: 'x'.repeat(diffChars) }], prTitle: 't', prBody: 'b', adaptiveProfile: prof };
                let err: any = null;
                try { P.assertContextWindowFitsOverhead({ input, contextWindow: w, modelName: 'deepseek' }); } catch (e: any) { err = { name: e.constructor.name, contextWindow: e.contextWindow, overheadTokens: e.overheadTokens, modelName: e.modelName, message: e.message }; }
                r.push({ w, kind: prof?.kind, diffChars, O: P.estimateNonDiffOverheadTokens(input), err });
            }
        }
        out.M8 = r;
    });

    it('M11 input boundaries', () => {
        const r: any = {};
        const ov = (n: number) => P.estimateNonDiffOverheadTokens({ changedFiles: Array.from({ length: n }, () => ({})) });
        // rounding at chunk budget
        const mk = (name: string, chars: number) => ({ filename: name, patch: 'q'.repeat(chars) });
        r.chunkEqual = P.chunkFilesByTokenBudget([mk('a', 4000), mk('b', 4000)], 2000).map((c: any) => c.map((f: any) => f.filename));
        r.chunkPlusOneChar = P.chunkFilesByTokenBudget([mk('a', 4000), mk('b', 4001)], 2000).map((c: any) => c.map((f: any) => f.filename));
        r.chunkNullPatches = P.chunkFilesByTokenBudget([{ filename: 'n1' }, { filename: 'n2', patch: null }, { filename: 'n3', patchWithLinesStr: '' }], 10).map((c: any) => c.map((f: any) => f.filename));
        r.chunkEmpty = P.chunkFilesByTokenBudget([], 10);
        const uni = [mk('src/ação/ünïcödé-文件.ts', 9000), mk('src\\win\\path.ts', 9000), mk('src/a.ts', 9000)];
        r.chunkUnicode = P.chunkFilesByTokenBudget(uni, 2500).map((c: any) => c.map((f: any) => f.filename));
        r.normalizeBackslash = P.normalizeFilenameForTier('/src\\win\\path.ts');
        // >2000 files
        const many = Array.from({ length: 2100 }, (_, i) => mk(`f${i}.ts`, 400));
        const chunks = P.chunkFilesByTokenBudget(many, 19200);
        const flat = chunks.flat().map((f: any) => f.filename);
        r.many = { files: 2100, chunks: chunks.length, union: new Set(flat).size, dup: flat.length - new Set(flat).size };
        // 50,000-line cap in line-number conversion
        const lines = Array.from({ length: 50010 }, (_, i) => '+l' + i).join('\n');
        const conv = convertToUnifiedDiffWithLineNumbers('@@ -0,0 +1,50010 @@\n' + lines, { filename: 'big.ts' });
        r.lineCap = { inLines: 50011, outLines: conv.split('\n').length, tail: conv.split('\n').slice(-1)[0].slice(0, 160) };
        r.overhead0 = ov(0); r.overhead2000 = ov(2000);
        out.M11 = r;
    });
});
