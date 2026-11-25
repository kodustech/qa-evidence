# #2624 X1: sign-up scrollbar overlays the right edge of the form on phone widths

QA web (build containing 84cb66c5). The form column's Radix ScrollArea (`type="auto"`) draws its vertical scrollbar (`w-2.5`, `z-50`, thumb `bg-card-lv3`, opaque) inside the right 10 px of the viewport area. Below `md` the form now fills the column (content x = 24..vw-24), so whenever the column scrolls the scrollbar sits on top of the last 10 px of every full-width control.

| viewport / engine | step | column scrolls? | scrollbar x | elements whose right edge is covered (elementFromPoint at r-2/r-6 returns the scrollbar) |
|---|---|---|---|---|
| 375x812 Chromium | 1 | no | none | none |
| 375x812 Chromium | 2 | yes (883 > 764) | 341-351 | heading, name, password (+ eye button edge), rules row, confirm, Sign up button, "Terms of Service" text |
| 320x568 Chromium | 1 and 2 | yes | 286-296 | heading, OAuth buttons, email, Continue, invalid-email message; step 2 all fields, Sign up, "Terms" text |
| 390x844 Chromium | 1 and 2 | step 2 yes | 356-366 | step 2 heading, fields, Sign up |
| 390x664 WebKit (iPhone 13) | 1 and 2 | yes | 356-366 | step 1 heading, GitHub/GitLab buttons, email, Continue; step 2 fields, Sign up |
| 767x900, 768-1920 desktop | 1 and 2 | - | - | none (form is max-w-96 centered, away from the scrollbar) |
| 812x375 landscape (md, two columns) | 1 and 2 | yes | 778-788 | heading/OAuth/fields: same on production (pre-fix), so pre-existing for the desktop layout |

A tap 4 px inside the right edge of the Sign up button lands on the scrollbar, not the button (375x812). Screenshots: X1-chromium-375x812-edge.png, M3-chromium-375x812-step2-bottom.png, M6-320x568-step2-cta.png, M7-webkit-iphone13-back.png.

Cause read at 84cb66c5: `apps/web/src/app/(auth)/sign-up/page.tsx:51-53` (ScrollArea around a `flex-col items-center` wrapper with no right padding) and `apps/web/src/core/components/ui/scroll-area.tsx:27-45` (overlay scrollbar).
