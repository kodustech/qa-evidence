# #2578 — Heavy lenses as "Specialist Agents" on the PR timeline; review mode out of Status (QA)

- Env: runo cloud preview of [#2586](https://github.com/kodustech/kodus-ai/pull/2586) (`329030f12`), trial org, `kodustech/gym`, DeepSeek V4 Flash (BYOK openai-compatible, medium) behind a local proxy that answers 429 to every call of one lens (`lens-changed-files-disagree`). 2026-11-17 UTC.

| Case | Run | Expected | Seen |
|---|---|---|---|
| Heavy, one lens forced to fail | [gym#143](https://github.com/kodustech/gym/pull/143) `@kody review --heavy` | One "Specialist Agents" entry, partial error, failed lens with a friendly reason, generalist counts only its own findings | "Specialist Agents — 8 of 9 ran · 10 findings", Partial Error; "Changed files disagree" shows "Rate limit reached on the provider (openai_compatible). Try again in a few minutes."; Generalist "5 findings" (15 kept − 10 from lenses); 8 suggestions sent. [Screenshot](https://kodustech.github.io/qa-evidence/issues/2578/heavy-specialists.png) |
| Skipped run after the heavy one | gym#143 `@kody start-review`, no new commit | Status shows only "Skipped"; mode tag next to the branch shows the last reviewing run | Status "Skipped" alone; row tag "Heavy"; Review 2 (skipped) carries no tag, Review 1 carries "Heavy". [List](https://kodustech.github.io/qa-evidence/issues/2578/list-rows.png) · [Reviews](https://kodustech.github.io/qa-evidence/issues/2578/pr143-reviews.png) |
| Balanced | [gym#142](https://github.com/kodustech/gym/pull/142) `@kody start-review` | "Balanced" tag, no Specialist Agents entry | Tag "Balanced"; timeline has the Generalist only; `reviewMode: balanced` stored. [Screenshot](https://kodustech.github.io/qa-evidence/issues/2578/balanced-timeline.png) |

Found in QA and fixed in `329030f12`: the failed and running lens dots used `bg-error`/`bg-in-progress`, which are not theme colors, so they rendered empty. The existing timeline dots in `pr-list-item.tsx` have the same gap (out of scope).

Not run: self-hosted shape (same UI code; heavy there needs a signed license key, unchanged by this PR).
