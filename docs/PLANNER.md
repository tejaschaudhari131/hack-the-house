# Planning studio

## Two-point road and path routing (planner-screen-1.9)

In **Infra**, choose **Route between two points**, then click a start and destination along the blue roads/paths. Each click snaps within 35 m to a mapped ground-level segment, including between its original vertices. The line follows connected geometry and walking permissions. Disconnected points show an explanation, never a straight-line substitute. **Enter map coordinates** provides the same operation from the keyboard. Up to 12 routes can be saved, removed, undone and exported.

Saved routes trace existing infrastructure: they reserve no land, add no capacity and do not change housing scores. These are walking routes along mapped roads/paths, not driving or bus-navigation directions. Foot-specific direction, stairs and barriers follow the existing source rules; traffic and schedules are not simulated.

**New walking connection** and **New street + sidewalks** draw hypothetical direct links, 2–500 m long. Their endpoints now join anywhere along eligible existing segments. The graph splits those segments while retaining their original direction and proportional walking costs. Only the genuinely new link adds access and reserves space. Geometric crossings do not create extra junctions. Bridges and tunnels can be traversed when mapped as walkable, but their interiors cannot be new ground-level junctions. Park entry connectors retain their separate 50 m node-snap assumption.

Snapping and route search run in the existing worker. A spatial grid bounds snapping work; stale results are discarded when the tool, site or graph changes. The source network is immutable. Network schema 2 adds an edge-level ground flag; Studio export schema 6 retains saved routes and fractional endpoint references. Older node-based connections remain evaluable.

## Transit capacity correction (planner-screen-1.8)

New Studio scenarios use the selected stop's PRT GTFS weekday departures multiplied by **one assumed spare boarding per departure**. This deliberately small starting reserve is a scenario choice, not a measurement of occupancy. Added departures retain the editable 20 available places/departure assumption; each home assumes two new daily boardings. Scores compare this reserve with proposed housing demand, capped at 100. More scheduled service can support more homes under the same assumptions; a small plan may already score 100, so extra service need not change its rank.

