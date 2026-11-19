# #2372 backend `formatModelLabel` on QA

`POST /organization-parameters/list-models` on qa.api.kodus.io, 2026-11-19, after the backend restart at 14:16 UTC. Listing only, no completion call.

OpenAI's listing names every model through `formatModelLabel` (`libs/llm/providers/kernel/listing-helpers.ts:57`). Dated ids lose the `-YYYY-MM-DD` pin and never fuse month and day into a version:

| id | label on QA |
|---|---|
| `gpt-5-2025-08-07` | GPT 5 |
| `o3-pro-2025-06-10` | O3 Pro |
| `gpt-5.4-pro-2026-03-05` | GPT 5.4 Pro |
| `gpt-5-pro-2025-10-06` | GPT 5 Pro |
| `gpt-5.5-pro-2026-04-23` | GPT 5.5 Pro |
| `gpt-5.2-pro-2025-12-11` | GPT 5.2 Pro |
| `gpt-5.4-2026-03-05` | GPT 5.4 |
| `gpt-5-mini-2025-08-07` | GPT 5 Mini |
| `gpt-5.4-mini-2026-03-17` | GPT 5.4 Mini |
| `gpt-4o-2024-08-06` | GPT 4o |
| `o3` | O3 |
| `gpt-4.1` | GPT 4.1 |
| `gpt-4o` | GPT 4o |
| `gpt-5-search-api-2025-10-14` | GPT 5 Search API |
| `gpt-5.1-2025-11-13` | GPT 5.1 |
| `gpt-5-nano-2025-08-07` | GPT 5 Nano |
| `gpt-4o-mini-2024-07-18` | GPT 4o Mini |
| `gpt-4.1-2025-04-14` | GPT 4.1 |
| `gpt-4.1-mini-2025-04-14` | GPT 4.1 Mini |
| `gpt-5.4-nano-2026-03-17` | GPT 5.4 Nano |
| `o3-2025-04-16` | O3 |
| `gpt-5.2-2025-12-11` | GPT 5.2 |
| `gpt-4o-mini` | GPT 4o Mini |
| `gpt-4o-2024-11-20` | GPT 4o |
| `gpt-5.5-2026-04-23` | GPT 5.5 |

Anthropic's listing takes `display_name` from the API first (`libs/llm/providers/anthropic/listing.ts:22`), so it does not exercise the helper; it is listed for reference:

| id | label on QA |
|---|---|
| `claude-fable-5-2` | Claude Fable 5.2 |
| `claude-haiku-5-5` | Claude Haiku 5.5 |
| `claude-sonnet-5-5` | Claude Sonnet 5.5 |
| `claude-opus-5-5` | Claude Opus 5.5 |
| `claude-fable-5-1` | Claude Fable 5.1 |
| `claude-opus-5` | Claude Opus 5 |
| `claude-sonnet-5` | Claude Sonnet 5 |
| `claude-fable-5` | Claude Fable 5 |
| `claude-opus-4-8` | Claude Opus 4.8 |
| `claude-opus-4-7` | Claude Opus 4.7 |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `claude-opus-4-6` | Claude Opus 4.6 |
| `claude-opus-4-5-20251101` | Claude Opus 4.5 |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 |
