# PR thinking specs: merge vs strip reverted

## merge aeb08f11f
```
Test Suites: 3 passed, 3 total
Tests:       10 passed, 10 total
```
## mutant: merge with `compressed = withoutThinkingAfterFirstEdit(modelMsgs, compressed);` removed
```
FAIL libs/agent-harness/infrastructure/compression/context-window-compressor.thinking.spec.ts
  ● ContextWindowCompressor — thinking blocks after an edit › keeps thinking before the first truncated result and drops it after
    - Expected  - 0
    + Received  + 7
  ● ContextWindowCompressor — thinking blocks after an edit › keeps the thinking after a result the pass did not shorten
    - Expected  - 0
    + Received  + 6
FAIL libs/agent-harness/infrastructure/ai-sdk/ai-sdk-agent-runner.thinking-contract.e2e.spec.ts
  ● AiSdkAgentRunner + compression — Anthropic thinking contract › never replays a thinking block whose prefix compression changed
    - Expected  -  0
    + Received  + 62
Test Suites: 2 failed, 1 passed, 3 total
Tests:       3 failed, 7 passed, 10 total
```
