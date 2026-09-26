# Zoning rules (Chris)

This folder is the zoning hook. The pipeline does not decide which housing types a district allows. It only records the district code it found on each parcel (`zon_new` from the City of Pittsburgh zoning layer).

The code, the map, and the department page:

- Zoning code (Title 9, General Code): https://ecode360.com/45474054
- Zoning map: https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb
- City Planning zoning page: https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning

On 2026-09-26, ecode360 returned HTTP 403 with a Cloudflare challenge (`cf-mitigated: challenge`). The use tables were not read. Every district in `districts.json` has:

- `allowed: []`
- `use_table_read: false`
- `code_section: null`
- `needs_expert_review: true`
- a `todo` that says to cite the use table before filling `allowed`

The app ignores `allowed` until `use_table_read` is true and `code_section` is set. Until then it does not filter housing types. That is not a finding that every type is allowed. Do not fill `allowed` from the district title.

Edit `districts.json`. The web app reads a copy at `web/public/data/zoning.json`.

After you change the rules, copy them into the app:

```bash
cp zoning/districts.json web/public/data/zoning.json
cp zoning/districts.json pipeline/data/processed/zoning.json
```

You do not need to rerun the parcel download for a rules-only change. Scores do not depend on this file.

`needs_expert_review` stays true after a section is cited. Overlays, exceptions, and review rules are still a person's job. The tool is a screening aid. It does not determine what may be built.
