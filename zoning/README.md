# Zoning rules (Chris)

This folder is the zoning hook. The pipeline records the district code on each parcel (`zon_new` from the City of Pittsburgh zoning layer). Which housing types that code allows is `districts.json`, read from Pittsburgh Zoning Code §911.02.

- Use table: https://ecode360.com/45476524#45476524
- Code root: https://ecode360.com/45474054
- Zoning map: https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb
- City Planning zoning page: https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning

Legend (§911.01F): P permitted by right, A administrator exception, S special exception, C conditional use, blank not permitted.

Subdistricts use the base column. R1D-VL uses R1D. GT-A uses GT. RIV-MU uses the RIV MU column. The second DT column in the table header is unlabeled and blank for these residential rows, so it is not mapped.

The four app types are an assumption:

- `single_family` = Single-Unit Detached
- `townhouse_duplex` = Single-Unit Attached or Two-Unit
- `small_apartment` = Three-Unit for 3 units, Multi-Unit for 4–19
- `large_apartment` = Multi-Unit (20 or more units)

`allowed` is P. `partial` is a split, such as a triplex permitted and 4+ units not. `variance_or_exception` keeps the letter A, S, C, or P/S. The screen calls those needs special approval, not a variance. Standards cited from the table are §911.04A.69, §911.04A.69A, and §911.04A.85.

Districts that are not columns (SP-*, planned unit developments, public-realm districts, Mount Oliver Borough) have `not_in_use_table: true` and an empty `allowed` list. The app says to check with the City. It does not mark them prohibited.

`needs_expert_review` stays true. Overlays, the R1D 35-foot lot-width test, and review procedure are not applied automatically. This is decision support, not a determination of what may be built.

The web app reads `web/public/data/zoning.json`. After you change the rules:

```bash
cp zoning/districts.json web/public/data/zoning.json
cp zoning/districts.json pipeline/data/processed/zoning.json
```
