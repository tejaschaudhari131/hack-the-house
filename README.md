# Playhouse

Explore housing and infrastructure decisions on a 3D map of Pittsburgh.

**[Playhouse](https://hack-the-house.vercel.app)** · Built for the AI Horizons 2026 AI for Housing Hackathon. The Studio is released from `main`; feature branches use Vercel previews.

## What it does

- Shows existing buildings, recorded uses and estimated heights.
- Lets you place several proposed buildings across selected parcels.
- Lets you cycle one housing draft and compare selected housing types side by side.
- Previews the draft automatically, with green/red placement status, before adding it to the plan.
- Tests walking connections, streets with sidewalks, parks and added service at existing bus stops.
- Shows factor scores, tradeoffs, adjustable priorities and the assumptions behind them.
- Checks supported Title Nine rules. A zoning conflict or failed physical fit removes the housing score; rules without enough evidence are marked **Not assessed**.
- Keeps exact income, rent, utilities and building dimensions under **Assumptions → Advanced options**.
- Supports undo/redo and scenario JSON export.
- Offers a short first-visit tour; use **Tour** in the header to replay it.

Studio is at `/`. The original parcel Explorer remains at `/explore` for reference, with its own reports, sharing and explanations.

## Scope

The two study areas are **Hazelwood** and **Lawrenceville** (Lower, Central and Upper). The map covers 8,645 parcels; that is data coverage, not a proposal to redevelop every parcel. Existing building colours show recorded use, not recommendations.

There is one editable **next-building draft**. Use **Compare to** to add other housing types to the comparison; all selected types share the same costs, priorities and evidence coverage. Each visitor has their own local Studio scenario. This is not a shared multiplayer session; export before reloading to keep a copy.

Priority sliders are relative: all 1s, all 50s or all 100s give the same result. Each slider shows its percentage of the score after excluding missing evidence. Turning every priority off disables ranking.

The seven decision dimensions are demand, physical feasibility, affordability, displacement risk, infrastructure capacity, access and carbon. Some use measured data; others use proxies or editable assumptions. Unknown evidence stays unknown. Scores are screening aids, not development approval or forecasts.

Road edits currently affect walking routes and reserved land. They do not simulate traffic. Transit edits add assumed service at an existing stop. The app does not forecast changes in rents, displacement or emissions from these edits.

## Run locally

Use Node.js 22 or newer.

```bash
cd web
npm ci
npm run dev
```

Open http://localhost:3000. To check a release:

```bash
npm test
npm run build
npm start
```

The committed data is ready to use. You do not need to run Python or download datasets to start the app.

## Hosting

**Use the existing Vercel project for the initial 1–30-user demo.** It is connected to this repository. Branch pushes create previews; `main` deploys to production. The product is Playhouse; the repository and existing URL keep their current names.

For a new Vercel project: import this repository, select **Next.js**, set the root directory to **web**, and deploy. No database is required. GitHub Pages would need a static-only build because Explorer's `/api/explain` endpoint needs a server.

Studio works without AI credentials. Explorer has a template explanation fallback; set `AI_EXPLANATIONS=off` for a template-only demo. See [web setup](web/README.md) for optional model configuration. Vercel Hobby is intended for personal, non-commercial use; check [plan eligibility](https://vercel.com/docs/plans/hobby) before using it for paid work.

Most simulation work happens in each visitor's browser. The full parcel download remains about 27 MB; reducing it is deferred to the recommendation-layer review. A 30-user load test has not been run.

## Next with the team

Policy review remains deferred for planning boundaries, existing/proposed labels, and how to explain ineligible proposals. Housing comparison now uses one draft plus selected types, without A/B slots.

## Project guide

- [Studio behavior, calculations and limits](docs/PLANNER.md)
- [Title Nine checks and evidence limits](docs/TITLE_NINE.md)
- [Public data sources](docs/DATA_SOURCES.md) and [data notes](docs/DATA_NOTES.md)
- [Explorer model card](docs/MODEL_CARD.md), [validation](docs/VALIDATION.md) and [demo script](docs/DEMO_SCRIPT.md)
- [Data pipeline](pipeline/README.md) and [zoning rules](zoning/README.md)
- [AI tools used](docs/AI_TOOLS.md)

`web/` contains the Next.js app. `pipeline/` prepares the data. `zoning/` contains the zoning use-table rules. Runtime datasets and source manifests live in `web/public/data/`.

## Team

- Tejas Chaudhari — data pipeline and scoring model
- Chris Severns — zoning rules
- YY Ng — map and frontend

AI coding tools assisted development under the team's direction. Housing scores are calculated from explicit rules, not generated by a language model.
