# #2430 QA: POST /organization-parameters/list-models on qa.api.kodus.io

Org: PoisonIvy (QA). Each call passes a candidate apiKey + baseURL in the body (strict live listing). Fixtures are static files under https://kodustech.github.io/qa-evidence/issues/2430/fixtures/ (dummy key).

Fixtures: `bare/v1/models` = `[{"id":"qa-2430/bare-model-a"},{"object":"model"},null,"x",{"id":42},{"id":"qa-2430/bare-model-b"}]`; `malformed/v1/models` = `{"object":"list","data":"not-a-list"}`; `nodata/v1/models` = `{"object":"list"}`.

| case | time (UTC) | HTTP | models | exercisedCredential | DeepSeek ids / sample / error |
|---|---|---|---|---|---|
| S1 Together api.together.xyz bare array | 2026-11-19T17:36:41 | 201 | 272 | True | deepseek-ai/DeepSeek-V4.1-Flash-1017, deepseek-ai/DeepSeek-V4.1-Flash, deepseek-ai/DeepSeek-V4-Pro-0813 |
| S2 Together api.together.ai (issue URL) | 2026-11-19T17:36:43 | 201 | 272 | True | deepseek-ai/DeepSeek-V4.1-Flash-1017, deepseek-ai/DeepSeek-V4.1-Flash, deepseek-ai/DeepSeek-V4-Pro-0813 |
| S3 fixture bare array w/ invalid entries | 2026-11-19T17:36:44 | 201 | 2 | True | qa-2430/bare-model-a, qa-2430/bare-model-b |
| S4 fixture malformed data | 2026-11-19T17:36:45 | 400 | - | - | {"statusCode": 400, "timestamp": "2026-11-19T17:36:45.816Z", "path": "/organization-parameters/list-models", "error": "Bad Request", "message": "Error fetching openai_compatible models: Malformed /models response: `data` is not an array"} |
| S5 fixture no data key | 2026-11-19T17:36:45 | 201 | 0 | True |  |
| R1 Fireworks {data:[...]} | 2026-11-19T17:36:48 | 201 | 31 | True | accounts/fireworks/routers/spot-deepseek-v4-flash, accounts/fireworks/models/deepseek-v4p1-flash, accounts/fireworks/routers/deepseek-v4p1-flash-spot, accounts/fireworks/models/deepseek-v4p1-flash-1017, accounts/fireworks/routers/deepseek-v4p1-flash-1017-spot, accounts/fireworks/routers/deepseek-v4p1-flash-1017-ultrafast |
| R2 native OpenAI | 2026-11-19T17:36:50 | 201 | 54 | True | gpt-5, gpt-4o, gpt-5.4-nano |
| R3 OpenRouter | 2026-11-19T17:37:05 | 201 | 444 | True | deepseek/deepseek-v4.1-flash-1017, deepseek/deepseek-v4.1-flash-1017:batch, deepseek/deepseek-v4.1-flash, deepseek/deepseek-v4.1-flash:batch, deepseek/deepseek-v4-flash-vision-exp, deepseek/deepseek-v4-pro-0813 |
| S4 fixture malformed data | 2026-11-19T17:37:07 | 400 | - | - | {"statusCode": 400, "timestamp": "2026-11-19T17:37:09.135Z", "path": "/organization-parameters/list-models", "error": "Bad Request", "message": "Error fetching openai_compatible models: Malformed /models response: `data` is not an array"} |

Mongo `observability_logs_ts` (metadata.organizationId = QA org, 17:36-17:38 UTC):

```
2026-11-19T17:36:45.814Z warn GetModelsByProviderUseCase "Live model listing for openai_compatible failed" error="Malformed /models response: `data` is not an array"
2026-11-19T17:37:09.134Z warn GetModelsByProviderUseCase "Live model listing for openai_compatible failed" error="Malformed /models response: `data` is not an array"
```
