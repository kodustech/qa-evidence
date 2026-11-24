# QA #2635 / PR #2636: geometry and network summary (slot b)

All measurements on qa.web.kodus.io (web build containing merge eee5562a7) unless marked "local". Local = `next dev` of apps/web at first parent be54920d and at the merge, pointed at the QA API, same throwaway accounts. Columns: viewport, document scrollWidth, setup Page.Root scrollWidth, visible column widths, side panel display, primary action fits/hit-tested, step-indicator bar width.

## Deployed bundle

- `h-2 w-10 min-w-0 shrink rounded-full` found in 3 chunk(s)
- `hidden flex-10 flex-col justify-center gap-10 rounded-3xl p-12 md:flex` found in 2 chunk(s)
- `hidden flex-10 flex-col justify-center gap-10 rounded-3xl p-12 lg:flex` found in 1 chunk(s)
- `/assets/images/trusted-by/scorpion.svg` found in 1 chunk(s)
- `/assets/images/trusted-by/rocket-chat.webp` found in 1 chunk(s)
- `rocketcdn` and `aspect-[5] h-2` found in none of the 46 scanned chunks

## M11 breakpoint matrix (QA, height 900)

| route@viewport | docSW | shellSW | flex-direction | side | columns | CTA | bars |
|---|---|---|---|---|---|---|---|
| creating-workspace@390x900 | 390 | 390 | row | none | 342 | ok 342w | 9x30.9 |
| creating-workspace@414x900 | 414 | 414 | row | none | 366 | ok 366w | 9x33.6 |
| creating-workspace@767x900 | 767 | 767 | row | none | 719 | ok 384w | 9x35.6 |
| creating-workspace@768x900 | 768 | 768 | row | flex | 313+383 | ok 303.3w | 9x26.6 |
| creating-workspace@1023x900 | 1023 | 1023 | row | flex | 419+532 | ok 384w | 9x35.6 |
| creating-workspace@1024x900 | 1024 | 1024 | row | flex | 419+533 | ok 384w | 9x35.6 |
| creating-workspace@1280x900 | 1280 | 1280 | row | flex | 526+682 | ok 384w | 9x35.6 |
| creating-workspace@1440x900 | 1440 | 1440 | row | flex | 593+775 | ok 384w | 9x35.6 |
| connecting-git-tool@390x900 | 390 | 390 | column | none | 342 | ok 276w | 9x30.9 |
| connecting-git-tool@414x900 | 414 | 414 | column | none | 366 | ok 300w | 9x33.6 |
| connecting-git-tool@767x900 | 767 | 767 | column | none | 719 | ok 653w | 9x40 |
| connecting-git-tool@768x900 | 768 | 768 | column | none | 720 | ok 654w | 9x40 |
| connecting-git-tool@1023x900 | 1023 | 1023 | column | none | 975 | ok 909w | 9x40 |
| connecting-git-tool@1024x900 | 1024 | 1024 | row | flex | 429+547 | ok 400.7w | 9x40 |
| connecting-git-tool@1280x900 | 1280 | 1280 | row | flex | 536+696 | ok 512.8w | 9x40 |
| connecting-git-tool@1440x900 | 1440 | 1440 | row | flex | 603+789 | ok 512.8w | 9x40 |
| connecting-git-tool@1024x600 | 1024 | 1024 | row | flex | 429+547 | ok 400.7w | 9x40 |
| no-repositories@390x900 | 390 | 390 | row | none | 342 | ok 117.2w | 9x30.9 |
| no-repositories@414x900 | 414 | 414 | row | none | 366 | ok 117.2w | 9x33.6 |
| no-repositories@767x900 | 767 | 767 | row | none | 719 | ok 117.2w | 9x35.6 |
| no-repositories@768x900 | 768 | 768 | row | flex | 313+383 | ok 117.2w | 9x26.6 |
| no-repositories@1023x900 | 1023 | 1023 | row | flex | 419+532 | ok 117.2w | 9x35.6 |
| no-repositories@1024x900 | 1024 | 1024 | row | flex | 419+533 | ok 117.2w | 9x35.6 |
| no-repositories@1280x900 | 1280 | 1280 | row | flex | 526+682 | ok 117.2w | 9x35.6 |
| no-repositories@1440x900 | 1440 | 1440 | row | flex | 593+775 | ok 117.2w | 9x35.6 |
| organization-account-required@390x900 | 390 | 390 | row | none | 342 | ok 117.2w | 9x30.9 |
| organization-account-required@414x900 | 414 | 414 | row | none | 366 | ok 117.2w | 9x33.6 |
| organization-account-required@767x900 | 767 | 767 | row | none | 719 | ok 117.2w | 9x35.6 |
| organization-account-required@768x900 | 768 | 768 | row | flex | 313+383 | ok 117.2w | 9x26.6 |
| organization-account-required@1023x900 | 1023 | 1023 | row | flex | 419+532 | ok 117.2w | 9x35.6 |
| organization-account-required@1024x900 | 1024 | 1024 | row | flex | 419+533 | ok 117.2w | 9x35.6 |
| organization-account-required@1280x900 | 1280 | 1280 | row | flex | 526+682 | ok 117.2w | 9x35.6 |
| organization-account-required@1440x900 | 1440 | 1440 | row | flex | 593+775 | ok 117.2w | 9x35.6 |
| choose-workspace@390x900 | 390 | 390 | row | none | 342 | ok 342w | 9x30.9 |
| choose-workspace@414x900 | 414 | 414 | row | none | 366 | ok 366w | 9x33.6 |
| choose-workspace@767x900 | 767 | 767 | row | none | 719 | ok 384w | 9x35.6 |
| choose-workspace@768x900 | 768 | 768 | row | flex | 313+383 | ok 303.3w | 9x26.6 |
| choose-workspace@1023x900 | 1023 | 1023 | row | flex | 419+532 | ok 384w | 9x35.6 |
| choose-workspace@1024x900 | 1024 | 1024 | row | flex | 419+533 | ok 384w | 9x35.6 |
| choose-workspace@1280x900 | 1280 | 1280 | row | flex | 526+682 | ok 384w | 9x35.6 |
| choose-workspace@1440x900 | 1440 | 1440 | row | flex | 593+775 | ok 384w | 9x35.6 |
| choosing-repositories@390x900 | 390 | 390 | row | none | 342 | ok 342w | 9x30.9 |
| choosing-repositories@414x900 | 414 | 414 | row | none | 366 | ok 366w | 9x33.6 |
| choosing-repositories@767x900 | 767 | 767 | row | none | 719 | ok 600w | 9x40 |
| choosing-repositories@768x900 | 768 | 768 | row | flex | 313+383 | ok 303.3w | 9x26.6 |
| choosing-repositories@1023x900 | 1023 | 1023 | row | flex | 419+532 | ok 452.1w | 9x40 |
| choosing-repositories@1024x900 | 1024 | 1024 | row | flex | 419+533 | ok 452.7w | 9x40 |
| choosing-repositories@1280x900 | 1280 | 1280 | row | flex | 526+682 | ok 600w | 9x40 |
| choosing-repositories@1440x900 | 1440 | 1440 | row | flex | 593+775 | ok 600w | 9x40 |

