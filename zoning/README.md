# Zoning rules (Chris)

This folder is the zoning hook. The pipeline does not decide which housing types a district allows. It only records the district code it found on each parcel (`zon_new` from the City of Pittsburgh zoning layer).

Edit `districts.json`. The web app reads a copy at `web/public/data/zoning.json`.

After you change the rules, copy them into the app:

```bash
cp zoning/districts.json web/public/data/zoning.json
cp zoning/districts.json data/processed/zoning.json
```

You do not need to rerun the parcel download for a rules-only change. Scores do not depend on this file.

Every district in the file is a stub. `needs_expert_review` is true and `reviewed` is false until someone checks the current Pittsburgh Zoning Code use table, overlays, and special exceptions. The app shows that status. Do not treat these allowances as a zoning determination.
