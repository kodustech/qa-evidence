# #2554 — ast-grep rule file without linked knowledge (QA, E2B regression only)

- Env: qa.kodus.io (contains #2553), org poison, `kodustech/poison_store`, E2B sandbox, 2026-11-14 19:25 UTC.
- `rules/no-console.yml` (`pattern: console.log($$$ARGS)`) on `main`; Blank agent `qa-astgrep` with `tools.astGrepConfig: rules/no-console.yml`; the repository's knowledge list emptied for the run (no knowledge reader), restored after.
- [#488](https://github.com/kodustech/poison_store/pull/488) (`console.log('done')` in `src/report.ts`): `qa-astgrep` finding sent and posted at `src/report.ts:2` ("run() uses console.log, which the no-console rule forbids").
- `observability_logs_ts` since 19:25: `astGrep failed` (org poison) = 0; `astGrep could not remove its temp directory` = 0.

Not covered: the LocalSandbox path the issue is about (cases 1–3). QA and the runo previews run E2B, the VM has no shell for this account, and pushing a preview branch that switches the sandbox was not possible from this session.
