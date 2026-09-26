# Pipeline (Tejas)

Downloads public Pittsburgh and Allegheny County data, clips it to Hazelwood and the three Lawrenceville neighborhoods, and writes a score for four housing types on each parcel.

Scoring lives in `score.py`. It does not read zoning allowances. Chris's rules are in `/zoning/districts.json`. The map reads those rules itself.

```bash
cd pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python test_score.py
python run_pipeline.py
```

Outputs:

- `data/processed/parcels.geojson` (also copied to `web/public/data/`)
- `data/processed/sources.json` — organizers' list URL, caveat, access URL, publisher, pull date, license, status
- `data/processed/score_model.json` — measured inputs vs value judgments
- `data/processed/summary.json`

Raw downloads stay in `data/raw/` and are gitignored. Pass `--refresh` to pull them again.

Owner names are not in the WPRDC assessment extract. Change-notice mailing addresses are never requested and never written. `build_dataset.py` refuses to emit a parcel file if an output key contains `owner`, `changenotice`, or `mailing`.
