# Housing Typology, Equity & Climate Matchmaker

Decision-support prototype for the AI Horizons 2026 AI for Housing Hackathon, Challenge 3. Pick a real Pittsburgh parcel and compare four housing types — single-family, townhouse/duplex, small apartment (3–19 units), and large apartment (20+ units) — on demand, transit access, equity, and climate risk. Weight sliders re-rank the types. The screen labels which parts are observed data and which parts are value judgments.

This is not legal, zoning, financial, or permitting advice. It does not say what may be built.

## Who it helps

- Municipal planners testing how a housing mix shifts when equity or climate counts more than market demand.
- Community development corporations comparing a place like Hazelwood with a place like Lawrenceville before choosing a building type.
- Developers looking at lot size, recent valid sales, and transit as context, not as a pro forma.
- Residents and public officials who want two scenarios side by side, including a "what if the zoning rules were not binding" view.

The MVP map is Hazelwood plus Lower, Central, and Upper Lawrenceville. Those are the official city neighborhoods. "Lawrenceville" in everyday speech is the three Lawrenceville neighborhoods together.

Why these two places: the public data actually separates them. In this pull, parcel block-group median incomes are about $40,000 in Hazelwood and about $101,000 in Lawrenceville. Median rent burden (share of renters paying 30% or more) is about 58% in Hazelwood and 34% in Lawrenceville. Median valid sale prices since 2021-09-26 are about $153 per square foot in Hazelwood and $247–$274 in the Lawrenceville neighborhoods. Lawrenceville also has more weekday transit trips within 400 meters (median about 950 versus about 420). Slopes of 25% or greater, the landslide-risk proxy, touch about 57% of Hazelwood parcels and about 15% of Lawrenceville parcels. Mapped undermined areas show up on about 13% of Hazelwood parcels and on none of these Lawrenceville parcels. Mapped FEMA flood zones are the other way around: about 6% of Lawrenceville parcels and under 1% of Hazelwood parcels. Glen Hazel is not included; it is its own neighborhood.

## How to run

Pipeline (Tejas):

```bash
cd pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python test_score.py
python test_pii.py
python run_pipeline.py
```

`python run_pipeline.py --refresh` ignores cached downloads in `pipeline/data/raw/`.

App (YY):

```bash
cd web
npm install
npm test
npm run dev
```

Open http://localhost:3000. Click a parcel, move the sliders, and try the zoning what-if toggle. Each parcel result is a screening aid. Flag a result that looks wrong; the flag stays in that browser and is not sent to the City. A consequential decision should go to City Planning / the Zoning Administrator or a qualified professional. See [Human in the loop](#human-in-the-loop).

For a plain-language explanation, click "Explain the top two." With no API key, that uses a deterministic template. To use a model, copy `web/.env.example` to `web/.env.local` and set `LLM_API_KEY`. Optional: `LLM_BASE_URL` (default `https://api.openai.com/v1`) and `LLM_MODEL` (default `gpt-4o-mini`).

On Vercel, set the project root to `web`. Put the key in the project environment, not in git.

After Chris edits `zoning/districts.json`:

```bash
cp zoning/districts.json web/public/data/zoning.json
cp zoning/districts.json data/processed/zoning.json
```

Scores do not depend on that file. A rules-only edit does not need a full data download.

## Architecture

```text
pipeline/          Tejas. Download, clean, score. Writes data/processed and web/public/data.
  score.py         Measured inputs vs normative anchors. No zoning allowances.
zoning/            Chris. districts.json maps a zoning code to allowed housing types.
web/               YY. Next.js map. Ranks on the client from the static GeoJSON.
  app/api/explain  Template explanation, or an LLM if LLM_API_KEY is set.
shared/rank_vector.json
                   One numeric example both the Python tests and the JS tests must match.
```

The pipeline stores the zoning district code it found on each parcel. The browser reads `zoning.json` and decides what the stub rules allow. Turning on "what if zoning changed" ranks all four types and says so.

Composite score = weighted average of demand, transit, equity, and climate suitability (100 minus climate risk). A missing dimension is skipped. It is not treated as zero.

How the sources are reconciled when they disagree (vintage, geography, join keys, and mismatches) is in [docs/DATA_NOTES.md](docs/DATA_NOTES.md).

## Data Sources

Pulled 2026-09-26. Names, URLs, and caveats follow the organizers' data resource list. Machine-readable copy, including the caveat text: `data/processed/sources.json`.

