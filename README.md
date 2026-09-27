# Housing Typology, Equity & Climate Matchmaker

Decision-support prototype for the AI Horizons 2026 AI for Housing Hackathon, Challenge 3. Pick a real Pittsburgh parcel and compare four housing types — single-family, townhouse/duplex, small apartment (3–19 units), and large apartment (20+ units) — on demand, transit access, equity, climate risk, displacement risk, and marginal carbon. Weight sliders re-rank the types. The screen labels which parts are observed data and which parts are value judgments.

**Find sites** turns the question around: *where* could we build *what*? Filter all 8,645 parcels by public records (vacant land, City-owned, tax-delinquent, condemned), by what §911.02 allows, by flood, slope, and mine hazards, by walk time to frequent transit, by lot size, and by displacement risk. Matches light up on the map and come back as a ranked list you can sort, click into, and download as CSV. A public record is not availability; verify with the URA, the Pittsburgh Land Bank, or the City before acting.

This is not legal, zoning, financial, or permitting advice. It does not say what may be built.

## Who it helps

- Municipal planners testing how a housing mix shifts when equity or climate counts more than market demand, and pulling a list of City-owned lots where a given type is allowed by right.
- Community development corporations comparing a place like Hazelwood with a place like Lawrenceville before choosing a building type, and screening vacant, tax-delinquent, or condemned parcels for a Land Bank or acquisition conversation.
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
python test_sites.py
python test_pii.py
python run_pipeline.py
```

`python run_pipeline.py --refresh` ignores cached downloads in `pipeline/data/raw/`. On 2026-09-27 huduser.gov answered scripted requests with an AWS WAF bot challenge. If the CHAS step fails with that message, download `2018thru2022-140-csv.zip` in a browser, put it in `pipeline/data/raw/`, and rerun. Every runtime file the app needs is committed under `web/public/data/`, so a Vercel deploy does not run Python.

App (YY):

```bash
cd web
npm install
npm test
npm run dev
```

Open http://localhost:3000. The default view is click a parcel. **Find sites** is the third mode; see [Find sites](#find-sites). **Drop a building** is the second mode: pick one of the four types, click a parcel, and a block extrudes on that lot with an 800 meter walk ring. Drop a second building to compare them. Each result is a screening aid. Flag a result that looks wrong; the flag stays in that browser and is not sent to the City. A consequential decision should go to City Planning / the Zoning Administrator or a qualified professional. See [Human in the loop](#human-in-the-loop) and [Drop a building](#drop-a-building).

### One-minute demo

1. Open the app. Leave **Click a parcel** if you only want the original map.
2. Choose **Drop a building**. Townhouse / duplex is already selected.
3. Search `Butler` and click a Lawrenceville address. A block and an 800 m ring appear. Right-drag the map to tilt it.
4. Small apartment is the next type if you click it. Search `Glenwood` and click a Hazelwood address. That fills Building B.
5. Read the sentence **Why they rank differently**, then the two cards: homes added, the four scores, the weighted total, and whether each number is measured or a weighting choice. The zoning badge cites §911.02 and still says it needs expert review.

For a plain-language explanation, click "Explain the top two." With no API key, that uses a deterministic template. To use a model, copy `web/.env.example` to `web/.env.local` and set `LLM_API_KEY`. Optional: `LLM_BASE_URL` (default `https://api.openai.com/v1`) and `LLM_MODEL` (default `gpt-4o-mini`).

On Vercel, set the project root to `web`. Put the key in the project environment, not in git.

After Chris edits `zoning/districts.json`:

```bash
cp zoning/districts.json web/public/data/zoning.json
cp zoning/districts.json data/processed/zoning.json
```

Scores do not depend on that file. A rules-only edit does not need a full data download.

## Find sites

Choose **Find sites** in the banner. Every filter is optional:

