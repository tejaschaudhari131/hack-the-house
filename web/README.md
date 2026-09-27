# Web app (YY)

Next.js map for the MVP parcels. The pipeline writes static files into `public/data/`. This folder does not score parcels and does not decide zoning. It reads `public/data/zoning.json`, which is a copy of `/zoning/districts.json`.

```bash
cd web
npm install
npm test
npm run dev
```

Open http://localhost:3000.

Explanations go through the Vercel AI Gateway with the AI SDK (`lib/explainHandler.js`). The default model is `anthropic/claude-haiku-4.5`; set `AI_MODEL` to another gateway `provider/model` string to change it. Locally, copy `.env.example` to `.env.local` and set `AI_GATEWAY_API_KEY`, or run `vercel env pull .env.local` for an OIDC token. With no credentials, on error, on timeout, or past the rate limit, Explain returns the template in `lib/explainTemplate.js` and the UI says which one you got.

The server rebuilds every number it sends to the model from `public/data/` (see `lib/explainFacts.js`). The browser only sends parcel PINs, housing types, weights, and the what-if toggle.

Vercel: set the project root to `web`. No `vercel.json` is needed. `next.config.mjs` traces `public/data/*` into the explain function. Do not put API keys in the repo.
