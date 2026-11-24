# #2671 QA real reviews: provider and Mongo records (slot a)

Merge 4fcd899f8 live on QA (backend build e80175e, restarts 2026-11-24 00:39 UTC). Model: BYOK DeepSeek V4.1 Flash (Fireworks). Kody Rule `qa2671 no session tokens in logs` on `qa2671/**` in each slot org (deleted at the end).
Fixture F1: `qa2671/instrumentation.ts` -> `qa2671/instrumentation-client.ts` byte-identical (GitHub base/head blob 27541419, status renamed, no patch; token log at line 19), `qa2671/edited.ts` -> `qa2671/renamed-and-edited.ts` renamed + token log added at line 12, `attendance.ts` modified (inline control), `index.ts` caller updated, `safe-control.ts` safe change.

| Run | PR | Execution | Pure-rename finding | Rename+edit / control |
|---|---|---|---|---|
| M1 GitHub F1 | kodus-olimpo/claude-athena#12 head e0c88e3a | 60256bbb 12:54-12:59 | issue comment 7132185747 `qa2671/instrumentation-client.ts:19` (kody_rules, Mongo prLevelSuggestions sent); 0 inline on that path; no `Error creating line comment`; no "File-anchored finding" log (route = moved without hunks) | inline 4680320319 renamed-and-edited.ts line 12; attendance 20-22, 13-17 ascending |
| M10 GitHub `@kody start-review` / `--force` same head | #12 | d469a6c7 skipped "No changed files"; 085a66a5 13:10-13:14 | `[REPEAT-CHECK] PR#12: 2 repeats`, 0 new comments; record `discarded-by-repeat` | - |
| M8 GitHub F2 rename-only | #13 head 31570310 | 95f91710 13:09-13:13 | "Found 1 files to analyze"; 2 issue comments: 7132512284 bug `:16`, 7132513471 kody_rules `:19`; 0 inline | end comment says "No issues were found" |
| M9 GitHub new head | #12 head 320ed78d | cebba1fc 18:12-18:16 | `school/attendance.ts` pure rename in delta (no patch): no finding landed | edited renamed file inline 4684532836 line 33 (new line); 0 repeats of earlier findings |
| M12 GitHub limit 1/PR | #14 head e0c88e3a | b904d0b3 18:20-18:25 | kody_rules finding anchored on index.ts:2, none on the renamed file | 4 inline posted (3 non-rule) |
| M4 GitLab F1 | sartorijr/claude-athena!12 | 627076b6 12:54-12:58 | DiscussionNote 4311354918 (no position) `:19`; `renamed_file` true, diff "" | DiffNote 4311356345 renamed-and-edited.ts new_line 12 |
| M5 Bitbucket F1 | kodustech/claude-athena#5 | 5c2963ec (no finding on renamed file), rerun 989368a6 --force 13:10-13:17 | rerun: general comment 909180301 (no inline), html `<code>qa2671/instrumentation-client.ts:19</code>`, no literal marker | inline 909161887 renamed-and-edited.ts to 12 |
| M6 Azure F1 | Kodus QA/claude-athena PR 210 | d2c44b16 12:54-12:56 | changeType `rename`; adapter builds a full-file patch, finding posted inline thread 1369 rightFileStart 19 = rightFileEnd 19 (new route not exercised, as planned) | attendance threads 20-23, 13-18 ascending |
| M7 Forgejo F1 | codeberg kodus/claude-athena#4 | 13977609 12:54-12:58 | renamed, 0/0 lines; model anchored the rule finding on index.ts:2, none on the renamed file | inline renamed-and-edited.ts 12 |
