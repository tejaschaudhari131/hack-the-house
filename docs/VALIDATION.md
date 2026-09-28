# Validation

What has been checked, how, and what has not. Run everything with:

```bash
python -m unittest discover -s pipeline -p 'test_*.py'
cd web && npm ci && npm test && npm run build
```

## Citywide release — September 27, 2026

- **Coverage:** all 90 Pittsburgh neighborhoods; 142,865 mapped records (142,571 identified parcels plus 294 anonymous/shared-ground polygons with internal map IDs). No neighborhood omitted. 140,983 records match assessment evidence. Unknown parcel-ID-based property flags stay unknown.
- **Buildings/network:** 116,502 recorded outlines; 371,689 walking nodes, 845,872 directed edges, 311 mapped parks with walking access. 94 park ways lacked a valid polygon or mapped access; relation-only parks remain out of scope. Recorded outlines and estimated heights are not a verified current dwelling inventory.
- **Automated checks:** 49 Python tests pass. **30 web test files pass**. They cover original study regressions plus all 90 canonical-to-browser parcel round trips, unique IDs, lookup, hashes, chunk failures/aborts, graph remapping and cache behavior. Build succeeds in **53.46 seconds**, including data preparation. Routing tests cover curved/same-edge routes, disconnected crossings, foot direction, bridge snapping exclusions, fractional new junctions, immutable baselines and no score/land effect from saving existing routes.
- **Transport:** no citywide parcel/building/graph download on entry. Hashed parcel/building parts target 12 MiB, with one buffered routing region per active site. The manifest is **57,246 bytes** (11,328 gzip). The largest individual file is a regional graph at **15,460,400 bytes**. Static public assets total **838,256,997 bytes**; the explanation function trace totals **34,903,169 bytes**, below the ordinary 250 MB function limit. This is CDN storage, not a per-visit download. Each file is below 50 MB. Canonical compressed sources total about 46.5 MB; the original study files are test fixtures outside the public directory. Map assets are excluded from the explanation function, which reads only requested compressed neighborhoods.

### Local browser checks and preview handoff

Checked the production build locally in the desktop browser, using the same default parcel in both views. Every row below loaded scores, zoning and public-source evidence. Studio successfully added one single-family building at each site and compared it with all other templates. Explorer successfully placed its A/B comparison options. No browser console errors were captured in either view.

| Neighborhood | Parcel PIN | Studio single-family score | Explorer A / B scores |
| --- | --- | --- | --- |
| Squirrel Hill North | `0085L00096000000` | 80.3 | Single-family 69.7 / large apartment 75.4 |
| East Liberty | `0083F00297000000` | 71.5 | Townhouse/duplex 69.3 / single-family 65.4 |
| Carrick | `0060A00150000000` | 62.8 | Single-family 63.8 / small apartment 68.6 |
| Middle Hill | `0010G00045000000` | 75.5 | Townhouse/duplex 66.7 / small apartment 65.9 |
| Brookline | `0062S00279000000` | 73.7 | Single-family 59.8 / townhouse/duplex 63.1 |

These are separate models, not expected cross-view score parity. Studio retains one draft plus type comparisons, as requested; it has no A/B slots. Middle Hill also produced eligible Studio duplex/triplex scores of 77.6/75.7. Unsupported or conflicting alternatives had no Studio score. Squirrel Hill North's selected parcel lacked a mapped walking connection: access/capacity stayed excluded (5/7 factors), not zero. Explorer is preserved as a reference: its original comparison still displays scores alongside zoning exclusions or special-approval labels.

Neighborhood switching and direct PIN links were exercised. Public-source drawers showed the actual PRT stop, routes and service date for each Explorer parcel. The local `/api/explain` endpoint returned HTTP 200 for all five PINs using the compressed neighborhood sources; the inspected response identified the deterministic template fallback.