## M12 local first parent vs merge (375x812 and 1440x900)

| build | route@width | Page.Root scrollWidth | columns | side | CTA right edge | bar width / row scrollWidth vs clientWidth |
|---|---|---|---|---|---|---|
| parent | creating-workspace@375 | 632 | 96+464 | flex | 384 | 40 / 424 vs 384 |
| parent | creating-workspace@1440 | 1440 | 593+775 | flex | 1220.3 | 40 / 424 vs 384 |
| parent | connecting-git-tool@375 | 966 | 235+659 | flex | 512.7 | 40 / 579 vs 579 |
| parent | connecting-git-tool@1440 | 1440 | 593+775 | flex | 1284.7 | 40 / 579 vs 579 |
| parent | no-repositories@375 | 757 | 221+464 | flex | 375.4 | 40 / 424 vs 384 |
| parent | no-repositories@1440 | 1440 | 593+775 | flex | 953.5 | 40 / 424 vs 384 |
| parent | organization-account-required@375 | 757 | 221+464 | flex | 375.4 | 40 / 424 vs 384 |
| parent | organization-account-required@1440 | 1440 | 593+775 | flex | 953.5 | 40 / 424 vs 384 |
| parent | choose-workspace@375 | 632 | 96+464 | flex | 384 | 40 / 424 vs 384 |
| parent | choose-workspace@1440 | 1440 | 593+775 | flex | 1220.3 | 40 / 424 vs 384 |
| parent | marketing-survey@375 | 375 | 327+327 | flex | - | 40 / 424 vs 424 |
| parent | marketing-survey@1440 | 1440 | 593+775 | flex | - | 40 / 695 vs 695 |
| merge | creating-workspace@375 | 375 | 327 | none | 351 | 29.2 / 327 vs 327 |
| merge | creating-workspace@1440 | 1440 | 593+775 | flex | 1220.3 | 35.6 / 384 vs 384 |
| merge | connecting-git-tool@375 | 375 | 327 | none | 318 | 29.2 / 327 vs 327 |
| merge | connecting-git-tool@1440 | 1440 | 603+789 | flex | 1277.7 | 40 / 579 vs 579 |
| merge | no-repositories@375 | 375 | 327 | none | 141.2 | 29.2 / 327 vs 327 |
| merge | no-repositories@1440 | 1440 | 593+775 | flex | 953.5 | 35.6 / 384 vs 384 |
| merge | organization-account-required@375 | 375 | 327 | none | 141.2 | 29.2 / 327 vs 327 |
| merge | organization-account-required@1440 | 1440 | 593+775 | flex | 953.5 | 35.6 / 384 vs 384 |
| merge | choose-workspace@375 | 375 | 327 | none | 351 | 29.2 / 327 vs 327 |
| merge | choose-workspace@1440 | 1440 | 593+775 | flex | 1220.3 | 35.6 / 384 vs 384 |
| merge | marketing-survey@375 | 375 | 327+327 | flex | - | 40 / 424 vs 424 |
| merge | marketing-survey@1440 | 1440 | 593+775 | flex | - | 40 / 695 vs 695 |
| parent-choosing | choosing-repositories@375 | 973 | 221+680 | flex | 600 | 40 / 600 vs 600 |
| parent-choosing | choosing-repositories@1440 | 1440 | 593+775 | flex | 1328.3 | 40 / 600 vs 600 |
| local-parent-siblings | marketing-survey@375 | 375 | 327+327 | flex | 448 | 40 / 424 vs 424 |
| local-parent-siblings | marketing-survey@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-parent-siblings | select-reviewers@375 | 448 | 327+327 | flex | 351 | 40 / 424 vs 327 |
| local-parent-siblings | select-reviewers@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-parent-siblings | review-mode@375 | 448 | 327+327 | flex | 351 | 40 / 424 vs 327 |
| local-parent-siblings | review-mode@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-parent-siblings | customize-team@375 | 448 | 327+327 | flex | 351 | 40 / 424 vs 327 |
| local-parent-siblings | customize-team@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-merge-siblings | marketing-survey@375 | 375 | 327+327 | flex | 448 | 40 / 424 vs 424 |
| local-merge-siblings | marketing-survey@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-merge-siblings | select-reviewers@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| local-merge-siblings | select-reviewers@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-merge-siblings | review-mode@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| local-merge-siblings | review-mode@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| local-merge-siblings | customize-team@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| local-merge-siblings | customize-team@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| qa-siblings | marketing-survey@375 | 375 | 327+327 | flex | 448 | 40 / 424 vs 424 |
| qa-siblings | marketing-survey@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| qa-siblings | select-reviewers@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| qa-siblings | select-reviewers@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| qa-siblings | review-mode@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| qa-siblings | review-mode@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |
| qa-siblings | customize-team@375 | 375 | 327+327 | flex | 351 | 29.2 / 327 vs 327 |
| qa-siblings | customize-team@1440 | 1440 | 593+775 | flex | 1376 | 40 / 695 vs 695 |

