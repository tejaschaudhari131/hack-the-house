# Playhouse

Pittsburgh Planning Studio

by Hack the House

# AI tools used

The following records the original Explorer development and its Checkpoint 3 deployment. It is historical, not a live deployment status check.

- **Explanations in the app (runtime):** status on production as of the Checkpoint 3 build: no working model credential is configured (the AI Gateway rejects the OIDC call and the `LLM_*` variables are placeholders), so every explanation on the live site is the labeled deterministic template. The configured default when a credential exists is `anthropic/claude-haiku-4.5` (Anthropic Claude Haiku 4.5) through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), called with the Vercel AI SDK. Set `AI_MODEL` to use another gateway model. Provider order: with `AI_GATEWAY_API_KEY`, the gateway first; without it, an OpenAI-compatible endpoint set by `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` (default `gpt-4o-mini`) is tried first, then the gateway through Vercel OIDC. The `X-Explain-Provider` and `X-Explain-Model` response headers and the on-screen label name the provider and model that actually answered; failures are logged server-side (status and a redacted message). The model writes prose only. It does not compute scores, choose weights, or read the zoning code. If it is unavailable, `web/lib/explainTemplate.js` writes the explanation from the same numbers, and the UI says so. The demo does not depend on a model being up.
- **Writing the code:** Cursor cloud agents helped write this repository. Grok 4.7 scaffolded the pipeline, the scoring model, and the first web app. Claude Opus 5.5 (Cursor cloud agent) wrote the explanation route and provider fallback, the grounding and guardrails, the shared factor definitions and contribution comparison, the guided shortlist-compare-brief flow, the illustrative priorities and solved sensitivity sweep, the evidence drawer, scenario share links, the decision brief and parcel report, the onboarding, the docs in `docs/`, the demo recording, and their tests. The five illustrative priorities are value judgments the agent proposed; the team should confirm or change them in `web/lib/presets.js`. People on the team reviewed the scoring rules, which are in `pipeline/score.py` and `data/processed/score_model.json` so anyone can read and change them.
  Claude Opus 5.5 (another Cursor agent run) also added the Find Sites mode, the site-inventory joins, the displacement screen, and the carbon estimate. It found the RECS table and the embodied-carbon papers by web search, then checked each figure against the source file before using it.

Codex assisted with the Planning Studio, housing placement, infrastructure scenarios, building-use and height displays, recommendation audit, interface integration, and Playhouse release work under Yoon Yik Ng’s direction. Studio rankings are deterministic calculations; a language model does not choose their scores or weights.