Why an assumption: [GTFS schedules](https://gtfs.org/documentation/schedule/reference/) contain trips and stop times, not onboard loads. [PRT Room2Ride](https://www.rideprt.org/room2ride/) describes historical APC crowding, but its public page returned HTTP 404 during the September 27, 2026 verification. Route-wide monthly ridership cannot identify spare seats at a stop because riders board and alight along the route. No occupancy or vehicle-size estimate is fabricated from ridership totals.

Assumptions lets users edit spare places, override the daily reserve at a named stop, or choose manual-only mode and leave it blank to exclude capacity. Legacy exports retain manual-only behavior. Missing scheduled service or an unreachable stop remains unassessed. Unassessed priorities now say “Not assessed” rather than appearing as a measured zero. Homes sharing a stop share its reserve once; different stops can share vehicles, so the model cannot produce a citywide capacity total. Utilities and peak crowding remain outside this screen. Existing parcel source scores and Explorer calculations are unchanged; Studio totals can change because a previously excluded factor now participates explicitly.


## Current interface: planner-screen-1.7

Studio now applies [supported Title Nine checks](TITLE_NINE.md) before scoring. A supported zoning conflict or a failed physical fit produces no housing total. Unsupported rules are **Not assessed** and excluded from eligibility. Each type has an expandable list of checks, code links and exclusions. All proposed buildings on a lot share FAR/coverage totals; project-wide IZ counts are rechecked for each alternative.

Under **Assumptions → Advanced options**, enter exact stories and choose duplex versus attached-house form. **Additional zoning evidence** holds optional parcel-specific parking, grading, tree, landscaping and IZ inputs. Blank fields remain unknown; entered values are scenario assumptions. Undo/redo and exports retain these inputs.

A six-step **Hazelwood example** opens on the first visit to Studio. **Tour** in the header replays it. It loads the real Hazelwood Avenue parcel `0056F00338000000`, previews a single-family house, compares a duplex and triplex, applies Resident priorities, and tests 60 added weekday departures at a real nearby stop. Scores and walk/wait results come from the normal evaluator, not canned outcomes. The tour waits for parcel/network evidence and calculations; unavailable evidence shows an error with Retry and Skip.

The walkthrough uses a temporary scenario. **Skip**, Escape or **Return to my plan** restores the original parcel, scenario, undo/redo history, infrastructure view and inspector view. Demo changes do not remain in the user's plan. Each step starts from declared inputs, so Back does not accumulate edits. Dismissal is remembered in this browser; with storage blocked it still lasts for the current session.

The compact **Map key** starts closed. It opens a small popover with existing/planned colour swatches side by side, map symbols and the existing-building toggle. Click outside or press Escape to close it. Opening the key does not move the other map controls.

### Neighborhood loading and map detail

Both Studio and Explorer cover 142,865 parcels across all 90 Pittsburgh neighborhoods, with no neighborhood omitted. The header picker loads a neighborhood before selecting its example parcel. PIN links load one small prefix lookup, then that parcel's neighborhood. Address search covers loaded neighborhoods. Explorer loads parcel chunks only; Studio additionally loads recorded building context. Scenario imports can fetch the neighborhoods needed by their selected parcels.

Studio requests only the selected neighborhood and directly adjoining neighborhoods whose official polygons intersect the buffered view. Adjacency comes from the neighborhood polygons, not a growing chain of neighbors. New neighborhood downloads start after camera movement ends, with two neighborhood loads at a time; obsolete queued loads are cancelled. Cached neighborhoods can reappear during movement without waiting for another pan.

Map detail includes a 25% margin on each side of the camera bounds. Small camera movements reuse that extent; larger pans replace it, and zooming in shrinks it once it exceeds four times the camera's area. Updates are throttled to 150 ms during movement; unchanged geometry is not uploaded again. Detail starts at zoom 14 and stays until zoom drops below 13.5, avoiding repeated unloading near the cutoff. Zoom 16+ uses 3D buildings; lower detail zooms use flat footprints. At city scale, detailed parcel/building/road geometry is cleared. The cache keeps six recently used neighborhoods plus requested and active-plan evidence. Off-screen plan evidence is retained separately from rendering. Coordinates, heights and scores are unchanged. Undo waits for missing evidence before restoring the plan.

Incremental map updates remove obsolete properties explicitly. This avoids a `geojson-vt` update path that discarded replacement properties, including building heights, when overlapping chunks supplied a new copy of an existing feature. A regression test exercises the installed tiler as well as the map's update logic.

The offline build partitions the walking graph into nine overlapping routing regions, buffered about 4 km beyond their assigned neighborhoods. Selecting a neighborhood loads its region; a route may leave the visible map or neighborhood. Missing routes remain unknown, and routes leaving the regional extract may be unavailable. Lawrenceville's three neighborhoods share a region and planning area. Other neighborhoods start a new local plan when selected; undo can return to the previous plan.

`web/scripts/prepare-studio-data.mjs` derives hashed files during `predev` and `prebuild` from committed gzip sources. Each neighborhood retains all original parcel fields; larger neighborhoods split into parts targeting 12 MiB. Building context includes unlinked and boundary-crossing footprints and is deduplicated in the browser. Hashed chunks use immutable cache headers. The manifest has counts, extents and filenames, with no citywide address list. Explanation requests read compressed source neighborhoods on demand, with a four-neighborhood server cache.

Run `npm run benchmark:studio` after building for reproducible payload and local CPU measurements. See [Validation](VALIDATION.md) for measured sizes and source parity. These are file/CPU measurements, not mobile frame-rate or 30-user load guarantees. Both maps restrict navigation to Pittsburgh's boundary extent, not an exact polygon mask.

Studio requests native WebGL antialiasing to smooth 3D building edges, following [MapLibre's building example](https://maplibre.org/maplibre-gl-js/docs/examples/display-buildings-in-3d/). It does not increase pixel ratio, simplify outlines or alter heights. The browser selects the available sample count; it may decline antialiasing on some devices. The opt-in rendering benchmark and measured desktop results are documented in [Validation](VALIDATION.md#antialiasing-trial--september-27-2026).

Tests cover neighborhood assignment, indexed source parity, complete city parcel round trips, hash verification, graph indices, failed/aborted requests, PIN lookup, viewport/cache behavior and original study regressions.

Studio has one editable next-building draft, with no A/B controls. Cycle its housing type on the map or in Edit. In Rankings, **Compare to** adds any of the other four templates; **All types** compares all five, including triplex. **Expand comparison** opens the table at full width; **Back to map** returns to the same scene.

Drag the sidebar's left divider to resize it, or focus the divider and use Left/Right arrows (Shift for larger steps). Enter or double-click restores the default width. **Hide sidebar** gives the map the full workspace; **Show sidebar** restores the panel and its width without clearing the scenario. On narrow screens the panel stacks below the map and can still be hidden.

The housing draft appears automatically as a translucent preview, including when its outline does not fit or overlaps an existing building. Green means no supported conflict was found; the label discloses excluded checks. Red means a supported zoning conflict or failed/unavailable physical fit; grey means checks are updating. The preview keeps the proposed dimensions and does not add a building or remove existing buildings. **Add building to plan** saves a draft with a clear footprint and no supported zoning conflict; **Place manually** rechecks the clicked position. This supersedes the hidden-invalid-preview behavior described in older sections below.

The current draft keeps its exact dimensions, height and placement. Other columns use standard templates. Every column uses the same rent, utilities, target income and priorities. Only selected types determine common evidence coverage across baseline/proposal. Missing evidence, zero weights and failed placement/use screens remain explicit. Multi-building totals still include the placed plan plus each next-building alternative. Selecting a compared type swaps it into the draft and retains the previous type as a standard comparison.

Exports use schema 5 with `draft`, `comparisonTypes`, parcel-keyed `zoningInputsByPin` and `projectInputs`, rather than `options.A/B`. The evaluator retains legacy A/B support for existing model fixtures; new Studio scenarios and exports do not contain hidden alternatives. Source parcel data and the seven factor calculations are unchanged. “Market fit” is a shorter display label; its existing market-activity/lot-fit formula is unchanged.

Priorities are relative weights, normalized over the factors with shared evidence. Multiplying every weight by the same positive number leaves scores and rankings unchanged. Sliders show their effective percentage of the score and allow increments of 1. **Equal priorities** gives each available factor equal influence; **All off** disables ranking. Missing evidence and zero weights are excluded explicitly. Preset matching uses relative proportions, too.

The sections below also document earlier model releases and their A/B interface. This current-interface section supersedes those controls and export details.

The default route is now a browser-based 3D housing and transit scenario studio. The original parcel inspector, Find Sites, drop comparison, reports and AI explanations remain at `/explore`. Existing `?pin=` links select a parcel in either interface.

Housing opens at the original 55° pitch and −25° bearing. Entering Infra or Transit switches to a north-up top-down camera; returning to Housing restores the original angled view. Compare preserves the current view and the 2D/3D control remains available. Parcel selection and view changes apply centre, pitch and bearing in a single transition, centred on the selected site; rapid changes and direct parcel links cannot cancel just the angle or centre. Camera switches leave the road graph and scenario edits intact.

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
3. Change dimensions or proposed rent. Geometric placement never silently shrinks the building. A failed fit, recorded-building overlap, missing building context or non-permitted use cannot win the screen.
4. Open Transit and add 60 departures per weekday at the selected existing stop. The baseline and proposal share the selected stop and service-span assumption. Inspect before/after aggregate walk + wait.
5. Open Compare. Inspect all seven factors and their priority weights. A common access benefit can leave the housing order unchanged.
6. Optionally enter hypothetical spare daily boarding capacity under Capacity assumptions. Unknown reserve stays null, not zero. Utility capacity is not supplied by this field.
7. Undo/redo, switch baseline/proposal, or export the versioned scenario and computed results as JSON.

## Model boundary: planner-screen-1.4

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

Massing dimensions and heights are **proposal assumptions**. County building footprints provide existing context. Their display heights use recorded stories, matched OSM height/level tags, or labelled building-type estimates; LiDAR has not been ingested. Building units remain the selected template's count even when dimensions change; a larger volume does not automatically imply more feasible homes.

## Code and growth path

- `Planner.js`: loading, accessible controls, two examples, source/assumption display, worker lifecycle, revision checks, export.
- `PlannerMap.js`: one MapLibre instance; slim parcel geometry and independent small proposal/service sources. Scoring edits do not resend parcel scores to the renderer.
- `plannerState.js`: immutable scenario/history snapshots and model version.
- `plannerGeometry.js`: parcel-edge alignment and exact manual placement, with polygon/hole containment and recorded-building overlap checks. No exact maximum-capacity guarantee.
- `plannerModel.js`: pure baseline/proposal evaluator, shared evidence coverage and deterministic explanations.
- `planner.worker.js`: asynchronous evaluator; stale revisions are discarded by the client. A JavaScript fallback retains controls if worker creation is unavailable.

Both the studio and explorer retain the complete committed parcel GeoJSON. This release does not claim citywide performance. The map uses only geometry and a few attributes, and calculations transfer only the selected parcel/stop/scenario. Future geometry tiling, indexed detail loading, network analysis, and a Rust/WASM computation kernel can be added without putting simulation logic into map components.

The original AI endpoint reconstructs baseline facts. The new studio deliberately uses deterministic scenario explanations instead of sending modified proposals to a baseline-only endpoint.

## Verification

`npm test` includes planner tests for both real examples, no-op equality, shared transit gains, unchanged carbon/displacement, unknown capacity, unserved stops, all-zero weights, geometry/permission gates, history replay, holes/concave shapes and versioned exports. `npm run build` checks both routes and worker bundling. Browser verification must also confirm vector/extrusion rendering; a basemap alone does not prove MapLibre's worker loaded.

Before expanding analytical claims: ingest/validate building dimensions, audit the pedestrian graph and add actual destinations, obtain reviewed capacity inputs, and validate scenario-specific emissions and costs. Keep those unknowns visible until supported.

## Existing building context

Run `python pipeline/build_context.py` with `pipeline/requirements.txt` installed. The script reads all city neighborhood bounding boxes from the County/PASDA building layer, verifies every requested source ID was returned, deduplicates, repairs polygonal geometry where possible, and retains complete footprints intersecting the neighborhood boundaries. It excludes outlines explicitly marked `demolished` by the source from both rendering and proposal collision checks; the omitted IDs are recorded in the manifest. It requests WGS84 coordinates (`outSR=4326`); the source is NAD83. No manual pixel alignment or parcel-wide extrusion is used.

The assessment query selects only parcel IDs and `STORIES`. Parcel matching requires at least 80% footprint coverage, using the source PIN first and then a unique spatial match if necessary. A recorded story count requires one assessment row and either a sole footprint or a dominant main footprint (at least 1.8 times the next largest footprint and 60% of the parcel's total building area). Smaller auxiliary footprints do not inherit the main building's stories. Spatially recovered parcels use assessment records already present in the bounded extract; absent records remain unknown.

Height selection follows this order:

1. A spatially matched OpenStreetMap `height` tag, interpreted in metres or explicit feet. This already includes the roof, so no roof allowance is added.
2. County assessment `STORIES × 3 m + 1.5 m` on an unambiguous main footprint.
3. Matched OSM `building:levels × 3 m`, plus `roof:height`, `roof:levels × 3 m`, or an assumed 0.6 m flat / 1.5 m unspecified roof allowance.
4. An explicitly **inferred** building-type height. Residential buildings use the study-area median of usable residential source heights (currently 7.5 m); small auxiliary footprints use 3.5 m. Illustrative priors are 10.5 / 13.5 / 16.5 m for small / medium / large apartment properties, 10.5 m for mixed-use/commercial, 7.5 m for warehouses and 8 m for industrial buildings. Apartment bands describe whole properties, **not observed floor counts**; those priors require minimum footprint areas of 100 / 150 / 200 m². Auxiliary classification requires a residential parcel, a dominant main building, at most 80 m², and at most 35% of the main footprint's area; residential-auxiliary land use also supports the auxiliary prior.
5. A 9 m placeholder when neither records nor a useful building-type classification are available.

OSM data comes from eight bounded public map API tiles, cached for repeatable offline processing. Matching requires at least 65% County-footprint coverage and 50% OSM-footprint coverage; building parts require 80% County coverage. Ambiguous competing matches with materially different heights, incomplete polygons, and suspended parts are rejected. These thresholds, floor-to-metre conversions and typology priors are assumptions. The source references, query bounds, input hashes and retrieval dates are retained; tiles are not a synchronized historical snapshot. OSM attributes are © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).

The result supports **approximate relative massing**, not verified height ordering, terrain-relative roof elevations, roof shapes, or survey accuracy. Arsenal's large apartment footprints now use a labelled 16.5 m prior instead of the former blanket 9 m fallback; this is not a measured Arsenal height. Source dates and coverage vary. A building click exposes the method and links mapped OSM records where used; the evidence panel separates source-based and inferred coverage. Display heights never enter recommendation scores or collision tests. No unit counts or occupancy are inferred. Nonresidential buildings are included.

`existing-buildings.sources.json` records source URLs, coordinate systems, input hashes/retrieval times, output hash and counts. Raw responses are cached in ignored `pipeline/data/raw/building_context`; remove that directory to refresh. The source layer does not declare explicit redistribution terms; resolve these before external publication. Layer/catalog dates do not guarantee that every structure is current.

The layer loads in neighborhood chunks and can be hidden. Each footprint carries display-neighborhood membership, so broad collision-context chunks cannot make distant buildings appear. Culling retains whole, unsimplified footprints and original heights; full collision evidence remains available even when not rendered. Geometry is uploaded only when the visible feature set changes, not on housing/service edits. It appears from zoom 14. This display policy does not change baseline scores or silently remove structures under proposals.

## Proposal placement

Automatic placement tries the parcel's longest edge first, aligning the longer building dimension with it, then other parcel-edge/perpendicular orientations and sampled centres. It retains the requested dimensions and prefers placements without recorded-building overlap. This is **parcel alignment, not inferred street frontage**. A failed search is not proof no feasible design exists.

Each housing option can store a manual placement: east/north metre offsets from the parcel bounding-box centre and a bearing for the building depth axis, clockwise from north. Users can rotate, enter offsets, or click **Place on map** and choose a centre. Manual placements are never moved or resized automatically. Boundary contact, holes and building overlap remain visible review failures. **Reset alignment** returns that option to the automatic search. Undo/redo and JSON exports retain placement; exports also identify the building-context dataset hash.

Only nearby building geometries intersecting the selected parcel's bounding box are passed to the calculation worker. A hidden context layer still participates in overlap checks. If the data cannot load, unknown overlap evidence is not treated as an empty site: ranking is withheld. A mapped overlap requires review of redevelopment/demolition; there is no removal tool or assumption that demolition is permitted. No overlap is not proof of vacancy.

The citywide footprint count, height-method counts and source hashes are recorded in `existing-buildings.sources.json`. Height enrichment runs offline; the browser receives only local context. Counts describe recorded outlines, not verified dwellings. The original study extract is retained only as a regression fixture.

## Connected walking, connections and parks (planner-screen-1.2)

The studio now uses the same OSM walking graph for both baseline and proposal. The older straight-line evaluator remains only as a compatibility path for explicit non-network callers. The UI never substitutes straight-line travel when routing fails. Initial ground-node connectors from the parcel centre and selected stop may each be up to 100 m; they are assumed access links, not verified entrances or safe crossings. Graph links use shared OSM node IDs, walking permissions, conservatively excluded barriers and foot-specific one-way tags. Stairs use an assumed 40 m/min; other walking links use 80 m/min. Slopes, wheelchair suitability, crossing safety and time-dependent access are not calibrated.

`pipeline/build_network.py` reproducibly prepares nine buffered source-query tiles around the city. `walking-network.sources.json` retains query, snapshot, hashes, license, coverage and assumptions. The graph has 371,689 nodes, 845,872 directed edges and 311 closed-way parks with mapped walking access; 94 other candidate park ways lack valid polygons or access. Relation-only parks are omitted. OSM park geometry is a mapped inventory, not confirmation of current opening or public entrance access. Graph and displayed network are © OpenStreetMap contributors, ODbL 1.0; see https://www.openstreetmap.org/copyright.

The **Infra** tool supports hypothetical pedestrian paths (3 m width), streets with sidewalks (12 m width; walking effects only), and 20 × 20 m park zones. Connections snap within 35 m to existing ground-level segments, have two endpoint junctions and must be 2–500 m long. Crossings create no intermediate junctions. Parks use an assumed connector to a node within 50 m. Existing-building intersections are rejected by the editor; river crossings, ownership, grades, road safety, engineering and cost remain unverified. These are scenario assumptions, not approved projects. Up to 12 connections and 12 parks are supported per local scenario. Cancel leaves no edit; remove/undo/redo recalculate outputs.

Infrastructure corridors and park zones reserve land in the **proposal** only, and participate in housing containment/overlap checks without modifying official parcels. Both housing alternatives retain their requested dimensions. The network calculates routed walking to the selected scheduled stop and the nearest mapped/proposed park. The selected stop still has an aggregate frequency assumption, not a timetable, route or transfer model. Adding a park does not add bus service.

Access combines transit preference `clamp(100 × (1 − (walk + wait)/30))` and park preference `clamp(100 × (1 − park walk/15))` with the user's **park share of access priority**. The default share is 0%, so park access is initially a displayed metric and land reservation, not an automatic scoring bonus. Missing required metrics stay unknown; a disconnected park adds no access. Shared improvements may leave housing rankings unchanged. No edit changes observed household need, CHAS, rents, displacement, mapped hazards or carbon through invented causal coefficients.

The graph is initialized once in the calculation worker. Subsequent evaluations pass small scenario edits and selected-site data; stale revisions are ignored. The reference implementation and tests cover path shortening, disconnected edits, geometric crossings without junctions, unknown routes, no-op parity, reversible edits, land reservations and both real examples. Independent field/transport validation, schedules and regional multimodal routing remain future work.

Edits persist when selecting another parcel in the same study area, so subsequent housing comparisons use the same infrastructure assumptions. Switching study areas starts a new local scenario. Invalid infrastructure references or missing network data with active edits withhold proposal ranking instead of silently ignoring reservations.

## Performance checks and deferred data delivery work

Priority-only edits reuse the last complete physical, legal and network evaluation. Totals, rankings, shared evidence denominators, tradeoffs, placed-plan scores and sensitivity results are recomputed with the new weights. Any other scenario edit or changed evidence triggers a full evaluation. The worker keeps one evidence context, so slider messages do not repeatedly copy parcel, zoning and building geometry. `benchmark:planner` compares this path against full Studio evaluations; parity tests cover zeros, missing evidence, blocked options, placed plans and the real study examples.

Display indexes are prepared per loaded neighborhood and reused across changing viewport combinations. Cache bookkeeping alone does not republish unchanged geometry. Indexes use weak references to their source chunks so eviction can release them, while required planning evidence stays pinned. Reopening Infra reuses its road index and neighborhood membership checks; a new graph or boundary dataset creates a new index.

Parcel, building, road and discovery layers use stable-ID GeoJSON patches. A camera move sends only entering, leaving or changed features; unchanged coordinates and heights are retained. Overview zoom clears detail, and zooming in adds the original features again. Selected-site and scenario overlays remain separate from the baseline sources.

The browser now downloads full-evidence neighborhood chunks, not the old combined study file. No parcel properties were discarded to make the chunks smaller. The old study file survives in `web/testdata/study` for regression tests and is not served to users.

Infra derives its display segments from the already loaded calculation graph, avoiding a separate roads download. A spatial index selects whole original segments touching the visible neighborhood scope and viewport. Display culling does not remove edges from the routing calculation, so routes may leave the view and return. The calculation graph initializes once per worker and is not copied on each edit. Baseline map geometry is not resent during scenario edits. Parcel search metadata is updated only when neighborhood chunks change, rather than rebuilt during pointer movement.

Run `npm run benchmark:planner` to measure JSON parsing, graph preparation and full evaluations. The output identifies CPU/runtime and reports 20 measured runs after three warmups. These are CPU observations, not browser FPS or download promises; browser rendering, worker transfer, thermal state and other devices are outside this measurement. Repeat after significant model/data changes. Citywide delivery now uses neighborhood geometry chunks and buffered regional graphs.

## Recommendation audit (planner-screen-1.3)

Compare now includes **Why this result?**, with an exact seven-factor ledger. For each factor, it records the source, effective normalized weight, A/B baseline and proposal scores, weighted change caused by the infrastructure scenario, and contribution to the A−B score gap. Unrounded contributions reconcile exactly to the totals; displayed rounding can cause small apparent differences. Missing factors and zero priorities have explicit, distinct exclusion reasons. These results are included in the scenario export.

A deterministic sensitivity check varies one included priority at a time by −25%/+25%, renormalizes across the same shared coverage and reports changes in the selected winner, including ties. It runs only when both options pass the screening gates. These are bounded policy perturbations, not statistical confidence, input-error propagation, calibration or external validation. A stable result does not prove the model is correct.

The audit exposes outline/use/overlap gate results for both options, mapped environmental overlaps and source caveats, plus the remaining feasibility reviews. Unknown hazard evidence stays unknown. Source maps do not establish parcel-specific environmental safety, and their overlap is not converted into an invented mitigation benefit. Field verification, engineering, reviewed service/capacity inputs and independent outcome validation are still required before claiming development feasibility or predictive recommendations.

## Five-template housing shortlist (planner-screen-1.4)

The **Housing shortlist** above the editing controls screens single-family, townhouse/duplex, triplex, 12-home apartment and 40-home apartment templates after every scenario edit. It is collapsible and opens when entering Compare. Each entry shows baseline/proposal scores, fixed dimensions, eligibility checks, and all seven factor values with weighted infrastructure deltas. The panel also exposes sources, effective weights and excluded evidence. Unranked templates remain inspectable. Ties within 0.1 points of the leading unrounded score remain joint leaders; they are not confidence intervals.

All templates use the **active A/B slot's rent and utility assumptions per home**, the shared target income, the standard template dimensions, and automatic parcel alignment. These assumptions are shown explicitly. Custom A/B dimensions/placement are not substituted for the templates, and rents are not invented for each housing type. **Preview in A/B** loads the exact screened template into that slot, resets its dimensions/height/placement to that template, and retains the other slot and infrastructure scenario. Undo restores the prior custom option. Unit counts remain declared template assumptions, not calculated building capacity.

The shortlist reuses the same option evaluator, footprint/overlap checks and use-permission gate as A/B. It uses one common set of factors available in **every template and both infrastructure states**, with the same priority weights renormalized across that set. Its evidence coverage can therefore differ from the two-option panel; totals should only be compared within the same panel. Missing building context, failed fit, mapped overlap, unknown/non-permitted use or invalid infrastructure cannot become a ranked recommendation. No usable positive weight produces no ranking. An unsuccessful placement search does not prove no design could fit.

Network access is calculated once per infrastructure state and shared by A/B and the five templates inside the calculation worker. Added service can leave all type rankings unchanged; explicit capacity assumptions or infrastructure land reservations can change scores or eligibility. Household demand, rent forecasts, displacement and carbon are not given new causal relationships. Existing A/B score formulas are unchanged. Exports include the shortlist, source slot, assumptions, common coverage, eligibility results and per-factor deltas under model version 1.4.

Validation covers both real examples, no-op equality, shared transit gains without forced rank changes, a synthetic capacity-driven change of leader, park reservations, invalid infrastructure, missing evidence/zoning/building context, zero weights, ties, exact preview parity and undo/export. The local Node benchmark (Ryzen 7 PRO 8840U, Node 26.8.1, 20 measured runs) reported evaluation p50/p95 of approximately 50/60 ms for Hazelwood and 60/66 ms for Lawrenceville including all five templates. This excludes download, worker transfer and browser rendering. No new dependencies or parcel-data changes are required.

## Recorded building-use colours

Studio colours existing footprints from the matched parcel assessment use, never from housing recommendations or inferred heights. Four housing bands share the Explorer palette; mixed/other residential and commercial/other nonresidential uses have separate colours. Unknown or contradictory vacant-use records stay neutral. Auxiliary footprints are not labelled as standalone homes. These are parcel-use classifications, not independently verified footprint occupancy. Explorer is unchanged.

Placed proposals use a pastel version of their housing colour (45% white tint) with a white dashed footprint outline; conflicting placements retain the red outline. **Map key** shows the four planned-home tints beside the existing colours. Existing buildings, placement preview colours and comparison accents keep their original palette. This is a display change only, with no extra map layers or geometry.

## Area plans (planner-screen-1.5)

Up to 40 fixed housing placements can be added across parcels in one study area. Map placement previews are green/red for the outline, overlap and use screen; committed proposals use a lighter shade of their housing band. Plans persist across parcel selection, with undo/redo, removal and JSON export. Changing study areas starts a new plan and can be undone. Existing buildings are retained; demolition is not assumed.

After placement, A/B and the five-template shortlist compare the whole placed plan plus each next-building alternative. Factor scores are averages weighted by declared proposed homes (a normative aggregation choice), with common evidence coverage across candidates and infrastructure states. Transit reserve is shared once across proposed homes using the same stop, rather than granted to every building separately. Service increases and optional capacity assumptions remain attached to named stops. Unknown capacity stays unknown. All buildings must pass the geometry/use screen for an area alternative to rank; infrastructure can invalidate earlier placements. Existing residents are not added to modeled boarding demand; the spare-capacity input must already allow for existing users. No neighborhood demand, price, displacement or carbon causal forecast is introduced.

## Unified Studio interface

**Highlight empty sites** marks conservative candidates in amber: affirmative vacancy records, no contradictory recorded use or mapped building overlap, known positive lot area, and at least one standard template with a by-right residential use, physical fit and no supported Title Nine conflict. Recorded public open space is excluded. Unknown/special-use permission is not treated as a pass. Missing building context produces no highlight. Other unsupported checks remain unassessed; a highlight does not establish availability, utility capacity or development approval. An unhighlighted site may support other designs or redevelopment.

This discovery layer uses existing conditions and standard templates, independent of priorities and infrastructure edits. Clicking a highlight previews the first fitting template (not the highest-scoring type); selecting it runs the full current-plan evaluation. Parcels with a placed building leave the highlight. The original evidence and scoring are unchanged. Screening runs once during data preparation using full parcel and footprint geometry. Each neighborhood has a small hashed candidate list; the browser only looks up candidates in the visible area, hides them below detail zoom, and releases its index when the source chunk is evicted. Explorer does not request these files. No browser screening worker is needed.

Studio now includes a Sites tool with record/use filters and map highlights; selecting a result continues on the same map. `/explore`, its source components, original scoring model and parcel download remain unchanged for reference. Existing-use colours do not encode recommendations.

Rankings show all seven suitability scores (higher is preferred), evidence kinds, exclusions, eligibility and short exact weighted advantages/disadvantages against the best other eligible template. Tied options retain their tie; no advantage is fabricated. Priorities provides seven visible sliders and explicit team-authored stakeholder presets. These preset weights are normative choices, not measured stakeholder preferences.

The Assumptions tab retains **Advanced options · exact values**: width, depth, height, bearing/offsets, household income, rent, utilities, service span and optional boarding-capacity inputs. Numeric edits commit on Enter/blur and retain entered fractional values. They edit the current draft; previously placed buildings retain their saved inputs. The full comparison audit, source provenance and limitations remain available behind disclosures. Height/dimension edits do not infer a new unit count.

A separate current-plan score excludes the next-building draft. The shortlist and custom A/B compare the plan **plus** that next building; these are different alternatives, not interchangeable scores. Current-plan scores use their own common baseline/proposal evidence coverage. Plans are local in-memory scenarios with JSON export, not saved accounts or citywide forecasts.

Verification: 18 JavaScript test files and the production build; browser checks of stakeholder presets, site filters, three placements across two real Lawrenceville parcels, green/red placement screening, and exact fractional dimensions/income/rent/utilities. No new dependencies.

Coverage note: the 142,865 mapped records include 142,571 identified parcels and 294 county polygons without a unique PIN. Those polygons have stable `SITE…` map IDs, retain the source label, and disclose that assessment and parcel-ID-based property flags are unknown. No neighborhood is omitted.
