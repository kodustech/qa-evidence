# #2548 — guide quotes on the LocalSandbox (QA, E2B regression only)

- Env: qa.kodus.io (contains #2542), org poison, `kodustech/poison_store`, E2B sandbox, 2026-11-14 19:29 UTC.
- `.skills/money/SKILL.md` and `docs/events.md` on `main`, both linked to a Blank agent `qa-guides` ("Report what the linked guides forbid, quoting the rule.").
- [#489](https://github.com/kodustech/poison_store/pull/489) (`invoice.totalCents * 0.015`): `qa-guides` finding "Fee multiplies by a fractional rate instead of calling applyRate" sent and posted at `src/fees.ts:1`; no `[quote-check] dropped` log for the org in the run.

Not covered: the LocalSandbox path the issue is about (cases 1–4). QA and the runo previews run E2B, the VM has no shell for this account, and pushing a preview branch that switches the sandbox was not possible from this session.
