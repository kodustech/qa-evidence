import { APICallError } from 'ai';
import { classifyLLMError } from '@libs/llm/error-classifier';
const cases = [
  'Your project has exceeded its monthly spending cap. Please go to AI Studio at https://ai.studio/spend to manage your project spend cap.',
  'You (qa-user) have reached your weekly usage limit. It resets on Monday.',
  'Rate limit reached for requests',
  'Rate limit exceeded: 60 requests per minute',
];
for (const m of cases) {
  const e = new APICallError({ message: m, url: 'https://provider.example/v1/chat/completions', requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { message: m } }), isRetryable: true });
  const plain = Object.assign(new Error(m), { status: 429 });
  console.log(JSON.stringify({ message: m.slice(0, 60), apiCallError: classifyLLMError(e).category, plainStatus: classifyLLMError(plain).category }));
}
