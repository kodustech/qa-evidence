# #2655 / PR #2660 — audit rerun (A1 real Hunk TUI, A2 Node 22.23.4)

Local only. CLI built from worktrees at merge `cb2d2bb46` (M) and first parent `612691314` (P) with Node **v22.23.4** (`.nvmrc`), `pnpm install --frozen-lockfile && pnpm build` in `apps/cli`. `dist/features/review/command.js` calls `cliWarn` for the gate at M and `cliInfo` at P.

Only the HTTP API is stubbed: a loopback mock answering `POST /cli/review` with two findings anchored on added lines of a staged `app.ts` (warning on R2, error on R4), so `--fail-on error` has exactly one blocker (F1). Synthetic team key in a temp HOME. The Hunk viewer is the **real bundled `hunkdiff` 0.24.1** (native `hunkdiff-darwin-arm64`), not a stub.

## A2.1 — new vitest regression on 22.23.4

`vitest run --config vitest.integration.config.ts -t "fail-on"` (node v22.23.4 on PATH, which the test spawns).

M:
```
 ✓ tests/integration/cli.integration.test.ts > review --fail-on integration > exits with code 1 when issues meet threshold 467ms
 ✓ tests/integration/cli.integration.test.ts > review --fail-on integration > exits with code 0 when no issues meet threshold 460ms
 ✓ tests/integration/cli.integration.test.ts > review --fail-on integration > keeps stdout valid JSON when the gate fires 486ms
      Tests  3 passed | 42 skipped (45)
```

P (test file transplanted from M):
```
     × keeps stdout valid JSON when the gate fires 468ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected [Function] to not throw an error but 'SyntaxError: Unexpected non-whitespac…' was thrown
"SyntaxError: Unexpected non-whitespace character after JSON at position 430 (line 22 column 1)"
      Tests  1 failed | 2 passed | 42 skipped (45)
```

## A2.2 — F1 `review --staged --format json --fail-on error` (no TTY), stdout and stderr captured separately

| | M | P |
|---|---|---|
| exit | 1 | 1 |
| stdout bytes | 452 | 524 |
| whole-buffer `JSON.parse(stdout)` | ok (2 issues) | **fails**: Unexpected non-whitespace character after JSON at position 452 |
| `jq -s length` | 1 | parse error |
| gate line on stdout | 0 | 1 |
| gate line on stderr | 1 | 0 |
| mock requests | 1 × POST /cli/review | 1 × POST /cli/review |

M stderr:
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`.
CLI exited with code 1
```
P stderr:
```
- Checking authentication...
✔ Review complete!
CLI exited with code 1
```
P stdout tail (the line that breaks the parse):
```
}
Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`.
```

## A1 / A2.3 — real Hunk TUI in a PTY: `review --staged --fail-on error`

Driver: Python `pty` (140×40, `TERM=xterm-256color`); the CLI is the PTY's session leader with stdin/stdout on the PTY. In **split** runs stderr is redirected to a file (`2>file`); in **shared** runs stderr is the same PTY (what a user sees). The driver waits for Hunk to enter the alternate screen (`ESC[?1049h`) and go idle, snapshots the screen with a terminal emulator (pyte), sends `q`, drains until the child exits and records `waitpid`'s exit code.

| run | exit | Hunk entered alt screen | `q` sent at byte | alt screen left (`ESC[?1049l`) at byte | gate text in PTY | gate text in stderr file |
|---|---|---|---|---|---|---|
| m-split (node v22.23.4) | 1 | byte 249 | 45331 | 45426 | 0 | 1 |
| p-split (node v22.23.4) | 1 | byte 249 | 44648 | 44743 | 1 (byte 44805, after alt exit) | 0 |
| m-shared (node v22.23.4) | 1 | byte 576 | 44975 | 45070 | 1 (byte 45132, after alt exit) | n/a (shared) |
| p-shared (node v22.23.4) | 1 | byte 576 | 44975 | 45070 | 1 (byte 45132, after alt exit) | n/a (shared) |

Reading: at M the explanation is written once, only to stderr (split: 0 in PTY stdout, 1 in the file), after Hunk quit on `q` and restored the terminal. With stderr on the terminal (shared) it lands after `ESC[?1049l` on the main screen, followed by `CLI exited with code 1`. At P the same text goes to the PTY stdout (split: 1 in PTY, 0 in stderr). Exit 1 in every run.

### Hunk rendered (M, split run, emulator snapshot before `q`)
```
  File  View  Navigate  Agent  Extensions  Help                             repo staged changes  1 file  +3  -1
 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  app.ts                                                                                                                            +3 -1
 ▌@@ -1,3 +1,5 @@
 ▌1 1    export function avg(xs: number[]) {
 ▌2   -    return 0;
 ▌  2 +    let total = xs.reduce((a, b) => a + b, 0);                                                                                    │
     ╭─ Agent note - app.ts R2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────┬┘
     │                                                                                                                                  │
     │  warning  best_practices                                                                                                         │
     │ Prefer const for a binding that is never reassigned                                                                              │
     │ — Kody · severity warning · best_practices                                                                                       │
     ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 ▌  3 +    const count = xs.length;
 ▌  4 +    return total / count;                                                                                                         │
     ╭─ Agent note - app.ts R4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────┬┘
     │                                                                                                                                  │
     │  error  bug                                                                                                                      │
     │ Division by zero when count is 0                                                                                                 │
     │ — Kody · severity error · bug                                                                                                    │
     ╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
 ▌3 5    }

 ext Extension kodus key "y" is taken by hunk.review.copySelection • command "kodus.toggle" left unbound
 Update available: 0.25.0 (latest) • run `hunk update`
```

### Main screen after Hunk exits (bytes outside the alternate screen, re-emulated) and the raw tail
The first line `+q…AAAA` in some views is residue of a terminal-capability probe Hunk sends before entering the alternate screen; pyte does not parse it, a real terminal hides it.

**m-split**
```
+q4d73Gi=31337,s=1,v=1,a=q,t=d,f=24;AAAA
--- raw bytes after alt-screen exit (escaped):
b'\x1b[?1049l\x1b[?2031l\x1b]0;\x07\x1b]12;default\x07\x1b]112\x07\x1b[0 q\x1b[?25h\x1b[?25h'
```

**m-shared**
```
Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`.
CLI exited with code 1,a=q,t=d,f=24;AAAA
--- raw bytes after alt-screen exit (escaped):
b'\x1b[?1049l\x1b[?2031l\x1b]0;\x07\x1b]12;default\x07\x1b]112\x07\x1b[0 q\x1b[?25h\x1b[?25h\x1b[33mExiting with code 1 because 1 issue meets or exceeds `--fail-on error`.\x1b[39m\r\n\x1b[31mCLI exited with code 1\x1b[39m\r\n\x1b[?25h'
```

**p-split**
```
Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`.
--- raw bytes after alt-screen exit (escaped):
b'\x1b[?1049l\x1b[?2031l\x1b]0;\x07\x1b]12;default\x07\x1b]112\x07\x1b[0 q\x1b[?25h\x1b[?25h\x1b[33mExiting with code 1 because 1 issue meets or exceeds `--fail-on error`.\x1b[39m\r\n'
```

### stderr files (split runs, ANSI stripped)
**m-split**
```
- Checking authentication...
✔ Review complete!
Exiting with code 1 because 1 issue meets or exceeds `--fail-on error`.
CLI exited with code 1
```
**p-split**
```
- Checking authentication...
✔ Review complete!
CLI exited with code 1
```
