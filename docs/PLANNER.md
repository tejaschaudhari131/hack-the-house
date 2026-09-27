# Planning studio

## Current interface: planner-screen-1.6

Studio has one editable next-building draft, with no A/B controls. Cycle its housing type on the map or in Edit. In Rankings, **Compare to** adds any of the other four templates; **All types** compares all five, including triplex. **Expand comparison** opens the table at full width; **Back to map** returns to the same scene.

The current draft keeps its exact dimensions, height and placement. Other columns use standard templates. Every column uses the same rent, utilities, target income and priorities. Only selected types determine common evidence coverage across baseline/proposal. Missing evidence, zero weights and failed placement/use screens remain explicit. Multi-building totals still include the placed plan plus each next-building alternative. Selecting a compared type swaps it into the draft and retains the previous type as a standard comparison.

Exports use schema 4 with `draft` and `comparisonTypes`, rather than `options.A/B`. The evaluator retains legacy A/B support for existing model fixtures; new Studio scenarios and exports do not contain hidden alternatives. Source parcel data and the seven factor calculations are unchanged. “Market fit” is a shorter display label; its existing market-activity/lot-fit formula is unchanged.

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

Run `python pipeline/build_context.py` with `pipeline/requirements.txt` installed. The script reads only the two study-area bounding boxes from the County/PASDA building layer, verifies every requested source ID was returned, deduplicates, repairs polygonal geometry where possible, and retains complete footprints intersecting the neighborhood boundaries. It excludes outlines explicitly marked `demolished` by the source from both rendering and proposal collision checks; the omitted IDs are recorded in the manifest. It requests WGS84 coordinates (`outSR=4326`); the source is NAD83. No manual pixel alignment or parcel-wide extrusion is used.

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

The layer loads separately from the planner and can be hidden or retried if unavailable. Its geometry is uploaded once per load, not on housing/service edits. It appears from zoom 14; citywide expansion should tile this geometry rather than extend the whole-file download. It does not change baseline scores or silently remove structures under proposals.

## Proposal placement

Automatic placement tries the parcel's longest edge first, aligning the longer building dimension with it, then other parcel-edge/perpendicular orientations and sampled centres. It retains the requested dimensions and prefers placements without recorded-building overlap. This is **parcel alignment, not inferred street frontage**. A failed search is not proof no feasible design exists.

Each housing option can store a manual placement: east/north metre offsets from the parcel bounding-box centre and a bearing for the building depth axis, clockwise from north. Users can rotate, enter offsets, or click **Place on map** and choose a centre. Manual placements are never moved or resized automatically. Boundary contact, holes and building overlap remain visible review failures. **Reset alignment** returns that option to the automatic search. Undo/redo and JSON exports retain placement; exports also identify the building-context dataset hash.

Only nearby building geometries intersecting the selected parcel's bounding box are passed to the calculation worker. A hidden context layer still participates in overlap checks. If the data cannot load, unknown overlap evidence is not treated as an empty site: ranking is withheld. A mapped overlap requires review of redevelopment/demolition; there is no removal tool or assumption that demolition is permitted. No overlap is not proof of vacancy.

The extract currently contains 6,436 footprints: 2,250 in Hazelwood and 4,186 in Lawrenceville, after excluding 188 source-marked demolished outlines. Heights comprise 2,641 assessment-story estimates, 112 OSM height tags, 41 OSM level estimates, 3,546 building-type estimates and 96 placeholders. The uncompressed building payload is approximately 3.9 MB for both examples. Height enrichment runs offline; the browser still renders a single extrusion layer with one numeric height per footprint. These are extract counts, not verified dwelling counts or a performance guarantee. The full parcel download is unchanged.

## Connected walking, connections and parks (planner-screen-1.2)

The studio now uses the same OSM walking graph for both baseline and proposal. The older straight-line evaluator remains only as a compatibility path for explicit non-network callers. The UI never substitutes straight-line travel when routing fails. Initial ground-node connectors from the parcel centre and selected stop may each be up to 100 m; they are assumed access links, not verified entrances or safe crossings. Graph links use shared OSM node IDs, walking permissions, conservatively excluded barriers and foot-specific one-way tags. Stairs use an assumed 40 m/min; other walking links use 80 m/min. Slopes, wheelchair suitability, crossing safety and time-dependent access are not calibrated.

`pipeline/build_network.py` reproducibly prepares a buffered extract around the two study areas. `walking-network.sources.json` retains query, snapshot, hashes, license, coverage and assumptions. The graph has 53,089 nodes, 127,136 directed edges and 42 closed-way parks with mapped walking access; 17 other candidate park ways lack valid polygons or access. Relation-only parks are omitted. OSM park geometry is a mapped inventory, not confirmation of current opening or public entrance access. Graph and displayed network are © OpenStreetMap contributors, ODbL 1.0; see https://www.openstreetmap.org/copyright.

