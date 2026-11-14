# #2384 — custom agents finish with a result; unfollowed citations and "Follow it" (QA)

- Env: qa.kodus.io (contains #2393), org poison, `kodustech/poison_store`, DeepSeek V4.1 Flash @ Fireworks. 2026-11-14 16:40–17:05 UTC.
- Agents: "Regression & hallucination" created from the web template (unedited) and a Blank `qa-2384-rules` ("Enforce the rules in docs/rules/payments.mdc and docs/rules/naming.mdc. Never cite README.md."), both on. `docs/rules/payments.mdc` and `naming.mdc` committed on `main`.

## Case 1 — agents with nothing to report finish as completed
| PR | Change | Regression & hallucination | qa-2384-rules | Execution |
|---|---|---|---|---|
| [#453](https://github.com/kodustech/poison_store/pull/453) | README sentence | success, 1 finding | success, 0 | success |
| [#454](https://github.com/kodustech/poison_store/pull/454) | docs note | success, 0 | success, 0 | success |
| [#455](https://github.com/kodustech/poison_store/pull/455) | version constant | success, 0 | success, 0 | success |
| [#456](https://github.com/kodustech/poison_store/pull/456) | settings yml | success, 0 | success, 0 | success |
| [#457](https://github.com/kodustech/poison_store/pull/457) | local variable | success, 0 | success, 0 | success |

`code_review_execution`: no `custom-agent: … without submitting a result` row on any of them (0 such rows in QA since 2026-11-12, 51 custom-agent runs).

## Cases 4–7 — unfollowed citations and Follow it
- [#458](https://github.com/kodustech/poison_store/pull/458) (`fee = order.total * 0.015`, `function valid(x){return x>0}`): both agents' findings citing the rule files dropped with `docs/rules/payments.mdc is not a guide linked to this review` / `docs/rules/naming.mdc …`.
- `GET /code-review/custom-agents/status`: `qa-2384-rules.unfollowedCitations = [{file: docs/rules/naming.mdc, findings: 1}, {file: docs/rules/payments.mdc, findings: 1}]`.
- Agent page: "The instructions name `docs/rules/payments.mdc`, but this agent does not follow it…" + **Follow it**, same for `naming.mdc`, no note for `README.md`, "Cited by dropped findings" card ([screenshot](https://kodustech.github.io/qa-evidence/issues/2384/agent-follow-it-notes.png)).
- Follow it on `payments.mdc` + save: stored `knowledge` gains `{kind: doc, path: docs/rules/payments.mdc, linkedTo: [qa-2384-rules]}`; its note disappears, `naming.mdc`'s stays ([screenshot](https://kodustech.github.io/qa-evidence/issues/2384/agent-after-follow.png)).
- Same change re-run in [#461](https://github.com/kodustech/poison_store/pull/461): `qa-2384-rules` finding posted with the agent tag and **Rule** (`docs/rules/payments.mdc`); `naming.mdc` citations still dropped; the other agent's `payments.mdc` citation dropped (the doc is linked only to `qa-2384-rules`).
- Agent naming `docs/pumps.md in acme/rules` / `in pump-rules` (repos not linked): no Follow it offered ([screenshot](https://kodustech.github.io/qa-evidence/issues/2384/agent-unlinked-repo-no-follow.png)).

Not run: forcing a final pass with only `reasoning` or a recovery with `"label": null` (needs a response-rewriting proxy on the model call), a real step exhaustion, and a tracker-sourced finding. These stay on the PR's specs. Agents, knowledge link and rule files were removed after the run.
