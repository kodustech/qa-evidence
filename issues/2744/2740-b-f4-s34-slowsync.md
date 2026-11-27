# S34 compressor half: [SLOW-SYNC] context compressor token count

One tool message of N chars (code-like lines, emoji, first line a sentinel 'SENTINEL_TEXT_qa2744'), ContextWindowCompressor(200k).maybeCompress, countAtWorstCase false/true. merge aeb08f11f (m) vs parent b172fdbac (p). Sentinel occurrences in all logs: 0.

## s34-m-2000000.log
```
{"marker":"S34","worstCase":false,"chars":2000000,"ms":508,"compressed":true}
{"marker":"S34","worstCase":true,"chars":2000000,"ms":483,"compressed":true}
```

## s34-m-6000000.log
```
{"marker":"S34","worstCase":false,"chars":6000000,"ms":1736,"compressed":true}
{"marker":"S34","worstCase":true,"chars":6000000,"ms":1340,"compressed":true}
{"level":"warn","time":"2026-11-27T20:34:38.237Z","pid":87651,"serviceName":"SlowSync","context":"SlowSync","label":"context compressor token count","durationMs":1695,"messages":3,"chars":6210905,"largestChars":6210817,"largestRole":"tool","worstCase":false,"environment":"unknown","serviceName":"SlowSync","metadata":{"label":"context compressor token count","durationMs":1695,"messages":3,"chars":6210905,"largestChars":6210817,"largestRole":"tool","worstCase":false},"traceId":null,"spanId":null,"msg":"[SLOW-SYNC] context compressor token count held the event loop 1695ms"}
{"level":"warn","time":"2026-11-27T20:34:39.578Z","pid":87651,"serviceName":"SlowSync","context":"SlowSync","label":"context compressor token count","durationMs":1327,"messages":3,"chars":6210905,"largestChars":6210817,"largestRole":"tool","worstCase":true,"environment":"unknown","serviceName":"SlowSync","metadata":{"label":"context compressor token count","durationMs":1327,"messages":3,"chars":6210905,"largestChars":6210817,"largestRole":"tool","worstCase":true},"traceId":null,"spanId":null,"msg":"[SLOW-SYNC] context compressor token count held the event loop 1327ms"}
```

## s34-p-2000000.log
```
{"marker":"S34","worstCase":false,"chars":2000000,"ms":533,"compressed":true}
{"marker":"S34","worstCase":true,"chars":2000000,"ms":430,"compressed":true}
```

## s34-p-6000000.log
```
{"marker":"S34","worstCase":false,"chars":6000000,"ms":1413,"compressed":true}
{"marker":"S34","worstCase":true,"chars":6000000,"ms":1272,"compressed":true}
{"level":"warn","time":"2026-11-27T20:34:42.180Z","pid":87763,"serviceName":"SlowSync","context":"SlowSync","label":"context compressor token count","durationMs":1388,"messages":3,"environment":"unknown","serviceName":"SlowSync","metadata":{"label":"context compressor token count","durationMs":1388,"messages":3},"traceId":null,"spanId":null,"msg":"[SLOW-SYNC] context compressor token count held the event loop 1388ms"}
{"level":"warn","time":"2026-11-27T20:34:43.453Z","pid":87763,"serviceName":"SlowSync","context":"SlowSync","label":"context compressor token count","durationMs":1271,"messages":3,"environment":"unknown","serviceName":"SlowSync","metadata":{"label":"context compressor token count","durationMs":1271,"messages":3},"traceId":null,"spanId":null,"msg":"[SLOW-SYNC] context compressor token count held the event loop 1271ms"}
```
