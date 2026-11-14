# #2150 — native OpenAI BYOK with a custom base URL (QA)

- Env: qa.kodus.io (contains #2376), org poison, `kodustech/poison_store`. 2026-11-14 16:19–16:24 UTC.
- Endpoint: a local logging reverse proxy (method, path, status and a summary of each JSON body; the `Authorization` header is forwarded, never logged) behind a temporary ngrok HTTPS tunnel. `/v1/*` forwards to `api.openai.com`, `/fw/v1/*` to `api.fireworks.ai/inference/v1`. The tunnel was shut down after the run.

## Form
- AI providers → OpenAI → Edit: "Base URL (optional)" with the helper text sending Azure OpenAI to its own provider. [Screenshot](https://kodustech.github.io/qa-evidence/issues/2150/byok-openai-base-url.png).

## Through the base URL (proxy log)
| Call | Request seen by the proxy | Upstream |
|---|---|---|
| `POST /organization-parameters/list-models` `{provider: openai, baseURL: <tunnel>/v1}` | `GET /v1/models` | 401 (QA key not typed, see below) |
| `POST /organization-parameters/test-byok` `{openai, gpt-6-sol, medium, baseURL: <tunnel>/v1}` | `POST /v1/responses` `{"model": "gpt-6-sol", "store": false, "include": ["reasoning.encrypted_content"], "max_output_tokens": 16, "reasoning": {"effort": "medium", "summary": "detailed"}, "input_types": [], "item_reference": 0}` | 401, same reason |
| Test with `baseURL: <tunnel>/fw/v1`, model `accounts/fireworks/models/deepseek-v4p1-flash` | `POST /fw/v1/responses` `store: false`, `include: ["reasoning.encrypted_content"]` | 200, `ok: true` |
| List models, same base URL | `GET /fw/v1/models` | 200, models listed in the response |
| **Review** of [#446](https://github.com/kodustech/poison_store/pull/446) with that credential as the org default | 33 × `POST /fw/v1/responses`, all 200; `store: false` 33/33; `include: reasoning.encrypted_content` 33/33; structured calls with `text.format` `json_schema` + `strict: true`: 10; `item_reference`: 0 | review completed, 3 comments posted |

Effort: the probe with `gpt-6-sol` carries `reasoning: {effort: medium}`; the review calls with the DeepSeek id carry none, and the Test warns "the medium reasoning effort is not reaching this provider" (id-based effort for non-OpenAI ids is #2382).

## Base URL validation and regressions
| Test | Result |
|---|---|
| `http://<tunnel>/v1` | 400 `baseURL must use https:// for security.` |
| `https://169.254.169.254/v1` | 400 `baseURL resolves to a private or reserved address (169.254.169.254)…` |
| `https://localhost/v1` | 400 `… (127.0.0.1)…` |
| `https://api.openai.com` (no `/v1`) | `not_found` 404, message contains "The base URL has no API version, and OpenAI-protocol gateways usually serve under /v1" |
| OpenAI without base URL (Test) | answered by `api.openai.com` directly; 0 new requests at the proxy. The GPT-6 Sol reviews run earlier the same day on the stored OpenAI credential (no base URL) also left no proxy traffic. |
| `openai_compatible` Fireworks credential | non-secret fields identical before/after the OpenAI saves |
| Repointing the stored OpenAI credential to the tunnel with a blank key | refused (`apiKey is required…`), warn `BYOK save: refused to reuse a stored key across endpoints`: a stored key is not sent to a new host |

Not covered: a full review with an OpenAI model id through the base URL. The QA org's OpenAI key is stored encrypted and, by design, cannot be reused for a new base URL; the plaintext key was not available during the run. The OpenAI-id path is covered by the Test probe above (`/responses` with effort, `store: false`, encrypted reasoning).
