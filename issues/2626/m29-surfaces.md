# M29: per-attempt surfaces

Repo state = the GraphIndexerService line logged at each job's completion (status and counts it persisted); sha = the job's own headSha/newSha; E2B = lifecycle events of this run's sandbox ids.

| job | type | job status | started -> completed (UTC) | repo | sha (job) | indexer line at completion | sandbox | E2B killed (reason) | paused |
|---|---|---|---|---|---|---|---|---|---|
| caef0da6 | BUILD | COMPLETED | 21:40:58.782 -> 21:41:06.05 | a847a63e | ed94ae36 | 21:41:06.050 [AST-GRAPH] Full build COMPLETE in 7263ms — 16 nodes, 27 edges | i1aui4c93mt8s2w7oobfs | 21:41:06.136 request | False |
| 639b9376 | BUILD | COMPLETED | 21:40:58.973 -> 21:41:06.092 | 79eb3cad | 30ce3917 | 21:41:06.090 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | i1rpql0j5ta4ez3hw4jq9 | 21:41:06.341 request | False |
| f67c0daa | BUILD | COMPLETED | 21:41:39.907 -> 21:41:46.836 | 7a96b2b3 | 4c4f9739 | 21:41:46.834 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | inftht98hisqklme11m0m | 21:41:46.914 request | False |
| c8d27943 | BUILD | COMPLETED | 21:41:40.752 -> 21:41:47.827 | 55a5bccb | 85c29b13 | 21:41:47.824 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | iz8x3qicoknoycm2q8bmn | 21:41:48.054 request | False |
| 7d44ee4c | BUILD | COMPLETED | 21:41:41.979 -> 21:42:07.501 | b8e6e249 | f1f51774 | 21:42:07.500 [AST-GRAPH] Full build COMPLETE in 25516ms — 16 nodes, 27 edges | i850yuc8yt4i14pnwho9o | 21:42:07.571 request | False |
| f4184fd0 | BUILD | COMPLETED | 21:41:42.532 -> 21:42:03.799 | 522d4f46 | 31c39e07 | 21:42:03.799 [AST-GRAPH] Full build COMPLETE in 21262ms — 16 nodes, 27 edges | iku4t3d982z6yhx8wun9f | 21:42:03.877 request | False |
| 94bc398a | BUILD | COMPLETED | 21:41:43.382 -> 21:42:27.721 | 149cbc06 | aaf3435a | 21:42:27.721 [AST-GRAPH] Full build COMPLETE in 44333ms — 16 nodes, 27 edges | im6hh7y1u8ecwlkezec0k | 21:42:27.802 request | False |
| ee00272a | BUILD | COMPLETED | 21:41:51.6 -> 21:41:58.74 | ee76a9bf | 3d5e61f6 | 21:41:58.737 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | id87mupb7orj2kekwcx67 | 21:41:58.821 request | False |
| 7086519f | BUILD | COMPLETED | 21:41:53.374 -> 21:42:05.965 | f896b309 | 8a362121 | 21:42:05.963 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | iu928soqp6kkoqzdws47h | 21:42:06.029 request | False |
| d5d4d2af | BUILD | COMPLETED | 21:42:03.659 -> 21:42:11.934 | cda0f034 | 729af6fa | 21:42:11.933 [AST-GRAPH] Full build COMPLETE in 8267ms — 16 nodes, 27 edges | ik54pddkesbm90qbsyirj | 21:42:12.199 request | False |
| 614acebc | INCREMENTAL | COMPLETED | 21:54:00.173 -> 21:54:06.854 | a847a63e | f4da56ce | 21:54:06.853 [AST-GRAPH] Incremental update COMPLETE in 6670ms — 16 nodes, 26 edges from 4 files | imwhbnpimp8iy3zqae5yk | 21:54:06.916 request | False |
| 32e6a599 | INCREMENTAL | COMPLETED | 21:54:08.508 -> 21:54:25.039 | b8e6e249 | a34382c8 | 21:54:25.039 [AST-GRAPH] Incremental update COMPLETE in 16526ms — 16 nodes, 26 edges from 4 files | ikshk74azy4jh2fyj1gvk | 21:54:25.287 request | False |
| 902695e9 | INCREMENTAL | COMPLETED | 21:54:25.443 -> 21:54:32.412 | 149cbc06 | 94251af0 | 21:54:32.412 [AST-GRAPH] Incremental update COMPLETE in 6964ms — 16 nodes, 27 edges from 4 files | ifpooyo10nso8gapq313b | 21:54:32.508 request | False |
| d8940aa8 | INCREMENTAL | COMPLETED | 21:54:28.18 -> 21:54:40.663 | cda0f034 | cd4ca666 | 21:54:40.663 [AST-GRAPH] Incremental update COMPLETE in 12478ms — 16 nodes, 26 edges from 4 files | i3yotu4aa6gezb89u2gsj | 21:54:40.742 request | False |
| 11352106 | BUILD | COMPLETED | 22:00:43.272 -> 22:00:55.796 | a847a63e | f4da56ce | 22:00:55.795 [AST-GRAPH] Full build COMPLETE in 12518ms — 16 nodes, 27 edges | iftfrc9m3r5hwb3dmj76v | 22:00:55.877 request | False |
| 223e0169 | BUILD | COMPLETED | 22:00:43.639 -> 22:00:50.818 | 79eb3cad | 30ce3917 | 22:00:50.815 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | iy5ykgki8cw2xynez7maw | 22:00:50.898 request | False |
| 512c388b | INCREMENTAL | COMPLETED | 23:19:38.876 -> 23:20:07.48 | a847a63e | e460ae64 | 23:20:07.480 [AST-GRAPH] Incremental update COMPLETE in 28600ms — 18 nodes, 31 edges from 1 files | ijxtz9wufwhvem26wq90e | 23:20:07.566 request | False |
| eb0ff383 | INCREMENTAL | COMPLETED | 23:19:45.649 -> 23:19:53.879 | a847a63e | abaf2278 | 23:19:53.879 [AST-GRAPH] Incremental update COMPLETE in 8226ms — 17 nodes, 29 edges from 1 files | i6ko3hm4glos3b6wzpzd5 | 23:19:53.962 request | False |
| d1d732df | BUILD | COMPLETED | 23:29:59.192 -> 23:30:19.611 | a847a63e | abaf2278 | 23:30:19.611 [AST-GRAPH] Full build COMPLETE in 20414ms — 18 nodes, 32 edges | i4bns263cug2yulbjze4b | 23:30:19.681 request | False |
| 0c0e3136 | BUILD | COMPLETED | 23:29:59.478 -> 23:30:06.526 | 79eb3cad | 30ce3917 | 23:30:06.523 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | ibpfx1tx5a2l1fp1e76xp | 23:30:06.595 request | False |
| 9943b288 | BUILD | COMPLETED | 23:30:06.153 -> 23:30:12.598 | 149cbc06 | 94251af0 | 23:30:12.598 [AST-GRAPH] Full build COMPLETE in 6440ms — 16 nodes, 27 edges | ilg9ll1768qol142qyvyp | 23:30:12.679 request | False |
| 4d57beae | BUILD | COMPLETED | 23:30:08.627 -> 23:30:16.923 | ee76a9bf | 3d5e61f6 | 23:30:16.921 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | iu2z3iszkvcaped0rarth | 23:30:17.166 request | False |
| 246472ee | BUILD | COMPLETED | 23:30:10.184 -> 23:30:29.701 | 55a5bccb | 85c29b13 | 23:30:29.698 [AST-GRAPH] Parse produced 0 nodes — marking as FAILED | i3pb6d1xu4zf9av5j3nyn | 23:30:29.946 request | False |
| 67ec9aa5 | BUILD | COMPLETED | 23:30:11.812 -> 23:30:23.724 | 522d4f46 | c6889d85 | 23:30:23.723 [AST-GRAPH] Full build COMPLETE in 11907ms — 17 nodes, 30 edges | ihy29dqx1bjf2xifs4c0e | 23:30:23.972 request | False |
| fe340761 | INCREMENTAL | COMPLETED | 01:01:03.936 -> 01:01:11.457 | a847a63e | 050b00d6 | 01:01:11.456 [AST-GRAPH] Incremental update COMPLETE in 7516ms — 19 nodes, 33 edges from 1 files | ij2z7p1bn7088q8e8szzw | 01:01:11.540 request | False |