The infrastructure UI snapped two Hazelwood points (`-79.943814, 40.411423` → `-79.944191, 40.410018`) and saved a **225 m / 2.8 minute** route. Its underlying network route has ten vertices. Saving it left the displayed stop/park access unchanged, as expected for existing infrastructure. Automated tests additionally cover new connections into edge interiors; visual road crossings alone do not create junctions.

Vercel successfully deployed feature commit `c3540f0` at the [branch preview](https://hack-the-house-git-playhouse-citywide-tej-fff0.vercel.app). The preview requires the team's login, so these browser checks were **local, not preview checks**. The owner has assigned manual preview testing to a teammate. [PR #7](https://github.com/tejaschaudhari131/hack-the-house/pull/7) is prepared for review and must remain unmerged until the team decides to merge.

For the teammate: open each PIN above on `/` and `/explore`, check sources and zoning, add a building in Studio, compare types (A/B in Explorer), and try **Infra → Route between two points**. Confirm camera panning and neighborhood switching on the actual deployed site. No screenshots were generated.

### Neighborhood-scoped rendering follow-up

Zooming out can no longer expand detail loading to every neighborhood. The selected neighborhood plus its immediate polygon-adjacent neighbors defines the maximum display scope (at most nine neighbors in this release). Only members intersecting the current view are requested. The final viewport triggers downloads, with a two-neighborhood concurrency limit and cancellation of obsolete queued work. Collision-context buildings outside that display scope are filtered without dropping them from evidence. Repeated pointer/UI updates no longer rebuild the parcel search catalogue or upload unchanged feature sets. Infra uses the graph already in memory instead of fetching its separate roads file.

All 30 web test files pass, including bounded concurrency/cancellation, one-hop neighborhood scope, unchanged full-resolution coordinates/heights for all 116,502 building outlines, and unchanged graph vertices/costs. A local production-browser check recorded:

- Hazelwood close view: 219 buildings and 521 parcel outlines; selected neighborhood only.
- Wider view: 6,811 buildings and 8,980 parcel outlines, confined to Hazelwood and its four adjoining neighborhoods.
- City overview: **0 buildings, 0 parcel outlines, 0 road segments**; housing score remained **80.1**.
- Zoom back into Infra: 772 buildings, 1,293 parcel outlines and 1,458 road segments across the two visible allowed neighborhoods. The same two-point route still returned **225 m / 2.8 minutes**.
- Switched to Middle Hill and panned: scope changed to Middle Hill and its adjoining neighborhoods, duplex score stayed **77.6**, and adding a duplex produced a one-building/two-home plan. No browser console errors were captured.

Counts depend on camera size and position. These verify bounded work and correct behavior, not an FPS guarantee on every device. No coordinate simplification, height rounding, scoring change or routing-graph pruning was introduced. Explorer already loads a single neighborhood and retains its reference UI.

### Original-study parity and explicit source corrections

`python pipeline/audit_citywide.py` reproduces [CITY_DATA_AUDIT.json](CITY_DATA_AUDIT.json) against the frozen `527d963` parcel release (unchanged by transit fix `9cf9ce1`). All **8,644 real original PINs** remain. The old ambiguous `COMMON GROUND` record is retained geographically as `SITEB02FAC2205E6ED69`; it is no longer used as a shared parcel identifier.

**6,019 retained PINs have identical score dictionaries; 2,625 differ.** Scoring formulas, type multipliers and weights have not changed. The release regression test requires evidence/factor changes to accompany any score change. Differences are not presented as exact production parity:

- The complete safe-column county assessment extract recovers **307 previously unmatched study records**, including 25 valid sales. Lower Lawrenceville's valid-sale count changes 81 → 106 and median sale price per finished square foot 274.3 → 270.6. This changes neighborhood market inputs and related type scores. The example `0049N00010000000` duplex market score changes 39.9 → 40.9 and equity 26.8 → 26.6; its other scored factors are unchanged.
- Full source coverage retains anonymous polygons separately and applies maximum-overlap neighborhood assignment. Study counts become Hazelwood 3,604; Lower Lawrenceville 1,352; Central Lawrenceville 2,220; Upper Lawrenceville 1,476. Denominators and rounded market factors can therefore change. PIN `0026C00112000000` moves to Bloomfield and `0120P00222000000` to Stanton Heights, with their actual locations retained.
- Expanded hazard coverage corrects the long parcel `0080C00250000900`: flood/steep-slope overlaps extend beyond the old study query area. Its single-family hazard score changes 31.5 → 35.1. Two flood-overlap properties also change without necessarily changing rounded scores.
- The Hazelwood example `0056F00338000000` retains identical parcel scores. Studio access can change with refreshed OSM context; transit capacity additionally uses the explicitly disclosed schedule × spare-place assumption from `9cf9ce1`. These are separate from the parcel score model.

### Remaining limits

Regional routing buffers can omit long detours; unmapped/disconnected access stays unknown. PRT schedules do not establish actual occupancy or utility capacity. Expert zoning, engineering, current occupancy, practitioner validation, mobile frame-rate and 30-user load testing remain unverified. No new paid services or secrets were added.

The initial Studio data for the default Hazelwood site is about **4.77 MB gzip**; the five new-neighborhood examples range from 3.80 to 5.69 MB gzip. These are local file measurements assuming compressed delivery, excluding JS/CSS, basemap tiles and adjacent neighborhoods fetched after camera movement. The benchmark script reproduces them. The largest tracked Git file is the old 27.85 MB regression fixture; no tracked file exceeds 50 MB. Derived browser chunks are generated at build time rather than stored in Git.

## Antialiasing trial — September 27, 2026

Studio now requests `canvasContextAttributes: { antialias: true }`. The local browser confirmed **4× MSAA**, versus zero samples in the previous configuration. Screenshots showed smoother building silhouettes. No geometry, heights, detail thresholds, data loading, scores or Explorer rendering changed.

All **34 web test files pass**, including full-resolution city geometry/height preservation and score parity checks. The production build used for the benchmark also passes.

The production-build browser benchmark ran on an AMD Radeon 780M using Chromium 154/ANGLE on Linux, with an **832 × 644 drawing canvas at device-pixel ratio 1**. Each mode used one warm-up orbit followed by three measured six-second pan/rotation orbits. Pitch stayed at 55°. Hazelwood ran OFF then ON; East Liberty ran ON then OFF. Both modes followed the same camera path over the same source data, with ordinary viewport culling and React updates active.

| View | Median run FPS, OFF → ON | Median run p95 frame interval, OFF → ON |
| --- | --- | --- |
| Hazelwood, zoom 17.6, about 123 buildings at rest | 59.31 → 59.61 | 19.7 → 19.4 ms |
| East Liberty and visible adjoining neighborhoods, zoom 16.2, about 2,600–2,700 buildings | 56.05 → 56.69 | 30.4 → 28.3 ms |

These differences are within ordinary run-to-run variation, **not evidence that antialiasing improves performance**. No meaningful regression was observed in these views, so antialiasing remains enabled for the trial. The wider view had occasional 50–84 ms frame intervals and main-thread long tasks in both modes. The measurements are delivered MapLibre render intervals, not GPU execution time; the close view is refresh-rate limited. GPU memory, power use, phones and larger/high-DPI canvases were not measured. Counts in the [raw results](benchmarks/antialiasing.json) are live DOM snapshots and can lag a final camera frame while React publishes viewport updates.

To repeat, use a disposable local tab and a production build with the diagnostic explicitly enabled:

```bash
cd web
NEXT_PUBLIC_MAP_BENCHMARK=1 npm run build
npm run start -- --port 3001
```

Open `http://localhost:3001/?pin=0056F00338000000&renderBenchmark=1&antialias=off`, dismiss the tour if present, wait for the map and scores, then press **Run close camera benchmark**. Repeat with `antialias=on`. Use PIN `0083F00297000000` and **Run wide camera benchmark** for East Liberty. Keep the tab active, canvas size unchanged and avoid other GPU/CPU-heavy work during measurement. The diagnostic prints context attributes, sample count, render intervals, long tasks and visible-feature counts. It is absent from ordinary builds; rebuild without the environment variable for normal use. Antialiasing is isolated in its own feature commit for rollback.

## Building zoom stability — September 27, 2026

Repeated zoom changes in East Liberty reproduced disappearing buildings: all 486 selected building records remained in the source, but 8 previously rendered IDs disappeared and a rendered feature had no ID. A render buffer alone did not resolve that mismatch. The installed `@maplibre/geojson-vt` 6.1.1 returns immediately when an update includes `removeAllProperties`, ignoring the replacement properties. Overlapping neighborhood chunks can supply new object copies of the same building; those updates then lose height, colour and promoted ID in worker tiles even though the main-thread source remains correct.

Map patches now remove only obsolete property keys before setting the current values. The regression test runs against the actual installed tiler: it fails with the old patch and passes with the corrected patch, retaining IDs, fractional heights and colours while removing obsolete properties. No dependency update or full-source replacement is required.

Studio also retains a 25% geographic margin around each camera edge, reuses it through small movements, shrinks it on substantial zoom-in, and restores cached neighborhood display during movement independently of settled-camera downloads. Detail enters at zoom 14 and exits below 13.5; 3D still starts at 16. The active-neighborhood-plus-immediate-neighbors limit remains in force. Tests cover buffered pan/zoom selection, cutoff hysteresis, cached restoration, neighborhood limits and exact feature retention.

In the corrected production build, four rapid East Liberty zoom cycles (crossing 16, 14 and alternating 13.95/13) returned all **309 originally rendered building IDs** each time, with no unidentified rendered features. The buffered source contained 975 buildings at rest, including offscreen context. Both full overview stops cleared the detailed source to zero. These checks use MapLibre's rendered-feature queries and source data at the same camera pose; they do not compare a rendered count directly with the larger buffered source count.

Hazelwood also restored all **94 originally rendered IDs** on each of four cycles, with 289 buffered source buildings and zero detailed features at both overview stops. No browser console errors were observed. The wider East Liberty camera benchmark used the same desktop, canvas and three-run orbit protocol as the antialiasing trial: median **57.53 FPS** and **26.2 ms p95** versus the earlier 56.69 FPS / 28.3 ms. This is comparable performance, not a demonstrated speed increase. One run still had a 107.7 ms interval; mobile and larger canvases remain unmeasured. [Counts, ID hashes and frame timings](benchmarks/zoom-stability.json) retain both the failing and corrected observations.

All **35 web test files pass**, including citywide coordinate/height preservation and score parity; the production build passes. To repeat the browser check, use the opt-in benchmark build described above and press **Check zoom restoration** after loading the site. This diagnostic is omitted from ordinary builds.

## Historical checkpoints

At the Checkpoint 3 commit: JS 66/66 pass; Python `test_score` 18, `test_pii` 5, `test_sites` 5 pass; `next build` succeeds.

## What the automated tests prove (spec section L)

| Check | Tests |
| --- | --- |
| L.1 Python/JS composite and rank parity | `shared/rank_vector.json` (4-factor, 6-factor, and edge cases) is read by `pipeline/test_score.py` (`test_shared_rank_vector*`) and `web/lib/factors.test.js`, `rank.test.js`. |
| L.2 Inversion, normalization, zero weights, absent and non-finite data, rounding | `factors.test.js`: ties to even (62.25 → 62.2), no early rounding of 100 − risk, all-zero weights → no score, `""`/NaN/Infinity/numeric strings skipped, coverage text, weight shares, transit's total share. |
| L.3 Contributions reconcile; zero weight is never a driver | `comparison.test.js`. |
| L.4 Unequal coverage disclosed; missing layers fail mandatory filters | `comparison.test.js` (coverage warning), `sites.test.js` (unknown data fails a filter that asks about it), `test_score.py` (missing hazards are not zero risk). |
| L.5 Shared factors constant on one parcel; claimed reversals reproduce; ties explicit | `comparison.test.js` (held constant, tie), `robustness.test.js` (the flip just before the reported weight keeps the winner; solved crossing makes the unrounded scores equal; shared factors cannot reorder). |
| L.6 Permission categories | `zoning.test.js` (P, A/S special approval, blank, P/S, Three-Unit vs Multi-Unit, districts outside the table, unknown never permitted), `comparison.test.js` (neither permitted). |
| L.7 Triplex keeps three-unit semantics | `comparison.test.js` (guided example), `explain.test.js` (compare facts: 3 homes, Three-Unit row; CSV label). |
| L.8 AI facts match the screen for six factors; no PII | `explain.test.js` (facts' weighted totals equal `rankTypes`; displacement/carbon labels; no owner fields), `test_pii.py`, `factors.test.js` (evidence drawer). |
| L.9 AI success and fallbacks | `explain.test.js` with the AI SDK mock model: streaming, cache, errors, missing credentials, rate limit, invalid input, provider plan (gateway key / `LLM_*` / OIDC), 401 fall-through, all-fail template, redacted logs. A local HTTP server speaking the OpenAI streaming protocol exercised the real `createOpenAICompatible` path (Checkpoint 2). |
| L.10 Stale and out-of-order summaries | `explainClient.test.js`. |
| Scenario state | `scenarioState.test.js` (round trip incl. triplex and what-if; bad input rejected; version warnings). |

## Browser checks (headless Chrome over the DevTools protocol)

- Checkpoint 1 (local production build): fresh load → onboarding → guided shortlist (25 matches, top PIN 0056F00338000000) → triplex vs townhouse (72.6 vs 72.9) → priority change reverses → brief printed to PDF (2 pages: brief + source/version footer). No page exceptions.
- Checkpoint 2: sweep table, evidence drawer, share link restore (603 characters), stale-version warnings, bad-link rejection, Tab order from the skip link with visible outlines, 0 px horizontal overflow at 390 px.
- Checkpoint 3: the recorded walkthrough of production (`/opt/cursor/artifacts/cp3/`) follows `docs/DEMO_SCRIPT.md`.
- Owner's production checks after the Checkpoint 2 merge: title, share link, and the six-factor compare sentence verified on https://hack-the-house.vercel.app.

## Performance (measured, not estimated)

Headless Chrome on the build VM, local `next start`, three runs each. `parcels.geojson` is 27.8 MB decoded and 1.66–1.78 MB brotli-compressed on production. Before the Checkpoint 2 change, five slider moves caused 5–6 long tasks totaling 324–429 ms; after, one long task of 54–57 ms. First map draw 856–877 ms before, 835–873 ms after. These are not real-device timings.

## Known gaps (not validated)

- **Expert zoning review pending.** No qualified reviewer has checked the §911.02 mapping, overlays, or the R1D lot-width rule. Every badge says it needs expert review.
- **No practitioner validation.** Rankings have not been compared with CDC or planner judgment; see `docs/PILOT_PLAN.md`.
- **No outcome validation.** There is no ground truth for "best housing type"; the scores are a transparent screen, not a prediction.
- **Real AI calls on production have not succeeded**: no working credential is configured, so the live site shows the labeled template. The model path is tested with mocks and a local protocol server only.
- **Map keyboard access.** Leaflet and MapLibre parcel maps are not keyboard-operable; address search, Find Sites results, the guided example, and share links are the keyboard path.
- **Accessibility audit** beyond the checks above (screen-reader walkthrough, contrast measurement) has not been done.
- **Data currency.** Layers were pulled 2026-09-26/27; the app does not refresh them. CHAS 2018–2022 lags the ACS 2020–2024 inputs.
