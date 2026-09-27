# Planning studio

The default route is now a browser-based 3D housing and transit scenario studio. The original parcel inspector, Find Sites, drop comparison, reports and AI explanations remain at `/explore`. Existing `?pin=` links select a parcel in either interface.

## Run

```bash
cd web
npm ci
npm run dev
```

`npm run build` and `npm run dev` first publish MapLibre 6's worker and sibling shared module from the locked dependency into `public/vendor/maplibre/`. These generated assets are ignored by Git; the dependency license is copied alongside them. Serving both modules from the application fixes the worker-relative URL issue with the Next.js bundle. Run `npm run build` before `npm start`.

## First demo

1. Open the studio. Hazelwood selects PIN `0056F00338000000`; Lawrenceville selects `0049N00010000000`. Both come from the committed dataset. City inventory is not availability.
2. Compare A (townhouse/duplex) and B (triplex), or cycle through the housing palette. Only the active alternative is drawn on the same parcel, to avoid overlapping incompatible proposals.
3. Change dimensions or proposed rent. Geometric placement never silently shrinks the building. A failed sampled fit or a non-permitted use cannot win the screen.
4. Open Transit and add 60 departures per weekday at the selected existing stop. The baseline and proposal share the selected stop and service-span assumption. Inspect before/after aggregate walk + wait.
5. Open Compare. Inspect all seven factors and their priority weights. A common access benefit can leave the housing order unchanged.
6. Optionally enter hypothetical spare daily boarding capacity under Capacity assumptions. Unknown reserve stays null, not zero. Utility capacity is not supplied by this field.
7. Undo/redo, switch baseline/proposal, or export the versioned scenario and computed results as JSON.

## Model boundary: planner-screen-1.0

This is a new, explicit screening comparison alongside the original six-factor explorer; its totals are not comparable with the explorer's totals. It is not a validated development forecast.

| Dimension | Calculation |
| --- | --- |
| Demand | Existing precomputed market-activity/lot-fit score for the chosen type; no household-demand forecast. |
| Physical feasibility | 100 if the fixed-size rectangular template passes an outline search, otherwise 0. Use-table permission is a separate eligibility gate. Setbacks, height restrictions, access and engineering are unreviewed. |
| Affordability | `(rent + utilities) × 12 / target income`. A chosen preference curve maps 20% burden to 100 and 50% to 0, clamped. Target income starts with the local Census estimate; assumed net rent starts at gross rent minus the utility assumption, avoiding double counting. Neither is a proposed-market forecast. |
| Displacement | 100 minus the committed tract risk screen. Unchanged by interventions. |
| Infrastructure capacity | `100 × assumed available daily boardings / assumed new daily housing boardings`, capped at 100. Supply is entered baseline reserve plus extra departures times entered available boarding places. Only evaluated if reserve and a scheduled stop are present. No peak, occupancy, utility or funding model. |
| Access to opportunity | Explicit **transit-access proxy**: straight-line walking at 80 m/min plus half an average departure interval. Interval = assumed service hours × 60 / baseline stop departures plus proposed departures. A chosen 30-minute anchor maps to a 0–100 preference. This does not model destinations, transfers, route usefulness, actual timing or hills. |
| Marginal carbon | 100 minus the existing relative per-home carbon index. It remains unchanged by service edits: no mode-shift, added-service emissions or marginal tonnes model has been introduced. |

Only factors available in **both housing alternatives and both infrastructure states** enter the weighted totals. This avoids comparison artifacts from mismatched evidence coverage. Zero usable weight produces no winner. A gap below 0.1 is displayed as a tie; this threshold is not statistical significance.

The service tool uses one stop's aggregate departures; it does not sum identical trips at neighboring stops. Added departures are user-authored assumptions. It does not modify source feeds or create a feasible operating timetable. It does not predict changes in prices, observed demographics, displacement, utility headroom or emissions.

Massing dimensions and heights are **proposal assumptions**. County building footprints now provide existing context. Their heights are assessment-based estimates or labelled placeholders; LiDAR has not been ingested. Building units remain the selected template's count even when dimensions change; a larger volume does not automatically imply more feasible homes.

## Code and growth path

- `Planner.js`: loading, accessible controls, two examples, source/assumption display, worker lifecycle, revision checks, export.
- `PlannerMap.js`: one MapLibre instance; slim parcel geometry and independent small proposal/service sources. Scoring edits do not resend parcel scores to the renderer.
- `plannerState.js`: immutable scenario/history snapshots and model version.
- `plannerGeometry.js`: fixed-size rotated footprint search with polygon/hole containment checks. No exact maximum-capacity guarantee.
- `plannerModel.js`: pure baseline/proposal evaluator, shared evidence coverage and deterministic explanations.
- `planner.worker.js`: asynchronous evaluator; stale revisions are discarded by the client. A JavaScript fallback retains controls if worker creation is unavailable.

The complete baseline still downloads as committed GeoJSON. This release does not claim citywide performance. The map uses only geometry and a few attributes, and calculations transfer only the selected parcel/stop/scenario. Future geometry tiling, indexed detail loading, network analysis, and a Rust/WASM computation kernel can be added without putting simulation logic into map components.

The original AI endpoint reconstructs baseline facts. The new studio deliberately uses deterministic scenario explanations instead of sending modified proposals to a baseline-only endpoint.

## Verification

`npm test` includes planner tests for both real examples, no-op equality, shared transit gains, unchanged carbon/displacement, unknown capacity, unserved stops, all-zero weights, geometry/permission gates, history replay, holes/concave shapes and versioned exports. `npm run build` checks both routes and worker bundling. Browser verification must also confirm vector/extrusion rendering; a basemap alone does not prove MapLibre's worker loaded.

Before expanding analytical claims: ingest/validate building dimensions, add an audited pedestrian graph and actual destinations, obtain reviewed capacity inputs, and validate scenario-specific emissions and costs. Keep those unknowns visible until supported.

## Existing building context

Run `python pipeline/build_context.py` with `pipeline/requirements.txt` installed. The script reads only the two study-area bounding boxes from the County/PASDA building layer, verifies every requested source ID was returned, deduplicates, repairs polygonal geometry where possible, and retains complete footprints intersecting the neighborhood boundaries. It requests WGS84 coordinates (`outSR=4326`); the source is NAD83. No manual pixel alignment or parcel-wide extrusion is used.

The assessment query selects only parcel IDs and `STORIES`. A story count is used only with one assessment row, at least 80% footprint overlap with the named parcel, and one footprint predominantly on that parcel. The display-height estimate is **stories × assumed 3 m + assumed 1.5 m roof allowance**. Other buildings have a **9 m visual placeholder**. Neither is a measured height. A building click exposes the method; the legend and evidence panel explain coverage. No unit counts or occupancy are inferred. Nonresidential buildings are included.

`existing-buildings.sources.json` records source URLs, coordinate systems, input hashes/retrieval times, output hash and counts. Raw responses are cached in ignored `pipeline/data/raw/building_context`; remove that directory to refresh. The source layer does not declare explicit redistribution terms; resolve these before external publication. Layer/catalog dates do not guarantee that every structure is current.

The layer loads separately from the planner and can be hidden or retried if unavailable. Its geometry is uploaded once per load, not on housing/service edits. It appears from zoom 14; citywide expansion should tile this geometry rather than extend the whole-file download. It does not change baseline scores or silently remove structures under proposals.
