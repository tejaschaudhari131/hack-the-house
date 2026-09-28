# Playhouse

Pittsburgh Planning Studio

by Hack the House

Submission draft (Google Form): https://docs.google.com/forms/d/e/1FAIpQLSfDK_aD-miOV3D92Bl4NOFa1Skb8_u-GTCH5j1FE-VEWTr4DQ/viewform

Draft answers for the team to review and paste. **Fields marked TODO must be filled in by the people concerned. The AI agent did not fill them and does not assert them.** Do not submit until every TODO is resolved.

## Team name

Hack the House

## Members (1–5)

| # | Name | Email | Affiliation |
| --- | --- | --- | --- |
| 1 | Tejas Chaudhari | TODO (member provides) | TODO (member provides) |
| 2 | Chris Severns | TODO (member provides) | TODO (member provides) |
| 3 | Yoon Yik Ng | TODO (member provides) | TODO (member provides) |
| 4 | TODO or leave blank | | |
| 5 | TODO or leave blank | | |

## Track

Challenge 3: Housing Typology, Equity & Climate Matchmaker *(confirm the exact option label in the form)*

## Project title

Playhouse

## Subtitle

Pittsburgh Planning Studio

## Project description

**What it does.** Playhouse helps a community development corporation or city planner answer one question: which real parcel and housing option should we investigate next, why does it rank the way it does, and what must we verify before acting? Studio and Explorer cover 142,865 parcels across all 90 Pittsburgh neighborhoods; none is omitted. Neighborhood data loads on demand. Studio compares a next-building draft with selected housing types, with seven decision dimensions and editable assumptions. It also tests walking connections, parks and added bus service; results are scenarios, not a citywide redevelopment recommendation. You can shortlist sites with Find Sites (for example, City-owned vacant lots where a triplex is allowed by right, outside mapped flood zones, near frequent transit), compare two housing options on a real lot, and see each option's §911.02 zoning reading separately from its score. You can also inspect the evidence behind six factors (market activity and lot fit, transit, equity, climate hazard, a displacement screening signal, and a relative carbon-related proxy), change priorities, and print a decision brief with three rule-based next steps. The comparison shows how many points each factor adds, so a close result is labeled close. Five illustrative priorities and a one-factor sweep with exactly solved crossing points show whether the answer is about data or values. Scenarios are reproducible through a versioned share link or a JSON file.

**Who it's for.** CDC staff and municipal planners preparing a housing-site shortlist; also residents and officials who want to see trade-offs before a meeting.

**How it's built.** A Python pipeline joins county parcels and assessments, Pittsburgh zoning and the §911.02 use table, PRT GTFS, ACS, HUD CHAS, FEMA flood zones, steep slopes, undermined areas, City property records, LIHTC/QCT context, EIA RECS, and published embodied-carbon research into static files. A Next.js app with Leaflet and MapLibre ranks on the client with one shared factor definition. Python and JavaScript are checked for parity. An explanation route (Vercel AI SDK) rebuilds all facts on the server and falls back to a labeled deterministic template.

**What's next.** A two-week pilot with one CDC and one qualified zoning reviewer (proposed, not agreed): review a small set of real sites, compare the shortlist and explanations with practitioner judgment, log consequential errors and missing checks, and measure time to prepare a brief. On the roadmap (not built): reviewed dimensional envelopes, rehab and no-change baselines, affordability and subsidy scenarios, shared feedback storage and traffic/utility engineering.

**Limitations.** Decision support only: not a permit, zoning determination, feasibility study, appraisal, affordability guarantee, or displacement prediction. The §911.02 mapping has not had expert review. Studio applies supported Title Nine screens and marks unsupported checks unassessed; it uses mapped walking routes with assumed last-metre connectors. Explorer retains its original straight-line access screen. Utilities and geotechnical capacity are not modeled. Displacement is a tract-level screen; the carbon proxy is relative, not tonnes. Public records are not availability. On the live deployment no language-model key is configured, so explanations show the labeled template built from the same numbers.

## Demo video link

TODO (team uploads the recording and pastes a link. The agent's recording is `/opt/cursor/artifacts/cp3/hack-the-house-demo.mp4`; review it before uploading.)

## Repository link

https://github.com/tejaschaudhari131/playhouse

## Live app

https://playhouse-pittsburgh.vercel.app

Citywide release preview (PR #7, not merged): https://hack-the-house-git-playhouse-citywide-tej-fff0.vercel.app. Vercel deployment succeeded; the team will perform the protected-preview walkthrough. Local five-neighborhood checks are recorded in [VALIDATION.md](VALIDATION.md).

## Data sources

Allegheny County parcel boundaries and property assessments (WPRDC/County GIS, pulled 2026-09-26/27); Pittsburgh zoning districts (WPRDC) and Pittsburgh Zoning Code §911.02 use table (ecode360); ACS 2024 5-year B19013, B25064, B25070, B25003, and 2015–2019 B25064 (Census Bureau summary files); HUD CHAS 2018–2022 Table 8 (tract); Census 2024 cartographic block groups and the 2020–2010 tract relationship file; Pittsburgh Regional Transit GTFS (weekday 2026-09-25); FEMA National Flood Hazard Layer; Pittsburgh steep slopes (25%+) and undermined areas (WPRDC); City-owned properties, City tax delinquency, condemned and dead-end properties (WPRDC); HUD LIHTC properties and 2026 Qualified Census Tracts; EIA RECS 2020 Table CE1.2; Zuluaga & Saxe 2025 and Rankin et al. 2024 (embodied carbon, direction only); OpenStreetMap basemap. Full table with URLs, vintages, and caveats: README "Data Sources" and `docs/DATA_NOTES.md`.

## AI tool disclosure

- **Development:** Cursor cloud agents wrote much of the code and documentation under the team's direction. Grok 4.7 scaffolded the pipeline, scoring model, and first web app. Claude Opus 5.5 (Anthropic, via Cursor) wrote the explanation route, grounding, guardrails, factor definitions, comparison and sensitivity logic, the guided workflow, the evidence drawer, share links, reports, tests, these docs, and the demo recording. Another Claude Opus 5.5 run added Find Sites, the displacement screen, and the carbon proxy. The team set direction and reviewed the scoring rules. *(TODO: team confirms this description.)*
- **Runtime:** the app can generate an explanation with the Vercel AI SDK: through the Vercel AI Gateway (default `anthropic/claude-haiku-4.5`), or through an OpenAI-compatible endpoint configured by environment variables. The model writes prose only from server-computed facts; it does not compute scores or read the zoning code. **On the live deployment at submission-draft time no model credential works, so explanations are the labeled deterministic template.** *(TODO: update if a key is added before submission.)*
- No AI output is presented as expert zoning review.

## Attestations

- 18+ / eligibility: **TODO: each member attests personally. The agent does not answer this.**
- Original work during the event / prior code: **TODO: team confirms.** The git history starts 2026-09-26 with the initial commit.
- Partner or expert endorsement: none claimed.

Coverage note: the 142,865 mapped records include 142,571 identified parcels and 294 county polygons without a unique PIN. Those polygons have stable `SITE…` map IDs, retain the source label, and disclose that assessment and parcel-ID-based property flags are unknown. No neighborhood is omitted.
