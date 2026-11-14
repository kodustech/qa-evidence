# #2425 — beta features on self-hosted without BETA_FEATURES (QA, cloud regression only)

- Env: qa.kodus.io, deploy `2eca9610` (contains #2475 and #2563), 2026-11-14.
- Cloud is never gated by `BETA_FEATURES`; on the same deploy, today:
  - 29 custom-agent stages ran `success` on QA reviews after 14:30 UTC (e.g. `qa-conventions` posting on poison_store #425, `qa-2384-rules` posting on #461, `risk-auditor` on #482);
  - **Try it** executed an unsaved agent (run `936382b3…`, #2547);
  - Review scope shows the deterministic checks section and the secrets check ran (#2536, PR #434);
  - `customAgents configured but BETA_FEATURES is off…` logged 0 times.

Not covered: the self-hosted cases (custom agents skipped on review, Try it 403, `@kody -v` refusal, web resolver hiding GHES PAT and deterministic evidence, `BETA_FEATURES=true` turning them back on). They need a self-hosted runo preview of current `main`; opening a QA preview branch was not possible from this session.
