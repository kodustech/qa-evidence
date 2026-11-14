# #2547 — agents read Next.js route files whose names contain `..` (QA)

- Env: qa.kodus.io (contains #2545), org poison, repo `kodustech/poison_store`, DeepSeek V4.1 Flash @ Fireworks (BYOK, medium). Sandbox: E2B (cloud). 2026-11-14 14:40–14:50 UTC.
- Default branch got `lib/format.ts`, `app/[...slug]/page.tsx`, `app/@modal/(..)photo/[id]/page.tsx` and `src/foo..bar.ts`. PR [#431](https://github.com/kodustech/poison_store/pull/431) makes `formatPrice(value, currency)` require a currency and edits the catch-all page.

## Review of #431 — Langfuse trace `91cf7c33b0b6ba7163f44c852990f7f5` (environment=homolog), generalist agent

29 tool calls; every call on a path with `[...slug]`, `(..)` or `foo..bar` returned content, none returned `Path traversal using ".." is not allowed` (that string appears only in the prompt's security focus text):

| Tool | Input | First output line |
|---|---|---|
| readFile | `app/[...slug]/page.tsx` | `1: import { formatPrice } from '../../lib/format';` |
| readFile | `app/@modal/(..)photo/[id]/page.tsx` | `1: import { formatPrice } from '../../../../lib/format';` |
| readFile | `src/foo..bar.ts` | `1: export const rate = 0.1;` |
| listDir | `src` | `src/foo..bar.ts` |
| findFile | `foo*` | `./src/foo..bar.ts` |
| grep | `formatPrice\(` | `./app/[...slug]/page.tsx-8-    <main>` |

Posted finding (uses what it read): on `lib/format.ts`, "The existing call in `app/@modal/(..)photo/[id]/page.tsx` passes one argument, so it fails to type-check…".

## Custom agent Try it (unsaved agent, run `936382b3-8a87-4557-b13a-904d1915e8e0`)

Instructions told the agent to call each tool and report the first output line verbatim:

| Tool | Input | Reported output |
|---|---|---|
| readFile | `app/[...slug]/page.tsx` | `1: import { formatPrice } from '../../lib/format';` |
| listDir | `app/@modal/(..)photo` | `app/@modal/(..)photo/[id]/page.tsx` |
| grep | `formatPrice` in `app/[...slug]` | `app/[...slug]/page.tsx:1:import { formatPrice } from '../../lib/format';` |
| readFile | `app/../../etc/hostname` | `Error reading app/../../etc/hostname: Path traversal using ".." is not allowed` |

Not covered in QA: LocalSandbox (self-hosted) and a linked repository whose name contains `..` (unit tests only). Regression on repos without `..` names: the #2549 run the same day on the same repo reviewed normally.
