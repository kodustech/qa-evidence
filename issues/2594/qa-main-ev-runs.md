# QA #2594 slot a: test PRs, automation_execution rows and notice counts

Rows: uuid, status, origin, created (UTC), dataExecution.licenseNoticePostedAt, status message. Counts read from each provider API after the last run.

## m2-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/2

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('lock', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| c967c2d6-b736-4627-8bf9-b4dbf05b939a | skipped | System | 03:00:57 | 2026-11-24T03:00:58.236Z | User Not Licensed — Assign seat to user |
| be4faaab-3559-4d26-98be-f18c270be3f5 | skipped | System | 03:03:59 | - | User Not Licensed — Assign seat to user |
| 7c895206-3744-46bc-8b67-3c342dc89e2a | skipped | System | 03:04:52 | - | User Not Licensed — Assign seat to user |
| 594cecf8-d455-4b95-bd0e-a32856121bb7 | skipped | command | 03:05:43 | - | User Not Licensed — Assign seat to user |
| 88b815a5-536c-4ba7-b595-cf049d7a8219 | success | command | 03:52:46 | - |  |

## m3-bitbucket: https://bitbucket.org/kodustech/claude-athena/pull-requests/2

- notices: 1, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| a3cd4755-b65c-41b1-a0d5-c53069f9ef40 | skipped | System | 03:01:12 | 2026-11-24T03:01:14.939Z | User Not Licensed — Assign seat to user |
| 6cfb4549-75b2-41cc-b6b3-7b0d4b11d2e6 | skipped | System | 03:04:08 | - | User Not Licensed — Assign seat to user |
| 2d5c549c-80b3-4730-b5ee-00c631bda4a3 | skipped | System | 03:05:00 | - | User Not Licensed — Assign seat to user |
| 72883eb7-64aa-410d-9679-6636f2a2239d | skipped | command | 03:05:48 | - | User Not Licensed — Assign seat to user |
| 2c05d6a1-4093-4046-9043-10640285dab1 | success | command | 03:52:53 | - |  |

## m4-azure: https://dev.azure.com/kodus/Kodus%20QA/_git/claude-athena/pullrequest/208

- notices: 1, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 3efa79b4-26b8-429a-ae78-33a96b2605e8 | skipped | System | 03:01:28 | 2026-11-24T03:01:29.360Z | User Not Licensed — Assign seat to user |
| a2b15816-3c95-4a8d-9290-67f207dab884 | skipped | System | 03:04:40 | - | User Not Licensed — Assign seat to user |
| 78821702-f255-4f54-b669-388920f0d152 | skipped | System | 03:05:08 | - | User Not Licensed — Assign seat to user |
| a9370880-68d3-4e50-9b72-26a6838acc99 | skipped | command | 03:05:57 | - | User Not Licensed — Assign seat to user |
| f787e8c9-9a2a-482a-b0a9-e6638cb62010 | success | command | 03:53:01 | - |  |

## m5-forgejo: https://codeberg.org/kodus/claude-athena/pulls/2

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 17ed5bf0-f02f-43ee-b884-69d84a58fb7e | skipped | System | 03:01:32 | 2026-11-24T03:01:33.599Z | User Not Licensed — Assign seat to user |
| a8edfcfb-15ef-410c-bd6d-9112f7b36da8 | skipped | System | 03:04:40 | - | User Not Licensed — Assign seat to user |
| 7e1aed58-2451-47aa-b3d2-70bd9fb41129 | skipped | System | 03:05:18 | - | User Not Licensed — Assign seat to user |
| 0d58adb3-bef8-4199-9218-5d095a248311 | skipped | command | 03:05:51 | - | User Not Licensed — Assign seat to user |

## m1-github: https://github.com/kodus-olimpo/claude-athena/pull/3

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| c3e63057-c5a2-4c5c-9d37-c1a01b4aa315 | success | System | 03:09:23 | - |  |
| 96ed3421-bbfe-48d1-bc7e-c27c5a9a409d | skipped | System | 03:27:23 | 2026-11-24T03:27:26.271Z | User Not Licensed — Assign seat to user |
| 4d0212a4-06ca-497d-991e-66f5f43cbb64 | skipped | System | 03:28:23 | - | User Not Licensed — Assign seat to user |

## m23-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/3

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('lock', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| fb23a692-8cb6-4997-b647-ff0e7f42d082 | skipped | System | 03:11:05 | 2026-11-24T03:11:06.455Z | User Not Licensed — Assign seat to user |
| bbeb221b-6611-4d61-9207-4484aee4a792 | skipped | System | 03:11:08 | - | User Not Licensed — Assign seat to user |
| ac5ac585-e979-40b9-a7c2-0a0c2cf5efb9 | skipped | System | 03:11:10 | - | User Not Licensed — Assign seat to user |

## m8-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/4

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('lock', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| cb5420e2-5d1f-4d2b-a852-42c122dc88df | skipped | System | 03:13:03 | - | User Not Licensed — Assign seat to user |
| 51e283e9-877a-4888-80d4-b65cffa4e087 | skipped | System | 03:13:34 | - | User Not Licensed — Assign seat to user |
| 7b67af12-794d-4e63-ba0f-aa4b7dea62f4 | skipped | System | 03:14:03 | 2026-11-24T03:14:04.715Z | User Not Licensed — Assign seat to user |
| 24995c45-43c8-46ce-a931-6bb2d21431b8 | skipped | System | 03:14:21 | - | User Not Licensed — Assign seat to user |

## m15-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/5

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('lock', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| bfb016e5-7136-4424-a688-57aabc89507b | skipped | System | 03:14:47 | 2026-11-24T03:14:48.258Z | User Not Licensed — Assign seat to user |
| a72fdbb3-40eb-4093-ba47-aa4a60773d2e | skipped | System | 03:15:45 | - | User Not Licensed — Assign seat to user |

## m16-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/6

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('eyes', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 3b8ef7df-6469-41bb-9cd5-2ed0522a0563 | skipped | System | 03:16:55 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 6c1432ec-7ef3-4879-8df8-0c78dd51a603 | skipped | command | 03:17:55 | 2026-11-24T03:17:56.771Z | User Not Licensed — Assign seat to user |
| 6b76b720-6aa4-4f8e-87b9-f9b91ce79624 | skipped | System | 03:19:03 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |

## m16-bitbucket: https://bitbucket.org/kodustech/claude-athena/pull-requests/3

- notices: 1, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 40d223ee-2270-4562-95cc-8282094e82e0 | skipped | System | 03:19:55 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 76be7b7c-bd85-4c34-ab05-23fa3f51d7a6 | skipped | command | 03:21:14 | 2026-11-24T03:21:14.687Z | User Not Licensed — Assign seat to user |
| 9ac82c81-8667-469b-88f2-da759ced5048 | skipped | System | 03:22:16 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 80739092-27ee-4269-98fc-72908b5fe37c | skipped | command | 03:22:32 | - | User Not Licensed — Assign seat to user |

## m18-bitbucket: https://bitbucket.org/kodustech/claude-athena/pull-requests/4

- notices: 1, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 351c5a9a-1e52-4956-8370-ef4eb944e2a5 | skipped | System | 03:20:07 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 61c0faa1-0a6d-4bc1-a1ed-b986fe4b6494 | skipped | command | 03:22:11 | 2026-11-24T03:22:12.221Z | User Not Licensed — Assign seat to user |
| 1323c715-6612-40f5-af7b-a5c40c0c8b1b | skipped | System | 03:23:45 | - | User Not Licensed — Assign seat to user |

## m16-azure: https://dev.azure.com/kodus/Kodus%20QA/_git/claude-athena/pullrequest/209

- notices: 1, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| b1261fd1-8d1d-4265-b873-d0d83d0c3fc2 | skipped | System | 03:24:58 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| af32e0cb-87c7-4e7d-bcaf-601e28e56997 | skipped | command | 03:25:48 | 2026-11-24T03:25:49.051Z | User Not Licensed — Assign seat to user |
| dd147ce6-a0e3-4a78-b23e-49a11a213f5b | skipped | System | 03:26:36 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |

## m14a-github: https://github.com/kodus-olimpo/claude-athena/pull/3

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| c3e63057-c5a2-4c5c-9d37-c1a01b4aa315 | success | System | 03:09:23 | - |  |
| 96ed3421-bbfe-48d1-bc7e-c27c5a9a409d | skipped | System | 03:27:23 | 2026-11-24T03:27:26.271Z | User Not Licensed — Assign seat to user |
| 4d0212a4-06ca-497d-991e-66f5f43cbb64 | skipped | System | 03:28:23 | - | User Not Licensed — Assign seat to user |

## m1gh: https://github.com/kodus-olimpo/claude-athena/pull/4

- notices: 0, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| cb7a8577-a02e-4a6a-ac30-c222c15becc7 | skipped | System | 03:28:32 | 2026-11-24T03:28:35.694Z | User Not Licensed — Assign seat to user |
| 121b57da-c2d0-45b6-9302-79f64efb7c74 | skipped | System | 03:29:40 | - | User Not Licensed — Assign seat to user |
| 1e89ec75-c1f7-4c4f-897c-68ab7a33a366 | skipped | System | 03:30:00 | - | User Not Licensed — Assign seat to user |
| 1a5efb0a-4189-4bd4-8b1b-ac3708bfd72b | skipped | command | 03:30:16 | - | User Not Licensed — Assign seat to user |
| 6f0d075b-1f4e-411f-9b70-cc16f1b9dccb | skipped | System | 03:41:48 | - | User Not Licensed — Assign seat to user |
| f48dc9dc-db07-478e-803f-a86ee3204d10 | success | command | 03:52:57 | - |  |

## m7-github: https://github.com/kodus-olimpo/claude-athena/pull/5

- notices: 0, old 'User License not found' comments: 0, PR reactions: []

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 694cf960-2545-4772-aeb5-9b0d4d2f4344 | skipped | System | 03:30:55 | - | User Not Licensed — Assign seat to user |

## m9-github: https://github.com/kodus-olimpo/claude-athena/pull/6

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| af532aec-300c-4474-8d21-ac76065080a1 | skipped | System | 03:32:19 | 2026-11-24T03:32:22.105Z | User Not Licensed — Assign seat to user |

## m9b-github: https://github.com/kodus-olimpo/claude-athena/pull/7

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| bcb6308a-479c-4f0d-a0d2-56c8973f1655 | skipped | System | 03:33:33 | 2026-11-24T03:33:35.983Z | User Not Licensed — Assign seat to user |

## m11a-github: https://github.com/kodus-olimpo/claude-athena/pull/8

- notices: 0, old 'User License not found' comments: 0, PR reactions: [('eyes', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 4d403bfb-0cae-468c-a08b-955f0aacaa2c | skipped | System | 03:35:17 | - | User is ignored by configuration. |

## m11b-github: https://github.com/kodus-olimpo/claude-athena/pull/9

- notices: 0, old 'User License not found' comments: 0, PR reactions: [('eyes', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 39fa40b9-378f-48c6-a7a7-b17cfca1b7f2 | skipped | System | 03:36:32 | - | User is ignored by configuration. |

## m22-github: https://github.com/kodus-olimpo/claude-athena/pull/10

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 1fd16fe8-fb56-49ef-ba52-a5e6c35ae591 | skipped | System | 03:37:52 | 2026-11-24T03:37:55.904Z | User Not Licensed — Assign seat to user |
| e04988cb-3c02-404d-9e05-f9238eaccad8 | skipped | command | 03:38:08 | - | User Not Licensed — Assign seat to user |

## m26a-forgejo: https://codeberg.org/kodus/claude-ares/pulls/1

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 360054f0-1f20-4ea2-91d2-302f1c5f829c | skipped | System | 03:40:01 | 2026-11-24T03:40:02.961Z | User Not Licensed — Assign seat to user |

## m26b-forgejo: https://codeberg.org/kodus/claude-ares/pulls/2

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 5e031e5c-d472-4e95-9dda-77b279758609 | skipped | System | 03:40:27 | 2026-11-24T03:40:29.385Z | User Not Licensed — Assign seat to user |

## m32-forgejo: https://codeberg.org/kodus/claude-athena/pulls/3

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('-1', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| b52ccbaf-e94d-42b9-9f63-05a11fbc6afc | skipped | System | 03:42:59 | 2026-11-24T03:43:00.870Z | User Not Licensed — Assign seat to user |

## m17a-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/7

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('eyes', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| a458c897-3d5b-46da-b15f-feefcdd34db8 | skipped | System | 03:45:10 | - | Automated Review is disabled — Enable 'Automated Code Review' in General Setting |
| 8695e73e-1870-44d1-b416-883c8bec5675 | skipped | command | 03:45:41 | 2026-11-24T03:45:42.987Z | User Not Licensed — Assign seat to user |
| 66100bf2-cf03-4b66-bf01-5768e6b9b595 | success | command | 03:56:00 | - |  |

## m10-github: https://github.com/kodus-olimpo/claude-athena/pull/11

- notices: 0, old 'User License not found' comments: 0, PR reactions: [('hooray', 'sartorijr92')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 6d26c732-465c-4adc-8d2e-010d17c0fdbe | success | System | 03:50:14 | - |  |

## m13-gitlab: https://gitlab.com/sartorijr/claude-athena/-/merge_requests/8

- notices: 1, old 'User License not found' comments: 0, PR reactions: [('lock', 'sartorijr')]

| uuid | status | origin | created | licenseNoticePostedAt | message |
|---|---|---|---|---|---|
| 2667b3ec-4e50-49c6-b586-c51c9f357c55 | success | System | 03:55:55 | - |  |
| e176b7cc-e3f1-4d19-ab27-460a6cf0a219 | skipped | System | 03:59:01 | 2026-11-24T03:59:02.834Z | User Not Licensed — Assign seat to user |
| 4457bdb7-802d-4d96-859d-8a964bf13ff3 | skipped | System | 04:00:02 | - | User Not Licensed — Assign seat to user |

## m30-github (trial org, before the plan change): https://github.com/kodus-olimpo/claude-athena/pull/2

- {'comments': 1, 'notices': 0, 'old_user_msg': 0, 'docs_emoji': 0, 'reactions': [('hooray', 'sartorijr92')]}

| 2488d445-6023-476f-8664-afc7365bef47 | success | System | 02:56:50 | - |
