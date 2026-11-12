# #2516 — QA runs (QA `homolog` 9f0bfbef, includes #2532; 2026-11-12)

Org: Bitbucket QA org (`bitbucket@kodus.io`), workspace `kodustech`, API token auth; trial default model (DeepSeek V4.1 Flash @ Fireworks).

## Listing, members, seats (API, 23:00 UTC)

| Call | Result |
|---|---|
| `GET /code-management/repositories/org` | `200` in 2.1 s, repositories listed |
| `POST /code-management/organization-members/refresh` | `201` in 1.3 s, `status: ok`, 4 members |
| `GET /code-management/organization-members` | `200` in 0.9 s, same 4 members |
| `GET /license/removable-seats` | `200`, `status: ok`, no candidates, nothing revoked |

The two "Gabriel Malinosqui" entries are two distinct Bitbucket accounts in the workspace (`{04856e9a…}` and `{1b0e2df9…}`), not a duplicate. Ids come back without braces. Stored PR authors for the org: 1 (11 PRs on `artemis`).

## Full review with batch diff edge cases

`kodustech/artemis` PR 35 (`qa/2516-qa-batch-diff`): a rename with an edit (`src/utils/idGenerator.js` → `src/utils/id-generator.js`), a deletion (`src/models/Endereco.js`), a path with a space (`src/services/relatorio aluno.js`), a non-ASCII path (`src/services/matrícula.js`) and an edit (`src/services/alunoService.js`).

- `FetchChangedFilesStage`: `Found 4 files to analyze for PR#35 (5 total, 1 ignored)`; no 429 or rate-limit log in the run.
- Review completed; line comments landed on the right files and lines:
  - `src/services/relatorio aluno.js:6` — loop `i <= alunos.length` (planted)
  - `src/services/matrícula.js:4` — `totalAtual <= LIMITE` off by one (planted)
  - plus `relatorio aluno.js:1`, `:7` and `alunoService.js:3`.

## Not run in QA

A real Bitbucket 429 cannot be forced on demand; the 429 listing message, the picker error state and the org/team on 429 logs were validated on runo with a simulated 429 (issue comments of 2026-11-11/12).