## X1 marketing-survey on QA (merge)

- 320px: step row 424px wide (bars 40px), last bar right edge 448 > viewport 320; 13 of 14 buttons extend past the viewport (right edge 448); ScrollArea viewport scrollWidth 424 vs clientWidth 272
- 375px: step row 424px wide (bars 40px), last bar right edge 448 > viewport 375; 13 of 14 buttons extend past the viewport (right edge 448); ScrollArea viewport scrollWidth 424 vs clientWidth 327
- 390px: step row 424px wide (bars 40px), last bar right edge 448 > viewport 390; 13 of 14 buttons extend past the viewport (right edge 448); ScrollArea viewport scrollWidth 424 vs clientWidth 342

## X2 stale-repository warning with a 100-character repository name (browser fixture of the list read)

- hyphen100@375: Page.Root scrollWidth 375 vs 375; alert scrollWidth 325 vs clientWidth 325
- hyphen100@1440: Page.Root scrollWidth 1440 vs 1440; alert scrollWidth 598 vs clientWidth 598
- unbroken100@375: Page.Root scrollWidth 717 vs 375; alert scrollWidth 692 vs clientWidth 325
- unbroken100@1440: Page.Root scrollWidth 1440 vs 1440; alert scrollWidth 692 vs clientWidth 598

## M13 assets (unauthenticated curl, no redirect)

```
/assets/images/trusted-by/scorpion.svg 200 image/svg+xml 1821 redirect=
/assets/images/trusted-by/cover-genius.svg 200 image/svg+xml 4268 redirect=
/assets/images/trusted-by/capim.svg 200 image/svg+xml 4419 redirect=
/assets/images/trusted-by/rocket-chat.webp 200 image/webp 8370 redirect=
/assets/images/testimonials/jonathan-georgeu.jpg 200 image/jpeg 7767 redirect=
/_next/image?url=%2Fassets%2Fimages%2Ftrusted-by%2Frocket-chat.webp&w=256&q=75 200 image/jpeg 2704 redirect=
/_next/image?url=%2Fassets%2Fimages%2Ftrusted-by%2Frocket-chat.webp&w=384&q=75 200 image/jpeg 4214 redirect=
trusted-by/scorpion.svg e544d30daff468e49e71175aeeb1eb7dd42ca33a
trusted-by/cover-genius.svg 194f2ac6533806850bc5200457ff1925477daf57
trusted-by/capim.svg 7d68bfd094083d5d486d22b2c28de530002e4e77
trusted-by/rocket-chat.webp 0b38eb569c54538f21e7f34611ed752a37aa924a
testimonials/jonathan-georgeu.jpg 02b8ecc83e1a1a898f1a7c4b8c0a1c7c37d98c9d
```
(second block: git blob hash of the bytes QA served; each equals the blob at eee5562a7)

