# Pipeline (Tejas)

Downloads public Pittsburgh and Allegheny County data, clips it to Hazelwood and the three Lawrenceville neighborhoods, and writes a score for four housing types on each parcel.

Scoring lives in `score.py`. It does not read zoning allowances. Chris's rules are in `/zoning/districts.json`. The map reads those rules itself.

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

Outputs:

- `data/processed/parcels.geojson` (also copied to `web/public/data/`)
- `data/processed/sources.json` — organizers' list URL, caveat, access URL, publisher, pull date, license, status
- `data/processed/score_model.json` — measured inputs vs value judgments
- `data/processed/summary.json` — includes site-flag counts by neighborhood
- `data/processed/lihtc.geojson` — HUD LIHTC projects near the MVP area (name, units, year), map context only
- `data/processed/stops.geojson` — PRT stops with weekday trips, for the drop-a-building ring

`sites.py` reduces the City-owned, tax-delinquency, and condemned layers to booleans and status codes joined on the parcel ID. `score.py` adds the tract displacement screen and the per-type carbon estimate; published inputs (EIA RECS 2020) and chosen tiers are listed separately in `score_model.json`.

Raw downloads stay in `data/raw/` and are gitignored. Pass `--refresh` to pull them again.

Owner names, change-notice mailing addresses, and buyer, seller, grantor, and grantee names are not requested and not written. `build_dataset.py` refuses a parcel file whose keys contain `owner`, `changenotice`, `mailing`, `buyer`, `seller`, `grantor`, `grantee`, or `billing`, and refuses a WPRDC dump whose header does. See `docs/DATA_NOTES.md`.