| Source (organizers' list) | List URL | Caveat we are respecting | What this MVP actually used |
| --- | --- | --- | --- |
| Pittsburgh neighborhoods (not a row on the list; the comparison boundary) | [WPRDC GeoJSON](https://data.wprdc.org/dataset/e672f13d-71c4-4a66-8f38-710e75ed80a4/resource/4af8e160-57e9-4ebf-a501-76ca1b42fc99/download/neighborhoods.geojson) | Official neighborhood names, not nicknames | Hazelwood, Lower Lawrenceville, Central Lawrenceville, Upper Lawrenceville. CC BY. |
| Allegheny County Parcel Boundaries | [data.wprdc.org/dataset/allegheny-county-parcel-boundaries](https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries) | Geometry and assessment records may update on different schedules | That list URL returned HTTP 404. Live page: [allegheny-county-parcel-boundaries1](https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries1). Polygons read from the county MapServer. 8,645 parcels after the clip. |
| Allegheny County Property Assessments | [property-assessments](https://data.wprdc.org/dataset/property-assessments) | Assessed value is not market value; fields can be stale | CC0 extract. Land use, lot area, year built, living area, and sale fields. Assessed value is not read. Owner names and change-notice addresses are not in the extract. |
| Allegheny County Property Sale Transactions | [list URL](https://data.wprdc.org/dataset/allegheny-county-property-sale-transactions) | Filter with sale-validation codes; many transfers are not arm's-length | Not downloaded. The list URL 404'd; the live page is [real-estate-sales](https://data.wprdc.org/dataset/real-estate-sales). The same filter is applied to sale fields on the assessment file: `VALID SALE` only. |
| Pittsburgh Zoning Districts | [pittsburgh-zoning](https://data.wprdc.org/dataset/pittsburgh-zoning) | The map alone is not enough: overlays, definitions, exceptions, and review rules matter | List URL 404'd. Live page: [zoning](https://data.wprdc.org/dataset/zoning). Feature service supplies `zon_new` only. Allowances are the stub in `zoning/districts.json`. |
| Pittsburgh Zoning Code | [pittsburghpa.gov/dcp/zoning-code](https://pittsburghpa.gov/dcp/zoning-code) | Authoritative interpretation belongs to the City | Not parsed. The stub says it needs expert review. |
| American Community Survey 5-Year | [ACS 5-year](https://www.census.gov/data/developers/data-sets/acs-5year.html) | Estimates have margins of error; avoid false precision for small areas | 2024 5-year table files B19013, B25064, B25070. County median income in this file is $78,548. |
| Comprehensive Housing Affordability Strategy (CHAS) | [HUD CHAS](https://www.huduser.gov/portal/datasets/cp.html) | Based on multi-year ACS; releases lag and the tables are complex | Not loaded. Unattended downloads got an AWS WAF challenge (HTTP 202) on 2026-09-26, and the CHAS API needs an account. Next step: 2018–2022 tract cost burden by income. |
| TIGER/Line Shapefiles | [TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Boundary vintage must match the statistics | 2024 cartographic block groups (`cb_2024_42_bg_500k`), same GEOID year as the 2024 ACS tables. |
| Pittsburgh Regional Transit GTFS | [list URL](https://data.wprdc.org/dataset/port-authority-of-allegheny-county-transit-data) | Scheduled service is not realized reliability | List URL 404'd. Schedule read from the [PRT GTFS zip](https://www.rideprt.org/developerresources/GTFS.zip) under the [developer license](https://www.rideprt.org/business-center/developer-resources/). Weekday 2026-09-25. |
| FEMA National Flood Hazard Layer | [NFHL](https://www.fema.gov/flood-maps/national-flood-hazard-layer) | Not a substitute for a survey or a flood determination | MapServer layer 28: Special Flood Hazard Area and 0.2% annual-chance zones. |
| Pittsburgh Steep Slopes (25% or greater) | [25-or-greater-slope](https://data.wprdc.org/dataset/25-or-greater-slope) | Derived threshold; site work needs a survey | Parcel overlap. Labeled as a landslide-risk proxy, not a landslide inventory. The list has no landslide-prone layer. |
| Pittsburgh Undermined Areas | [undermined-areas](https://data.wprdc.org/dataset/undermined-areas) | Historic mine maps can be incomplete; never use alone for a safety decision | Parcel overlap, as a preliminary screen only. |
| OpenStreetMap | [openstreetmap.org](https://www.openstreetmap.org/) | Completeness varies; ODbL attribution | Basemap tiles only. Not a scored input. |

Stretch rows on the list that this build does not join: [EPA EJScreen](https://www.epa.gov/ejscreen/download-ejscreen-data) (a screening tool, not a risk assessment), [HUD Location Affordability Index](https://hudgis-hud.opendata.arcgis.com/datasets/c1c32742599a42c9a45c95be50ed2ab6_12/about) (modeled household profiles, not observed spending), [LODES](https://lehd.ces.census.gov/data/) (modeled, lagged jobs access), and the [Opportunity Atlas](https://www.opportunityatlas.org/) (historical cohort outcomes, not current conditions, and not a way to rank people).

The Census API (`api.census.gov`) redirected unauthenticated calls to a missing-key page on 2026-09-26. The ACS numbers above are the Bureau's own 2024 ACS 5-year summary files, not a substitute dataset. Nothing in the parcel file is invented to fill a failed source.

About 5% of clipped parcels (411 of 8,645) did not match an assessment row in ZIP 15201 or 15207. Those parcels stay on the map with lower confidence and without land use or sale fields. They are not given fake attributes.

## Libraries

- Python: shapely, pyshp (and the standard library)
- Web: Next.js, React, Leaflet, react-leaflet
- Basemap tiles: OpenStreetMap, attributed on the map

No paid data product. No model is required for the scores. The optional explanation model is called only when `LLM_API_KEY` is set.

## AI Tools Used

- Cursor cloud agent, model Grok 4.7, used during the hackathon to scaffold the pipeline, the scoring model, and the first web app. The scoring rules are in `pipeline/score.py` and `data/processed/score_model.json` so a person can read and change them.
- Optional explanation model: any OpenAI-compatible chat endpoint configured with `LLM_API_KEY`. The default model name is `gpt-4o-mini`. If the key is missing or the call fails, `web/lib/explainTemplate.js` writes the explanation from the same numbers. The demo does not depend on a model being up.

## Human in the loop

Every parcel result is a screening aid. It is not a zoning determination, a permit, or an appraisal. The page says so on the result, and it links to the [City Planning zoning page](https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning), the [zoning code](https://ecode360.com/45474054), and the [zoning map](https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb). The zoning page lists 412-255-2621 at the City-County Building, 414 Grant Street.

A person can flag a result as wrong. The flag, and an optional note, stay in that browser's local storage. They are not uploaded and they are not a filing with the City. Take a consequential question to City Planning / the Zoning Administrator or to a qualified professional.

Zoning allowances are not filled in from district titles. On 2026-09-26 ecode360 returned a Cloudflare challenge, so the use tables were not read. `needs_expert_review` remains true on every district. Chris cites a code section before the app filters any housing type.

## Limitations

- Decision support only. Not a zoning determination, appraisal, underwriting tool, or permitting screen.
- No district allowance was read from the Pittsburgh Zoning Code. ecode360 (https://ecode360.com/45474054) returned HTTP 403 with a Cloudflare challenge on 2026-09-26. Every row in `zoning/districts.json` has an empty `allowed` list, `use_table_read: false`, `code_section: null`, and a TODO. `needs_expert_review` is true on all of them. The app does not filter housing types until a person cites a section. That is not a finding that every type is allowed. Observed codes in this MVP include R1A-H, R1A-VH, H, R1D-M, LNC, UI, RIV-IMU, RIV-MU, P, NDI, and others.
- Weights, lot-fit curves, the equity production/displacement factors, the 50/30/20 flood, steep-slope, and undermined blend, and the small climate penalty by building size are value judgments. Confidence measures missing data only.
- Climate risk is current FEMA flood zones, overlap with slopes of 25% or greater as a landslide-risk proxy, and overlap with undermined areas as a preliminary mine screen. It is not a site visit, a flood determination, a geotechnical study, future rainfall, or embodied carbon or operating emissions. The brief also asks about infrastructure and marginal carbon; this MVP does not have those layers, so it does not score them. Steep slope is not a landslide inventory. Undermined-area maps can be incomplete and are not a safety determination.
- Valid sales are county code `0` / description `VALID SALE`, price at least $10,000, on or after 2021-09-26. Love-and-affection and multi-parcel deeds are excluded. This is not an appraisal. Assessed value is not market value (the organizers' caveat on the assessment file) and is not an input. The separate sale-transactions dataset was not downloaded; the validation-code filter from that row of the list is what the assessment sale fields go through.
- ACS figures are 2020–2024 estimates with margins of error. A block group is not a neighborhood, and a small-area percentage should not be read as exact. HUD CHAS tract cost burden by income is named in the brief and on the organizers' list and is not in this score. Block-group geometries are NAD83 used as WGS84; that shift is small next to a block group, and the 2024 boundary vintage matches the 2024 ACS tables.
- The zoning district map does not encode overlays, definitions, exceptions, or review procedure. Authoritative interpretation belongs to the City. The code, the map, and the department page are linked from each result.
- Scores use fixed anchors (for example $80–$350 per square foot), not a citywide percentile. A high score means "high on that anchor," not "better than most of Pittsburgh."
- Transit is weekday scheduled trips, not delay, crowding, or whether the sidewalk exists.
- Owner names, change-notice mailing addresses, and buyer, seller, grantor, and grantee names are not in the output. The pipeline refuses a parcel file whose keys contain those words. Site addresses and sale prices stay; the parties do not. Do not join this file back to an owner roll or a deed-party file. Details are in [docs/DATA_NOTES.md](docs/DATA_NOTES.md).

## Team

- Tejas — data pipeline and scoring model (`/pipeline`, `pipeline/score.py`)
- Chris — zoning rules (`/zoning/districts.json`)
- YY — map and front end (`/web`)
