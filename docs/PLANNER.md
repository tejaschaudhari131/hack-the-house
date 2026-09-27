# Planning studio

The default route is now a browser-based 3D housing and transit scenario studio. The original parcel inspector, Find Sites, drop comparison, reports and AI explanations remain at `/explore`. Existing `?pin=` links select a parcel in either interface.

Housing opens at the original 55° pitch and −25° bearing. Entering Infra or Transit switches to a north-up top-down camera; returning to Housing restores the original angled view. Compare preserves the current view and the 2D/3D control remains available. Camera switches leave the road graph and scenario edits intact.

## Run

```bash
cd web
npm ci
npm run dev
```

`npm run build` and `npm run dev` generate the compact planner dataset and first publish MapLibre 6's worker and sibling shared module from the locked dependency into `public/vendor/maplibre/`. These generated assets are ignored by Git; the dependency license is copied alongside them. Serving both modules from the application fixes the worker-relative URL issue with the Next.js bundle. Run `npm run build` before `npm start`.

## First demo

1. Open the studio. Hazelwood selects PIN `0056F00338000000`; Lawrenceville selects `0049N00010000000`. Both come from the committed dataset. City inventory is not availability.
2. Compare A (townhouse/duplex) and B (triplex), or cycle through the housing palette. Only the active alternative is drawn on the same parcel, to avoid overlapping incompatible proposals.
3. Change dimensions or proposed rent. Geometric placement never silently shrinks the building. A failed fit, recorded-building overlap, missing building context or non-permitted use cannot win the screen.
4. Open Transit and add 60 departures per weekday at the selected existing stop. The baseline and proposal share the selected stop and service-span assumption. Inspect before/after aggregate walk + wait.
5. Open Compare. Inspect all seven factors and their priority weights. A common access benefit can leave the housing order unchanged.
6. Optionally enter hypothetical spare daily boarding capacity under Capacity assumptions. Unknown reserve stays null, not zero. Utility capacity is not supplied by this field.
7. Undo/redo, switch baseline/proposal, or export the versioned scenario and computed results as JSON.

## Model boundary: planner-screen-1.3

This is a new, explicit screening comparison alongside the original six-factor explorer; its totals are not comparable with the explorer's totals. It is not a validated development forecast.

| Dimension | Calculation |
| --- | --- |
| Demand | Existing precomputed market-activity/lot-fit score for the chosen type; no household-demand forecast. |
| Physical feasibility | 100 if the fixed-size rectangle fits the parcel without touching a recorded building or proposed infrastructure reservation; otherwise 0. Missing building context excludes this factor and withholds ranking. Use-table permission is a separate eligibility gate. Setbacks, height restrictions, access and engineering are unreviewed. |
| Affordability | `(rent + utilities) × 12 / target income`. A chosen preference curve maps 20% burden to 100 and 50% to 0, clamped. Target income starts with the local Census estimate; assumed net rent starts at gross rent minus the utility assumption, avoiding double counting. Neither is a proposed-market forecast. |
| Displacement | 100 minus the committed tract risk screen. Unchanged by interventions. |
| Infrastructure capacity | `100 × assumed available daily boardings / assumed new daily housing boardings`, capped at 100. Supply is entered baseline reserve plus extra departures times entered available boarding places. Only evaluated if reserve and a reachable scheduled stop are present. No peak, occupancy, utility or funding model. |
| Access to opportunity | Explicit **access proxy**: routed walking at 80 m/min (40 on stairs) plus half an average departure interval; optionally blended with nearest-park walking preference using an explicit user weight. Interval = assumed service hours × 60 / baseline stop departures plus proposed departures. A chosen 30-minute anchor maps to a 0–100 preference. This does not model destinations, transfers, route usefulness, actual timing or hills. |
| Marginal carbon | 100 minus the existing relative per-home carbon index. It remains unchanged by service edits: no mode-shift, added-service emissions or marginal tonnes model has been introduced. |

Only factors available in **both housing alternatives and both infrastructure states** enter the weighted totals. This avoids comparison artifacts from mismatched evidence coverage. Zero usable weight produces no winner. A gap below 0.1 is displayed as a tie; this threshold is not statistical significance.

The service tool uses one stop's aggregate departures; it does not sum identical trips at neighboring stops. Added departures are user-authored assumptions. It does not modify source feeds or create a feasible operating timetable. It does not predict changes in prices, observed demographics, displacement, utility headroom or emissions.

Massing dimensions and heights are **proposal assumptions**. County building footprints now provide existing context. Their heights are assessment-based estimates or labelled placeholders; LiDAR has not been ingested. Building units remain the selected template's count even when dimensions change; a larger volume does not automatically imply more feasible homes.

## Code and growth path

- `Planner.js`: loading, accessible controls, two examples, source/assumption display, worker lifecycle, revision checks, export.
- `PlannerMap.js`: one MapLibre instance; slim parcel geometry and independent small proposal/service sources. Scoring edits do not resend parcel scores to the renderer.
- `plannerState.js`: immutable scenario/history snapshots and model version.
- `plannerGeometry.js`: parcel-edge alignment and exact manual placement, with polygon/hole containment and recorded-building overlap checks. No exact maximum-capacity guarantee.
- `plannerModel.js`: pure baseline/proposal evaluator, shared evidence coverage and deterministic explanations.
- `planner.worker.js`: asynchronous evaluator; stale revisions are discarded by the client. A JavaScript fallback retains controls if worker creation is unavailable.

