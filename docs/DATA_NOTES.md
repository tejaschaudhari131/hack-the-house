# Data notes

How this prototype treats sources that do not agree. The organizers' data list is the citation source for names, URLs, and caveats. `data/processed/sources.json` is the machine-readable copy of what was actually pulled. Most layers were pulled on 2026-09-26. The CHAS tract file was pulled on 2026-09-27.

Sources disagree on geography, time, and definition. This build does not average those disagreements into one number. Each score input keeps the geography and definition it came from. A missing source is left missing.

## What is joined to a parcel

The parcel polygon is the Allegheny County GIS parcel, clipped to the official city neighborhood polygons for Hazelwood, Lower Lawrenceville, Central Lawrenceville, and Upper Lawrenceville. Assignment uses the neighborhood with the largest overlap. A parcel is kept when its representative point is inside that neighborhood, or when the overlap is at least half the parcel.

| Input | Vintage | Geography | How it meets the parcel |
| --- | --- | --- | --- |
| Neighborhood boundary | WPRDC city neighborhoods file, pulled 2026-09-26 | Official neighborhood polygon | Largest polygon overlap, as above. Glen Hazel is a separate neighborhood and is not in the clip. |
| Parcel geometry | County MapServer, pulled 2026-09-26 | Parcel polygon | The feature itself. PIN, map-block-lot, and calculated acreage only. |
| Property assessment | WPRDC assessment resource, pulled 2026-09-26 (the resource page was dated 2026-09-07 when first checked) | Parcel ID, requested for ZIP 15201 and 15207, then the county CSV for unmatched PINs if more than 10% miss | Exact PIN match. Unmatched parcels stay on the map with no invented land use or sale. |
| Sale price and turnover | Same assessment file. Sales on or after 2021-09-26 with county validation code 0 / description beginning `VALID SALE` and price at least $10,000 | Neighborhood aggregate for the score. The parcel also keeps its own last valid sale year and price | Neighborhood median price per square foot of living area, and valid sales per 100 parcels. Not joined to the separate sale-transactions dataset. |
| Zoning district | City zoning feature service, pulled 2026-09-26 | Zoning polygon | Representative point inside a district, otherwise the district with the largest overlap. The stored value is `zon_new` and the map label. Allowances are not taken from the map. |
| ACS income, rent, rent burden | 2024 ACS 5-year (survey years 2020–2024), tables B19013, B25064, B25070 | Block group, with a tract fallback | Representative point inside a 2024 Pennsylvania cartographic block group (`cb_2024_42_bg_500k`). Join key is the block-group GEOID. If the block-group estimate is missing, the tract (first 11 digits) is used and the parcel says so. County median income is Allegheny County, GEOID `0500000US42003` ($78,548 in this file). |
| HUD CHAS cost burden | 2018–2022 ACS special tabulation, released December 2025. Table 8. File last-modified 2025-12-10. | Census tract, summary level 140 (not the older tract-part code 080; HUD's 2018–2022 download tool labels 140 as Census Tracts) | The parcel's block-group GEOID is cut to 11 digits. That tract id is the suffix of the CHAS geoid `1400000US` + tract. Allegheny County only (`st` 42, `cnty` 003). |
| Weekday transit | PRT GTFS, representative weekday 2026-09-25 | Stop point | Stops within 400 meters (trip count) and distance to the nearest stop. Scheduled service only. |
| FEMA flood | NFHL layer 28 as published on the pull date | Flood-zone polygon | Share of parcel area overlapping a Special Flood Hazard Area, and share overlapping a 0.2% annual-chance zone. Zone X "minimal hazard" polygons were not downloaded. No overlap in that query is scored as no mapped SFHA or 0.2% zone, not as a flood determination. |
| Steep slopes | City layer "25% or greater," pulled 2026-09-26 | Slope polygon | Share of parcel area on that layer. Used only as a landslide-risk proxy. It is not a landslide inventory. |
| Undermined areas | City/county layer, pulled 2026-09-26 | Mine-influence polygon | Share of parcel area on that layer. A preliminary screen. Historic mine maps can be incomplete. |

Block-group coordinates are NAD83 and are used as WGS84. That shift is small next to a block group. The boundary year matches the 2024 ACS tables. The organizers' list names TIGER/Line; the file joined is the Census cartographic block-group shapefile for the same year.

## Mismatches we did not paper over

**Parcel geometry and the assessment roll.** 411 of 8,645 clipped parcels (about 5%) had no assessment row. The organizers' caveat is that those two files update on different schedules. Those parcels have lower confidence and blank land-use and sale fields.

**Neighborhood sales versus block-group census.** Demand uses neighborhood sale prices. Equity uses block-group income and ACS rent burden, compared with the county median, plus the CHAS tract share described below. A block group can cross a neighborhood line, and a neighborhood contains many block groups. The two are not averaged into one "neighborhood condition."

**ACS versus HUD CHAS.** Both are in the equity score, and they are not the same number. ACS B25070 (2024 5-year, survey years 2020–2024) is the share of all renter households with a computed rent-to-income ratio who pay 30% or more, usually at the block group. CHAS Table 8 (2018–2022, released December 2025) is the share of renter households at or below 80% of HAMFI who pay more than 30% of income, at the census tract, among households whose cost burden was computed. CHAS lags the ACS file by several years: the special tabulation ends in 2022, and the ACS tables used here run through 2024. A tract is also larger than a block group, and the 2024 block-group boundaries are a newer vintage than the CHAS geography. The need score gives equal weight to the income gap, the ACS share, and the CHAS share when each is present. A missing CHAS cell is left missing. It is not treated as zero, and the two shares are not averaged into one unlabeled "rent burden." Column names are the 2018–2022 dictionary: renter bands `T8_est69`, `T8_est82`, and `T8_est95`, with cost-burden subtotals `T8_est73`+`T8_est76`, `T8_est86`+`T8_est89`, and `T8_est99`+`T8_est102`. The file is `2018thru2022-140-csv.zip` from the CHAS download page.

**Assessed value versus sale price.** Assessed value is not market value. It is not requested and not scored. Demand uses valid sale prices. The separate Allegheny County sale-transactions dataset was not downloaded (the list URL returned HTTP 404; the live WPRDC page is `real-estate-sales`). The validation-code filter from that list row is what the assessment sale fields go through. Nominal transfers are excluded. A sale price is still not an appraisal.

**Zoning map versus zoning code.** The map supplies the district code only. On 2026-09-26, https://ecode360.com/45474054 returned HTTP 403 with `cf-mitigated: challenge`. The use tables were not read. `zoning/districts.json` has an empty `allowed` list, `use_table_read: false`, `code_section: null`, and a TODO on every district. The app does not filter housing types from those rows. That is not a finding that every type is allowed. Several organizers' list URLs for parcels, zoning, GTFS, and sale transactions also 404; the sources file names the live page that was read.

**Flood, slope, and mines.** These are three different maps with different update cycles. In this pull, steep slopes touch about 57% of Hazelwood parcels and about 15% of Lawrenceville parcels. Undermined areas show up on about 13% of Hazelwood parcels and on none of these Lawrenceville parcels. Mapped FEMA zones run the other way: about 6% of Lawrenceville parcels and under 1% of Hazelwood parcels. They are not combined into a single "Hazelwood is riskier" fact. Absence from the FEMA query is not a survey. Slope overlap is not a landslide. Mine overlap is not a safety determination.

**Transit schedule versus the street.** Trip counts are the GTFS schedule for one weekday. They are not delay, crowding, or a sidewalk. The drop-a-building ring uses the same stops, written to `stops.geojson` (name, weekday trip count, route ids). A stop is inside the ring when it is within 800 meters of the parcel point. The parcel score's trip count is still the 400 meter figure. Both are scheduled service.

**List URL versus the file we could download.** Where the organizers' URL 404'd or the HTML page blocked this client, `sources.json` keeps the list URL and records `access_url` separately.

## Names of people

Owner names, change-notice mailing addresses, and buyer, seller, grantor, and grantee names are not requested and not written. The assessment query asks only for parcel id, site address, class, use, lot area, year built, living area, and sale date, price, and validation code. `pipeline/config.py` refuses a parcel file whose keys contain `owner`, `changenotice`, `mailing`, `buyer`, `seller`, `grantor`, or `grantee`.

The site address stays, because the map is about the parcel. The last valid sale year and price stay on the parcel, without the parties. Neighborhood scores use the median and the count, not a list of transactions. Do not join this file back to an owner roll or a deed-party file for a public demo.