The **Infra** tool supports hypothetical pedestrian paths (3 m width), streets with sidewalks (12 m width; walking effects only), and 20 × 20 m park zones. Connections snap within 35 m to existing ground nodes, have two endpoint junctions and must be 2–500 m long. Crossings create no intermediate junctions. Parks use an assumed connector to a node within 50 m. Existing-building intersections are rejected by the editor; river crossings, ownership, grades, road safety, engineering and cost remain unverified. These are scenario assumptions, not approved projects. Up to 12 connections and 12 parks are supported per local scenario. Cancel leaves no edit; remove/undo/redo recalculate outputs.

Infrastructure corridors and park zones reserve land in the **proposal** only, and participate in housing containment/overlap checks without modifying official parcels. Both housing alternatives retain their requested dimensions. The network calculates routed walking to the selected scheduled stop and the nearest mapped/proposed park. The selected stop still has an aggregate frequency assumption, not a timetable, route or transfer model. Adding a park does not add bus service.

Access combines transit preference `clamp(100 × (1 − (walk + wait)/30))` and park preference `clamp(100 × (1 − park walk/15))` with the user's **park share of access priority**. The default share is 0%, so park access is initially a displayed metric and land reservation, not an automatic scoring bonus. Missing required metrics stay unknown; a disconnected park adds no access. Shared improvements may leave housing rankings unchanged. No edit changes observed household need, CHAS, rents, displacement, mapped hazards or carbon through invented causal coefficients.

The graph is initialized once in the calculation worker. Subsequent evaluations pass small scenario edits and selected-site data; stale revisions are ignored. The reference implementation and tests cover path shortening, disconnected edits, geometric crossings without junctions, unknown routes, no-op parity, reversible edits, land reservations and both real examples. Independent field/transport validation, schedules and regional multimodal routing remain future work.

Edits persist when selecting another parcel in the same study area, so subsequent housing comparisons use the same infrastructure assumptions. Switching study areas starts a new local scenario. Invalid infrastructure references or missing network data with active edits withhold proposal ranking instead of silently ignoring reservations.

## Performance checks and deferred data delivery work

The planner retains the complete 27,849,611-byte parcel download with all 8,645 parcels, as requested. A compact property view is deferred for a future recommendation-layer review, when its retained evidence can be agreed and checked for score/geometry parity. No generated compact dataset is used or required.

The separate 2.9 MB network display geometry loads on the first visit to Infra. The calculation graph loads independently for routed comparisons, initializes once per worker, and is not copied on each edit. Baseline map geometry is not resent during scenario edits.

Run `npm run benchmark:planner` to measure JSON parsing, graph preparation and full evaluations. The output identifies CPU/runtime and reports 20 measured runs after three warmups. These are CPU observations, not browser FPS or download promises; browser rendering, worker transfer, thermal state and other devices are outside this measurement. Repeat after significant model/data changes. Citywide delivery would require tiled geometry and regional graph/data partitioning.

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

## Area plans (planner-screen-1.5)

Up to 40 fixed housing placements can be added across parcels in one study area. Map placement previews are green/red for the outline, overlap and use screen; committed proposals use a lighter shade of their housing band. Plans persist across parcel selection, with undo/redo, removal and JSON export. Changing study areas starts a new plan and can be undone. Existing buildings are retained; demolition is not assumed.

After placement, A/B and the five-template shortlist compare the whole placed plan plus each next-building alternative. Factor scores are averages weighted by declared proposed homes (a normative aggregation choice), with common evidence coverage across candidates and infrastructure states. Transit reserve is shared once across proposed homes using the same stop, rather than granted to every building separately. Service increases and optional capacity assumptions remain attached to named stops. Unknown capacity stays unknown. All buildings must pass the geometry/use screen for an area alternative to rank; infrastructure can invalidate earlier placements. Existing residents are not added to modeled boarding demand; the spare-capacity input must already allow for existing users. No neighborhood demand, price, displacement or carbon causal forecast is introduced.

## Unified Studio interface

Studio now includes a Sites tool with record/use filters and map highlights; selecting a result continues on the same map. `/explore`, its source components, original scoring model and parcel download remain unchanged for reference. Existing-use colours do not encode recommendations.

Rankings show all seven suitability scores (higher is preferred), evidence kinds, exclusions, eligibility and short exact weighted advantages/disadvantages against the best other eligible template. Tied options retain their tie; no advantage is fabricated. Priorities provides seven visible sliders and explicit team-authored stakeholder presets. These preset weights are normative choices, not measured stakeholder preferences.

The Assumptions tab retains **Advanced options · exact values**: width, depth, height, bearing/offsets, household income, rent, utilities, service span and optional boarding-capacity inputs. Numeric edits commit on Enter/blur and retain entered fractional values. They edit the current draft; previously placed buildings retain their saved inputs. The full comparison audit, source provenance and limitations remain available behind disclosures. Height/dimension edits do not infer a new unit count.

A separate current-plan score excludes the next-building draft. The shortlist and custom A/B compare the plan **plus** that next building; these are different alternatives, not interchangeable scores. Current-plan scores use their own common baseline/proposal evidence coverage. Plans are local in-memory scenarios with JSON export, not saved accounts or citywide forecasts.

Verification: 18 JavaScript test files and the production build; browser checks of stakeholder presets, site filters, three placements across two real Lawrenceville parcels, green/red placement screening, and exact fractional dimensions/income/rent/utilities. No new dependencies.