- Public records, combined with "match all" or "match any": vacant land (county land use `VACANT LAND` / `VACANT COMMERCIAL LAND`, or the City's class `Vacant Land`), City-owned, City tax-delinquent, delinquent for a prior year too, and condemned or dead-end. City greenways and parks are left out by default. HUD 2026 Qualified Census Tract only is optional.
- Housing type and zoning: any of the four types, or a triplex read from the §911.02 Three-Unit row, allowed by right, or by right or with special approval. Districts outside the use table never pass a zoning filter.
- Hazards: no Special Flood Hazard Area, or no mapped FEMA zone at all; share of the parcel on 25%+ slopes; no mapped undermined area.
- Transit, lot, and place: straight-line walk to a stop with 60+ weekday trips (80 m per minute), minimum lot size, displacement risk (high only, or leave out high), and Hazelwood or Lawrenceville.

Matches are colored on the map by the type they are ranked as; everything else is greyed. Purple dots are HUD LIHTC projects, shown as nearby affordable stock. The list ranks by the weighted score from the sliders: the chosen type, or else the best type the zoning filter lets through. It can also sort by lot size, walk time, displacement risk, or carbon. Click a row or a highlighted parcel for its site records, then **Open full parcel detail** for the full score card. **Download CSV** exports the list with the caveat on the first line.

One-click example questions and how many parcels match with default weights in this data pull:

| Question | Matches |
| --- | --- |
| City-owned vacant lots where a triplex is allowed by right, outside flood zones, within a 10-minute walk of frequent transit | 25 (23 Hazelwood, 2 Lower Lawrenceville) |
| Vacant lots tax-delinquent for more than the current year where a townhouse or duplex is allowed by right, with no mapped flood zone, steep slope, or undermined area | 83 (62 Hazelwood, 21 Lawrenceville) |
| Vacant lots of 3,000+ sq ft in high displacement-risk tracts where a small apartment building is allowed by right or with special approval | 29 (all Lawrenceville) |

**Ownership, vacancy, delinquency, and condemnation are not availability.** A City-owned lot may be a side-yard candidate or on hold for study, a delinquency may be paid tomorrow, and a condemned house may be occupied or in court. Verify with the [URA](https://www.ura.org/), the [Pittsburgh Land Bank](https://pittsburghlandbank.org/), or the City before acting.

No owner names are read. The WPRDC downloads request only the parcel ID and program fields (City inventory type and status; prior delinquent years; condemned status). The parcel file keeps booleans and short status codes, not amounts owed or billing addresses.

## Displacement risk and marginal carbon

**Displacement risk (screening signal).** One tract-level number from 0 to 100, the same for all four types on a parcel. Vulnerability is the average of the renter share (ACS 2020–2024 B25003) and the share of renter households at or below 80% of HAMFI paying more than 30% of income (HUD CHAS 2018–2022). Pressure is how much faster tract median gross rent rose than the county's between the 2015–2019 and 2020–2024 ACS (B25064). Those two periods do not overlap. Vulnerability and pressure are weighted 50/50. It is not a prediction that anyone will be displaced. In this pull most Lawrenceville parcels score high (median 81). Rents in three of the four main Lawrenceville tracts rose 16–42 percentage points faster than the county's; tract 090200 in Central Lawrenceville trailed the county by 16. Hazelwood scores lower (median 30). Its renters are as cost-burdened, but median rent in tract 562300 was flat while the county's rose about 30%, and tract 562901 rose about 7 points faster than the county. The slider prefers lower-risk places. A CDC pursuing anti-displacement housing can set it to 0 and use the Find Sites filter for high-risk tracts instead.

**Marginal carbon (estimate).** A relative index per new home from 0 to 100, not tonnes of CO2. The building part (60%) blends operational energy, from EIA RECS 2020 Northeast site energy per household (single-family detached 120.7, attached 85.4, 2–4 units 68.0, 5+ units 36.2 million Btu), with an embodied-carbon tier: 1.0 for single-family, 0.6 for the multi-unit types. The tier is a coarse reading of Zuluaga & Saxe (2025) and Rankin et al. (2024), not a measured number. The transport part (40%) is 100 minus the transit score, a proxy with no vehicle-miles figure behind it. Median index: single-family about 63, large apartment about 30.

## Architecture

```text
pipeline/          Tejas. Download, clean, score. Writes data/processed and web/public/data.
  score.py         Measured inputs vs normative anchors. No zoning allowances.
  sites.py         City-owned, tax-delinquent, and condemned records to booleans and codes.
zoning/            Chris. districts.json maps a zoning code to allowed housing types.
web/               YY. Next.js map. Ranks on the client from the static GeoJSON.
  app/api/explain  Template explanation, or an LLM if LLM_API_KEY is set.
  lib/sites.js     Find Sites filters, zoning readings, ranking, and CSV export.
shared/rank_vector.json
                   One numeric example both the Python tests and the JS tests must match.
```

The pipeline stores the zoning district code it found on each parcel. The browser reads `zoning.json` and, once a person has cited a code section, decides what those rules mark as allowed. Turning on "what if zoning changed" ranks all four types and says so. Until then the click-a-parcel view does not filter types.

## Drop a building

Click a parcel stays available from the banner. Drop a building is a second mode on the same parcels and the same scores.

Pick one of the four types. Each has a default home count and height used only for the drawing and the "homes added" line: single-family 1 home / 8 m, townhouse/duplex 2 / 11 m, small apartment 12 / 15 m, large apartment 40 / 24 m. Those defaults do not change the score.

Click a parcel. MapLibre draws a 3D block on the lot. An 800 meter ring (about a 10-minute walk) is drawn from the parcel. PRT stops inside that ring are marked, with a count of stops and weekday scheduled trips. If the parcel overlaps a FEMA flood zone or a 25%+ slope, that lot is tinted. The card shows homes added, demand, transit, equity, climate risk, and the weighted total. Each line is tagged measured or a weighting choice. The zoning badge reads §911.02: allowed (P), needs special approval (A, S, or C), a split such as triplex allowed and 4+ units not, or not allowed when the cell is blank. Districts that are not in the table say to check with the City instead of not allowed. Every badge still says it needs expert review.

Drop a second building, on the same parcel or another one, and the two cards sit side by side with a sentence on why one ranks higher. The disclaimer and the flag control stay on the card. The flag stays in the browser.

Stop dots come from `data/processed/stops.geojson`, the same weekday GTFS counts as the parcel scores, limited to stops near the two neighborhoods.

Composite score = weighted average of demand, transit, equity, climate suitability (100 minus climate risk), lower displacement risk (100 minus displacement risk), and lower carbon (100 minus the carbon index). Default weights are 25/25/25/25/15/15. A missing dimension is skipped. It is not treated as zero.

How the sources are reconciled when they disagree (vintage, geography, join keys, and mismatches) is in [docs/DATA_NOTES.md](docs/DATA_NOTES.md).

## Data Sources

Most layers were pulled 2026-09-26. The CHAS tract file, the site-inventory layers, LIHTC, QCTs, B25003, and the 2015–2019 rent file were pulled 2026-09-27. Names, URLs, and caveats follow the organizers' data resource list. Machine-readable copy, including the caveat text: `data/processed/sources.json`.

| Source (organizers' list) | List URL | Caveat we are respecting | What this MVP actually used |
| --- | --- | --- | --- |
| Pittsburgh neighborhoods (not a row on the list; the comparison boundary) | [WPRDC GeoJSON](https://data.wprdc.org/dataset/e672f13d-71c4-4a66-8f38-710e75ed80a4/resource/4af8e160-57e9-4ebf-a501-76ca1b42fc99/download/neighborhoods.geojson) | Official neighborhood names, not nicknames | Hazelwood, Lower Lawrenceville, Central Lawrenceville, Upper Lawrenceville. CC BY. |
| Allegheny County Parcel Boundaries | [data.wprdc.org/dataset/allegheny-county-parcel-boundaries](https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries) | Geometry and assessment records may update on different schedules | That list URL returned HTTP 404. Live page: [allegheny-county-parcel-boundaries1](https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries1). Polygons read from the county MapServer. 8,645 parcels after the clip. |
| Allegheny County Property Assessments | [property-assessments](https://data.wprdc.org/dataset/property-assessments) | Assessed value is not market value; fields can be stale | CC0 extract. Land use, lot area, year built, living area, and sale fields. Assessed value is not read. Owner names and change-notice addresses are not in the extract. |
| Allegheny County Property Sale Transactions | [list URL](https://data.wprdc.org/dataset/allegheny-county-property-sale-transactions) | Filter with sale-validation codes; many transfers are not arm's-length | Not downloaded. The list URL 404'd; the live page is [real-estate-sales](https://data.wprdc.org/dataset/real-estate-sales). The same filter is applied to sale fields on the assessment file: `VALID SALE` only. |
| Pittsburgh Zoning Districts | [pittsburgh-zoning](https://data.wprdc.org/dataset/pittsburgh-zoning) | The map alone is not enough: overlays, definitions, exceptions, and review rules matter | List URL 404'd. Live page: [zoning](https://data.wprdc.org/dataset/zoning). Feature service supplies `zon_new` only. Allowances are the stub in `zoning/districts.json`. |
| Pittsburgh Zoning Code | [§911.02 Use Table](https://ecode360.com/45476524#45476524) | Authoritative interpretation belongs to the City | Residential rows of §911.02, mapped onto the four housing types by an explicit assumption. A/S/C are special approval. Districts that are not in the table say to check with the City. Still needs expert review. Not a legal determination. |
| American Community Survey 5-Year | [ACS 5-year](https://www.census.gov/data/developers/data-sets/acs-5year.html) | Estimates have margins of error; avoid false precision for small areas | 2024 5-year table files B19013, B25064, B25070. County median income in this file is $78,548. |
| Comprehensive Housing Affordability Strategy (CHAS) | [HUD CHAS](https://www.huduser.gov/portal/datasets/cp.html) | Based on multi-year ACS; releases lag and the tables are complex | 2018–2022 Table 8, census tract summary level 140, from [2018thru2022-140-csv.zip](https://www.huduser.gov/portal/datasets/cp/2018thru2022-140-csv.zip). Columns from the [2018–2022 dictionary](https://www.huduser.gov/portal/datasets/cp/CHAS-data-dictionary-18-22.xlsx). Equity uses the share of renter households at or below 80% of HAMFI paying more than 30% of income. ACS rent burden stays as well. |
| ACS 5-Year, displacement inputs | [ACS 5-year](https://www.census.gov/data/developers/data-sets/acs-5year.html) | Estimates have margins of error | 2024 5-year B25003 (renter share, tract). 2015–2019 5-year B25064 (median gross rent, tract and county) from the [sequence-based summary file](https://www2.census.gov/programs-surveys/acs/summary_file/2019/data/5_year_seq_by_state/Pennsylvania/), sequence 0114, because the table-based files start in 2021. Compared with 2024 B25064. |
| City-Owned Properties | [city-owned-properties](https://data.wprdc.org/dataset/city-owned-properties) | Inventory status changes; confirm with the City / URA | Parcel ID, class, inventory type, current status. Owner column not requested. CC BY. |
| City of Pittsburgh Property Tax Delinquency | [city-of-pittsburgh-property-tax-delinquency](https://data.wprdc.org/dataset/city-of-pittsburgh-property-tax-delinquency) | Delinquency can be paid or appealed any time | Parcel ID and prior delinquent years only. Stored as two booleans. City real estate tax only. CC BY. |
| Condemned and Dead-End Properties | [condemned-properties](https://data.wprdc.org/dataset/condemned-properties) | A condemned building may be occupied or in court | Parcel ID, type, inspection status. Active records, one combined category. Owner column not requested. CC BY. |
| HUD LIHTC database | [LIHTC properties](https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties) | LIHTC only; lags; no units that left the program | 71 projects near the MVP area. Name, units, low-income units, year placed in service. Context only. |
| HUD Qualified Census Tracts | [QCT](https://www.huduser.gov/portal/datasets/qct.html) | Designations change yearly | `QUALIFIED_CENSUS_TRACTS_2026` layer, joined on the 2020 tract. Context only. |
| EIA Residential Energy Consumption Survey 2020 | [Table CE1.2 (Northeast)](https://www.eia.gov/consumption/residential/data/2020/c&e/xls/ce1.2.xlsx) | Existing homes of all ages; site energy, not emissions | Per-household site energy by housing type for the carbon estimate. |
| Embodied carbon studies | [Zuluaga & Saxe 2025](https://doi.org/10.1088/2634-4505/adfc95); [Rankin et al. 2024](https://doi.org/10.1111/jiec.13461) | Canadian and U.S. city samples; wide variation within forms | Only the direction (new single-family homes carry more embodied GHG per home than multi-unit homes) sets a coarse tier. |
| TIGER/Line Shapefiles | [TIGER/Line](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | Boundary vintage must match the statistics | 2024 cartographic block groups (`cb_2024_42_bg_500k`), same GEOID year as the 2024 ACS tables. The [2020–2010 tract relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st42.txt) decides which tracts can be compared with 2015–2019 rents. |
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
- Web: Next.js, React, Leaflet, react-leaflet, MapLibre GL (drop-a-building view only)
- Basemap tiles: OpenStreetMap, attributed on the map

No paid data product. No model is required for the scores. The optional explanation model is called only when `LLM_API_KEY` is set.

## AI Tools Used

- Cursor cloud agent, model Grok 4.7, used during the hackathon to scaffold the pipeline, the scoring model, and the first web app. The scoring rules are in `pipeline/score.py` and `data/processed/score_model.json` so a person can read and change them.
- Cursor cloud agent, model Claude Opus 5.5, added the Find Sites mode, the site-inventory joins, the displacement screen, and the carbon estimate. It found the RECS table and the embodied-carbon papers by web search, then checked each figure against the source file before using it.
- Optional explanation model: any OpenAI-compatible chat endpoint configured with `LLM_API_KEY`. The default model name is `gpt-4o-mini`. If the key is missing or the call fails, `web/lib/explainTemplate.js` writes the explanation from the same numbers. The demo does not depend on a model being up.

## Human in the loop

Every parcel result is a screening aid. It is not a zoning determination, a permit, or an appraisal. The page says so on the result, and it links to the [City Planning zoning page](https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning), the [zoning code](https://ecode360.com/45474054), and the [zoning map](https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb). The zoning page lists 412-255-2621 at the City-County Building, 414 Grant Street.

A person can flag a result as wrong. The flag, and an optional note, stay in that browser's local storage. They are not uploaded and they are not a filing with the City. Take a consequential question to City Planning / the Zoning Administrator or to a qualified professional.

Zoning allowances are filled from §911.02, not from district titles. `needs_expert_review` remains true on every district. Chris should review the mapping, overlays, and the R1D lot-width rule before anyone treats a badge as a determination.

## Limitations

- Decision support only. Not a zoning determination, appraisal, underwriting tool, or permitting screen.
- Housing permissions are a reading of Pittsburgh Zoning Code §911.02 (https://ecode360.com/45476524#45476524), not a zoning determination. The assumption is: single-family = Single-Unit Detached; townhouse/duplex = Single-Unit Attached or Two-Unit; small apartment = Three-Unit for 3 units and Multi-Unit for 4–19; large apartment = Multi-Unit. Where Three-Unit and Multi-Unit differ, the screen says so. A, S, and C are labeled needs special approval. SP districts, planned developments, and other codes that are not use-table columns say to check with the City and are not marked prohibited. `needs_expert_review` stays true. Overlays and lot width are not applied. An earlier unattended request to ecode360 got HTTP 403; this reading uses a saved copy of the use-table page. Observed codes in this MVP include R1A-H, R1A-VH, H, R1D-M, LNC, UI, RIV-IMU, RIV-MU, P, NDI, and others.
- Weights, lot-fit curves, the equity production/displacement factors, the 50/30/20 flood, steep-slope, and undermined blend, and the small climate penalty by building size are value judgments. Confidence measures missing data only.
- Climate risk is current FEMA flood zones, overlap with slopes of 25% or greater as a landslide-risk proxy, and overlap with undermined areas as a preliminary mine screen. It is not a site visit, a flood determination, a geotechnical study, or future rainfall. The brief also asks about infrastructure capacity; this MVP has no such layer and does not score it. Steep slope is not a landslide inventory. Undermined-area maps can be incomplete and are not a safety determination.
- Find Sites records are not availability. City ownership includes lots on hold for study or sale pending; the City marks greenways and parks, which are left out by default. Tax delinquency is the City real estate tax only and can be paid or appealed at any time. Condemned and dead-end are one City category. Vacant land is the county's land-use description or the City's class, which can be stale. Records that did not match the parcel ID are treated as "no"; a layer that failed to load is "unknown" and fails any filter that asks about it.
- Walk time to frequent transit is straight-line distance at 80 m per minute to a stop with 60+ scheduled weekday trips. Real street routes are longer, and hills matter in Hazelwood.
- Displacement risk is a tract screen, not a prediction. ACS tract medians have wide margins of error. Rent change is nominal, with the county change subtracted. Hazelwood's largest tract (42003562901) was split in 2020, so its 2015–2019 rent is the larger 2010 tract (42003562900) it sits inside. The CHAS input is older (2018–2022) than the ACS inputs. The screen is the same for every housing type, because evidence on whether a building type adds to or relieves local displacement is mixed.
- Marginal carbon is a relative estimate. RECS figures describe existing homes of all ages in the Northeast; new construction under current energy codes uses less energy, and the gap between types may narrow. The embodied tier is coarse, and the multi-unit types share one value. Transport is a transit-access proxy with no vehicle-miles number. Grid mix, unit size, parking, and demolition of an existing building are not modeled.
- Valid sales are county code `0` / description `VALID SALE`, price at least $10,000, on or after 2021-09-26. Love-and-affection and multi-parcel deeds are excluded. This is not an appraisal. Assessed value is not market value (the organizers' caveat on the assessment file) and is not an input. The separate sale-transactions dataset was not downloaded; the validation-code filter from that row of the list is what the assessment sale fields go through.
- ACS figures are 2020–2024 estimates with margins of error. A block group is not a neighborhood, and a small-area percentage should not be read as exact. HUD CHAS in the equity score is the 2018–2022 tract share of renter households at or below 80% of HAMFI paying more than 30% of income. That is not the ACS rent-burden share: it is an older special tabulation, a larger geography, and a lower-income renter universe. The two are kept separate and then given equal weight in the need average when both are present. A missing CHAS tract is skipped, not filled with zero. Block-group geometries are NAD83 used as WGS84; that shift is small next to a block group, and the 2024 boundary vintage matches the 2024 ACS tables. It does not match the 2018–2022 CHAS vintage.
- The zoning district map does not encode overlays, definitions, exceptions, or review procedure. Authoritative interpretation belongs to the City. The code, the map, and the department page are linked from each result.
- Scores use fixed anchors (for example $80–$350 per square foot), not a citywide percentile. A high score means "high on that anchor," not "better than most of Pittsburgh."
- Transit is weekday scheduled trips, not delay, crowding, or whether the sidewalk exists.
- Owner names, change-notice mailing addresses, and buyer, seller, grantor, and grantee names are not in the output. The pipeline refuses a parcel file whose keys contain those words. Site addresses and sale prices stay; the parties do not. Do not join this file back to an owner roll or a deed-party file. Details are in [docs/DATA_NOTES.md](docs/DATA_NOTES.md).

## Team

- Tejas — data pipeline and scoring model (`/pipeline`, `pipeline/score.py`)
- Chris — zoning rules (`/zoning/districts.json`)
- YY — map and front end (`/web`)
