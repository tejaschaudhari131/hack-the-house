# Playhouse web app

Next.js, React and MapLibre. `/` opens Studio; `/explore` opens the original Explorer.

Use Node.js 22 or newer:

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. Run `npm test` and `npm run build` before releasing; `npm start` serves the production build.

## Deploy

Vercel: select **Next.js**, root directory **web**, and use the default build settings. The existing project deploys from `main`. All required data is committed in `public/data/`; no Python pipeline or database is needed for hosting.

The build prepares the MapLibre worker files automatically. Keep `outputFileTracingIncludes` in `next.config.mjs`: the Explorer explanation endpoint needs those data files on the server.

## Optional explanations

Studio does not need a model. Explorer's explanation endpoint uses an AI provider when configured, with a labeled template fallback. Set `AI_EXPLANATIONS=off` for template-only explanations.

For local model use, copy `.env.example` to `.env.local` and configure `AI_GATEWAY_API_KEY`, or the `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` fallback. Set production values in Vercel's environment settings. Never commit credentials.

The server rebuilds explanation facts from committed data. A model writes prose; it does not calculate housing scores.

See the [main README](../README.md) for features and the [Studio guide](../docs/PLANNER.md) for model details.
