# #2428 on QA: DeepSeek V4.1 Flash (Fireworks, openai_compatible), org PoisonIvy, kodustech/poison_store#498

DeepSeek on Fireworks caches implicitly; `resolvePrefixCacheHint` returns no marker for `openai_compatible`,
so on this provider the PR changes only the shard scheduling (leader first, siblings after it returns).
Source: Langfuse v2 observations, environment `homolog`; cached = `usageDetails.input_cached_tokens`,
input_total = input + cached.

## Push 1, 2026-11-20 19:00:54Z (trace b629f848ed959c2ffc49c34f648214ea)

Log (observability_logs_ts, KodyRulesShardedAgent, 19:03:17Z):
`[kody-rules-shard] prompt cache: 8 file shard(s) in 1 head group(s), 1 shared; 3 of 7 sibling(s) ran after their group's first shard`

```
kodus-rules-review-agent.shard 19:01:32.470-19:01:51.011 file=None gen=19:01:32.480 input_total=2422 cached=0 (0%)
kodus-rules-review-agent.shard 19:01:32.472-19:01:48.499 file=None gen=19:01:32.481 input_total=2421 cached=0 (0%)
kodus-rules-review-agent.shard 19:01:32.475-19:02:23.679 file=None gen=19:01:32.481 input_total=2481 cached=0 (0%)
kodus-rules-review-agent.shard 19:01:32.477-19:01:59.579 file=None gen=19:01:32.481 input_total=2480 cached=0 (0%)
kodus-rules-review-agent.shard 19:01:56.403-19:02:10.483 file=None gen=19:01:56.404 input_total=2482 cached=1742 (70%)
kodus-rules-review-agent.shard 19:02:03.593-19:02:29.347 file=None gen=19:02:03.595 input_total=2482 cached=0 (0%)
kodus-rules-review-agent.shard 19:02:08.596-19:02:31.264 file=None gen=19:02:08.597 input_total=2480 cached=0 (0%)
kodus-rules-review-agent.shard 19:02:25.495-19:03:06.639 file=None gen=19:02:25.496 input_total=2478 cached=0 (0%)
```

## Push 2, 2026-11-20 19:05:23Z, same PR (trace 0b50e906fc38a9944d1f8774175c3f4c)

Log (19:07:58Z): `[kody-rules-shard] prompt cache: 8 file shard(s) in 1 head group(s), 1 shared; 2 of 7 sibling(s) ran after their group's first shard`

```
kodus-rules-review-agent.shard 19:05:38.852-19:06:36.902 file=None gen=19:05:38.865 input_total=5541 cached=1704 (31%)
kodus-rules-review-agent.shard 19:05:38.855-19:07:00.628 file=None gen=19:05:38.865 input_total=5540 cached=0 (0%)
kodus-rules-review-agent.shard 19:05:38.858-19:06:31.588 file=None gen=19:05:38.865 input_total=5084 cached=0 (0%)
kodus-rules-review-agent.shard 19:05:38.860-19:06:08.952 file=None gen=19:05:38.866 input_total=5083 cached=0 (0%)
kodus-rules-review-agent.shard 19:06:21.330-19:06:26.172 file=None gen=19:06:21.333 input_total=5085 cached=1920 (38%)
kodus-rules-review-agent.shard 19:06:26.177-19:06:38.808 file=None gen=19:06:26.179 input_total=5085 cached=1920 (38%)
kodus-rules-review-agent.shard 19:06:36.905-19:06:50.403 file=None gen=19:06:36.907 input_total=5083 cached=1920 (38%)
kodus-rules-review-agent.shard 19:06:37.453-19:07:58.840 file=None gen=19:06:37.455 input_total=5079 cached=1920 (38%)
```

## Detector compiler (`kody-rules.detector-compiler`), two rules saved 20 s apart

| save | trace | input total | cached |
|---|---|---|---|
| 19:01:03Z | 3a87cc0d10a809bb17a2407bbd3b6574 | 1,639 | 0 |
| 19:01:24Z | 7be472327d93f01fad9b8b572094d3e1 | 1,638 | 1,464 (89%) |