The studio downloads a generated compact parcel view; the explorer retains the complete committed GeoJSON. This release does not claim citywide performance. The map uses only geometry and a few attributes, and calculations transfer only the selected parcel/stop/scenario. Future geometry tiling, indexed detail loading, network analysis, and a Rust/WASM computation kernel can be added without putting simulation logic into map components.

The original AI endpoint reconstructs baseline facts. The new studio deliberately uses deterministic scenario explanations instead of sending modified proposals to a baseline-only endpoint.

## Verification

`npm test` includes planner tests for both real examples, no-op equality, shared transit gains, unchanged carbon/displacement, unknown capacity, unserved stops, all-zero weights, geometry/permission gates, history replay, holes/concave shapes and versioned exports. `npm run build` checks both routes and worker bundling. Browser verification must also confirm vector/extrusion rendering; a basemap alone does not prove MapLibre's worker loaded.

Before expanding analytical claims: ingest/validate building dimensions, audit the pedestrian graph and add actual destinations, obtain reviewed capacity inputs, and validate scenario-specific emissions and costs. Keep those unknowns visible until supported.

## Existing building context

Run `python pipeline/build_context.py` with `pipeline/requirements.txt` installed. The script reads only the two study-area bounding boxes from the County/PASDA building layer, verifies every requested source ID was returned, deduplicates, repairs polygonal geometry where possible, and retains complete footprints intersecting the neighborhood boundaries. It requests WGS84 coordinates (`outSR=4326`); the source is NAD83. No manual pixel alignment or parcel-wide extrusion is used.

The assessment query selects only parcel IDs and `STORIES`. A story count is used only with one assessment row, at least 80% footprint overlap with the named parcel, and one footprint predominantly on that parcel. The display-height estimate is **stories × assumed 3 m + assumed 1.5 m roof allowance**. Other buildings have a **9 m visual placeholder**. Neither is a measured height. A building click exposes the method; the legend and evidence panel explain coverage. No unit counts or occupancy are inferred. Nonresidential buildings are included.

`existing-buildings.sources.json` records source URLs, coordinate systems, input hashes/retrieval times, output hash and counts. Raw responses are cached in ignored `pipeline/data/raw/building_context`; remove that directory to refresh. The source layer does not declare explicit redistribution terms; resolve these before external publication. Layer/catalog dates do not guarantee that every structure is current.

The layer loads separately from the planner and can be hidden or retried if unavailable. Its geometry is uploaded once per load, not on housing/service edits. It appears from zoom 14; citywide expansion should tile this geometry rather than extend the whole-file download. It does not change baseline scores or silently remove structures under proposals.

## Proposal placement

Automatic placement tries the parcel's longest edge first, aligning the longer building dimension with it, then other parcel-edge/perpendicular orientations and sampled centres. It retains the requested dimensions and prefers placements without recorded-building overlap. This is **parcel alignment, not inferred street frontage**. A failed search is not proof no feasible design exists.

Each housing option can store a manual placement: east/north metre offsets from the parcel bounding-box centre and a bearing for the building depth axis, clockwise from north. Users can rotate, enter offsets, or click **Place on map** and choose a centre. Manual placements are never moved or resized automatically. Boundary contact, holes and building overlap remain visible review failures. **Reset alignment** returns that option to the automatic search. Undo/redo and JSON exports retain placement; exports also identify the building-context dataset hash.

Only nearby building geometries intersecting the selected parcel's bounding box are passed to the calculation worker. A hidden context layer still participates in overlap checks. If the data cannot load, unknown overlap evidence is not treated as an empty site: ranking is withheld. A mapped overlap requires review of redevelopment/demolition; there is no removal tool or assumption that demolition is permitted. No overlap is not proof of vacancy.

The extract currently contains 6,624 footprints: 2,328 in Hazelwood and 4,296 in Lawrenceville. 2,235 heights use story-based estimates and 4,389 use placeholders. The additional uncompressed geometry payload is approximately 3.5 MB for both examples. These are extract counts, not verified dwelling counts or a performance guarantee.

## Connected walking, connections and parks (planner-screen-1.2)

The studio now uses the same OSM walking graph for both baseline and proposal. The older straight-line evaluator remains only as a compatibility path for explicit non-network callers. The UI never substitutes straight-line travel when routing fails. Initial ground-node connectors from the parcel centre and selected stop may each be up to 100 m; they are assumed access links, not verified entrances or safe crossings. Graph links use shared OSM node IDs, walking permissions, conservatively excluded barriers and foot-specific one-way tags. Stairs use an assumed 40 m/min; other walking links use 80 m/min. Slopes, wheelchair suitability, crossing safety and time-dependent access are not calibrated.

