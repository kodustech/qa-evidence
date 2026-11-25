## Code Review Could Not Complete ⚠️

The review failed before suggestions could be generated.

**Reason:** The configured model's context window is too small for this review. `openai_compatible:accounts/fireworks/models/deepseek-v4p1-flash` has a context window of 20,000 tokens, but this review's fixed prompt alone takes 12,140 tokens, leaving no room for the diff and the answer.

**To resolve, choose one:**
- **Switch to a recommended model**: pick one of Kodus's recommended models in your BYOK settings (Claude Sonnet 4.6, Claude Opus 4.7, Gemini 3.1 Pro, GPT-5.4, Kimi K2.6 Coding, or GLM 5.1).
- **Split the PR into smaller ones**: file count drives prompt overhead.
- **Raise the model's Max input tokens**: only if your deployed model genuinely supports more than the 20,000 tokens our lookup reports (e.g. self-hosted vLLM or Ollama with a custom limit).

openai_compatible · accounts/fireworks/models/deepseek-v4p1-flash · generalist

After fixing the issue, comment `@kody review` on this PR to re-run the review.



<details>
<summary>Kody Guide: Usage and Configuration</summary>

<details>
<summary>Interacting with Kody</summary>

- **Request a Review:** Ask Kody to review your PR manually by adding a comment with the `@kody start-review` command at the root of your PR.

- **Validate Business Logic:** Ask Kody to validate your code against business rules by adding a comment with the `@kody -v business-logic` command.

- **Provide Feedback:** Help Kody learn and improve by reacting to its comments with a 👍 for helpful suggestions or a 👎 if improvements are needed.

</details>

<details>
<summary>Current Kody Configuration</summary>

<details>
<summary>Review Options</summary>

The following review options are enabled or disabled:

| Options                        | Enabled |
|-------------------------------|---------|
| **Bug** | ✅ |
| **Performance** | ✅ |
| **Security** | ✅ |
| **Business Logic** | ✅ |

</details>

**[Access your configuration settings here.](https://qa.web.kodus.io/settings/code-review/global/general)**

</details>
</details>

<!-- kody-codereview-completed-1795574395929-zga49cxf1en -->
<!-- kody-codereview -->
&#8203;