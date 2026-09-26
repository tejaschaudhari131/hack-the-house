# Housing Typology, Equity & Climate Matchmaker

Decision-support prototype for the AI Horizons 2026 AI for Housing Hackathon, Challenge 3. Pick a real Pittsburgh parcel and compare four housing types — single-family, townhouse/duplex, small apartment (3–19 units), and large apartment (20+ units) — on demand, transit access, equity, and climate risk. Weight sliders re-rank the types. The screen labels which parts are observed data and which parts are value judgments.

This is not legal, zoning, financial, or permitting advice. It does not say what may be built.

## Who it helps

- Municipal planners testing how a housing mix shifts when equity or climate counts more than market demand.
- Community development corporations comparing a place like Hazelwood with a place like Lawrenceville before choosing a building type.
- Developers looking at lot size, recent valid sales, and transit as context, not as a pro forma.
- Residents and public officials who want two scenarios side by side, including a "what if the zoning rules were not binding" view.

The MVP map is Hazelwood plus Lower, Central, and Upper Lawrenceville. Those are the official city neighborhoods. "Lawrenceville" in everyday speech is the three Lawrenceville neighborhoods together.

Why these two places: the public data actually separates them. In this pull, parcel block-group median incomes are about $40,000 in Hazelwood and about $101,000 in Lawrenceville. Median rent burden (share of renters paying 30% or more) is about 58% in Hazelwood and 34% in Lawrenceville. Median valid sale prices since 2021-09-26 are about $153 per square foot in Hazelwood and $247–$274 in the Lawrenceville neighborhoods. Lawrenceville also has more weekday transit trips within 400 meters (median about 950 versus about 420). Hazelwood carries more mapped river floodplain and landslide-prone slope. Glen Hazel is not included; it is its own neighborhood.

## How to run

Pipeline (Tejas):

```bash
cd pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python test_score.py
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

Open http://localhost:3000. Click a parcel, move the sliders, and try the zoning what-if toggle.

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

## Data Sources

Pulled 2026-09-26. Machine-readable copy: `data/processed/sources.json`.

| Source | Publisher | License | What we used |
| --- | --- | --- | --- |
| [Pittsburgh neighborhoods](https://data.wprdc.org/dataset/e672f13d-71c4-4a66-8f38-710e75ed80a4/resource/4af8e160-57e9-4ebf-a501-76ca1b42fc99/download/neighborhoods.geojson) | City of Pittsburgh, via WPRDC | CC BY | Hazelwood, Lower Lawrenceville, Central Lawrenceville, Upper Lawrenceville |
| [Allegheny County parcels](https://gisdata.alleghenycounty.us/arcgis/rest/services/OPENDATA/Parcels/MapServer/0) | Allegheny County GIS. WPRDC also points at [PASDA](https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries1) for the archival file. | License not specified on the service | Parcel polygons and PIN. 8,645 parcels after the neighborhood clip. |
| [Property assessments](https://data.wprdc.org/dataset/property-assessments) | Allegheny County Office of Property Assessments, via WPRDC. Resource dated 2026-09-07 on WPRDC. | CC0 | Land use, lot area, year built, living area, valid sales. Owner names are not in this extract. Change-notice mailing addresses were not requested. |
| [Zoning districts](https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebZoning/FeatureServer/0) | City of Pittsburgh GIS, via WPRDC | License not specified | District code `zon_new` only. Allowances are not taken from this layer. |
| [PRT GTFS](https://www.rideprt.org/developerresources/GTFS.zip) | Pittsburgh Regional Transit | [Developer license](https://www.rideprt.org/business-center/developer-resources/) accepted by download | Stops and weekday trip counts for the representative weekday 2026-09-25 |
| ACS 2024 5-year B19013, B25064, B25070 table-based summary files | U.S. Census Bureau, `www2.census.gov` | Public domain | Block-group median income, median gross rent, and rent burden. County median income in this file is $78,548. |
| [2024 PA block groups](https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_42_bg_500k.zip) | U.S. Census Bureau | Public domain | Which block group each parcel falls in |
| [FEMA NFHL layer 28](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28) | FEMA | Public domain | Special Flood Hazard Area and 0.2% annual-chance zones |
| [Landslide-prone areas](https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/PGHWebLandslideProne/FeatureServer/0) | City of Pittsburgh GIS, via WPRDC | License not specified | Overlap with each parcel |

The Census API (`api.census.gov`) redirected unauthenticated calls to a missing-key page on 2026-09-26. The numbers above are the Bureau's own 2024 ACS 5-year summary files, not a substitute dataset. Nothing in the parcel file is invented to fill a failed source.

About 5% of clipped parcels (411 of 8,645) did not match an assessment row in ZIP 15201 or 15207. Those parcels stay on the map with lower confidence and without land use or sale fields. They are not given fake attributes.

## Libraries

- Python: shapely, pyshp (and the standard library)
- Web: Next.js, React, Leaflet, react-leaflet
- Basemap tiles: OpenStreetMap, attributed on the map

No paid data product. No model is required for the scores. The optional explanation model is called only when `LLM_API_KEY` is set.

## AI Tools Used

- Cursor cloud agent, model Grok 4.7, used during the hackathon to scaffold the pipeline, the scoring model, and the first web app. The scoring rules are in `pipeline/score.py` and `data/processed/score_model.json` so a person can read and change them.
- Optional explanation model: any OpenAI-compatible chat endpoint configured with `LLM_API_KEY`. The default model name is `gpt-4o-mini`. If the key is missing or the call fails, `web/lib/explainTemplate.js` writes the explanation from the same numbers. The demo does not depend on a model being up.

## Limitations

- Decision support only. Not a zoning determination, appraisal, underwriting tool, or permitting screen.
- Every row in `zoning/districts.json` is a stub inferred from the district title. `needs_expert_review` is true on all of them. R3 districts are not marked as allowing the 3–19 unit bin, because that bin is wider than "three-unit." Chris has to check the current Pittsburgh Zoning Code use table, overlays, and exceptions. Observed codes in this MVP include R1A-H, R1A-VH, H, R1D-M, LNC, UI, RIV-IMU, RIV-MU, P, NDI, and others. None of the allowances have been signed off.
- Weights, lot-fit curves, the equity production/displacement factors, the flood/landslide blend, and the small climate penalty by building size are value judgments. Confidence measures missing data only.
- Climate risk is current FEMA flood zones plus the city's landslide-prone layer. It is not a site visit, not future rainfall, and not embodied carbon or operating emissions. The brief also asks about infrastructure and marginal carbon; this MVP does not have those layers, so it does not score them.
- Valid sales are county code `0` / description `VALID SALE`, price at least $10,000, on or after 2021-09-26. Love-and-affection and multi-parcel deeds are excluded. This is not an appraisal. Allegheny County's assessed "fair market" values use a 2012 base year and are not used as demand.
- ACS figures are 2020–2024 estimates with margins of error. A block group is not a neighborhood. Block-group geometries are NAD83 used as WGS84; that shift is small next to a block group.
- Scores use fixed anchors (for example $80–$350 per square foot), not a citywide percentile. A high score means "high on that anchor," not "better than most of Pittsburgh."
- Transit is weekday scheduled trips, not delay, crowding, or whether the sidewalk exists.
- Parcel owner names are not in the output. Do not join this file back to an owner roll for a public demo.

## Team

- Tejas — data pipeline and scoring model (`/pipeline`, `pipeline/score.py`)
- Chris — zoning rules (`/zoning/districts.json`)
- YY — map and front end (`/web`)
