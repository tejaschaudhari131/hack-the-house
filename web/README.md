# Web app (YY)

Next.js map for the MVP parcels. The pipeline writes static files into `public/data/`. This folder does not score parcels and does not decide zoning. It reads `public/data/zoning.json`, which is a copy of `/zoning/districts.json`.

```bash
cd web
npm install
npm test
npm run dev
```

Open http://localhost:3000.

`LLM_API_KEY` is optional. Copy `.env.example` to `.env.local`. With no key, Explain uses the template in `lib/explainTemplate.js`.

Vercel: set the project root to `web`. Do not put API keys in the repo.