`pipeline/build_network.py` reproducibly prepares a buffered extract around the two study areas. `walking-network.sources.json` retains query, snapshot, hashes, license, coverage and assumptions. The graph has 53,089 nodes, 127,136 directed edges and 42 closed-way parks with mapped walking access; 17 other candidate park ways lack valid polygons or access. Relation-only parks are omitted. OSM park geometry is a mapped inventory, not confirmation of current opening or public entrance access. Graph and displayed network are © OpenStreetMap contributors, ODbL 1.0; see https://www.openstreetmap.org/copyright.

The **Infra** tool supports hypothetical pedestrian paths (3 m width), streets with sidewalks (12 m width; walking effects only), and 20 × 20 m park zones. Connections snap within 35 m to existing ground nodes, have two endpoint junctions and must be 2–500 m long. Crossings create no intermediate junctions. Parks use an assumed connector to a node within 50 m. Existing-building intersections are rejected by the editor; river crossings, ownership, grades, road safety, engineering and cost remain unverified. These are scenario assumptions, not approved projects. Up to 12 connections and 12 parks are supported per local scenario. Cancel leaves no edit; remove/undo/redo recalculate outputs.

Infrastructure corridors and park zones reserve land in the **proposal** only, and participate in housing containment/overlap checks without modifying official parcels. Both housing alternatives retain their requested dimensions. The network calculates routed walking to the selected scheduled stop and the nearest mapped/proposed park. The selected stop still has an aggregate frequency assumption, not a timetable, route or transfer model. Adding a park does not add bus service.

Access combines transit preference `clamp(100 × (1 − (walk + wait)/30))` and park preference `clamp(100 × (1 − park walk/15))` with the user's **park share of access priority**. The default share is 0%, so park access is initially a displayed metric and land reservation, not an automatic scoring bonus. Missing required metrics stay unknown; a disconnected park adds no access. Shared improvements may leave housing rankings unchanged. No edit changes observed household need, CHAS, rents, displacement, mapped hazards or carbon through invented causal coefficients.

The graph is initialized once in the calculation worker. Subsequent evaluations pass small scenario edits and selected-site data; stale revisions are ignored. The reference implementation and tests cover path shortening, disconnected edits, geometric crossings without junctions, unknown routes, no-op parity, reversible edits, land reservations and both real examples. Independent field/transport validation, schedules and regional multimodal routing remain future work.

Edits persist when selecting another parcel in the same study area, so subsequent housing comparisons use the same infrastructure assumptions. Switching study areas starts a new local scenario. Invalid infrastructure references or missing network data with active edits withhold proposal ranking instead of silently ignoring reservations.

## Lean data delivery and repeatable performance checks

`web/scripts/prepare-planner-data.mjs` projects the full parcel dataset onto the studio's required fields during `predev`/`prebuild`. All 8,645 parcel IDs, exact coordinates, scoring inputs and displayed evidence are retained. It reduces the uncompressed parcel download from 27,849,611 to 10,203,790 bytes (63.4%). Generated files are ignored; no additional download or dependency is needed. Its manifest records both hashes and field lists; scenario exports include that manifest. The explorer keeps the full source. Tests check every retained input and geometry plus evaluation parity for both examples with/without service edits.

The separate 2.9 MB network display geometry now loads on the first visit to Infra. The calculation graph still loads independently for routed comparisons, initializes once per worker, and is not copied on each edit. Baseline map geometry is not resent during scenario edits.

Run `npm run benchmark:planner` to measure JSON parsing, graph preparation and full evaluations reproducibly. A local run on 2026-09-27 (Node v26.8.1; AMD Ryzen 7 PRO 8840U; 20 measured runs after three warmups) found median full/compact parsing of 107/52 ms and evaluation p95 of 55 ms (Hazelwood) and 64 ms (Lawrenceville). These are CPU observations, not browser FPS or download promises; browser rendering, worker transfer, thermal state and other devices are outside this measurement. Repeat after significant model/data changes. Citywide delivery still requires tiled geometry and regional graph/data partitioning; Rust is not justified by this bounded CPU measurement alone.

## Recommendation audit (planner-screen-1.3)

Compare now includes **Why this result?**, with an exact seven-factor ledger. For each factor, it records the source, effective normalized weight, A/B baseline and proposal scores, weighted change caused by the infrastructure scenario, and contribution to the A−B score gap. Unrounded contributions reconcile exactly to the totals; displayed rounding can cause small apparent differences. Missing factors and zero priorities have explicit, distinct exclusion reasons. These results are included in the scenario export.

A deterministic sensitivity check varies one included priority at a time by −25%/+25%, renormalizes across the same shared coverage and reports changes in the selected winner, including ties. It runs only when both options pass the screening gates. These are bounded policy perturbations, not statistical confidence, input-error propagation, calibration or external validation. A stable result does not prove the model is correct.

The audit exposes outline/use/overlap gate results for both options, mapped environmental overlaps and source caveats, plus the remaining feasibility reviews. Unknown hazard evidence stays unknown. Source maps do not establish parcel-specific environmental safety, and their overlap is not converted into an invented mitigation benefit. Field verification, engineering, reviewed service/capacity inputs and independent outcome validation are still required before claiming development feasibility or predictive recommendations.
