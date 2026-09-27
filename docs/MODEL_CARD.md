# Model card: Hack the House suitability screen

Version: score model v1 (`web/public/data/score_model.json`), data pulled 2026-09-26/27, prompt version in `web/lib/explainPrompt.js`. Code: https://github.com/tejaschaudhari131/hack-the-house.

## What it is

A transparent weighted-average screen that ranks four housing types (single-family; townhouse/duplex; small apartment, 3–19 units; large apartment, 20+ units) on each of 8,645 parcels in Hazelwood and Lower, Central, and Upper Lawrenceville, Pittsburgh, plus a triplex (3-unit) building that uses the small-apartment score and the §911.02 Three-Unit permission row. It is arithmetic on published data with team-chosen anchors and weights. There is no trained model. A language model, when a credential is configured, only writes a prose explanation of numbers the app has already computed.

**Intended use:** help CDC staff and municipal planners choose which real parcel and housing option to investigate next, see why options rank differently, and list what must be verified. **Not for:** permits, zoning determinations, feasibility or financial decisions, appraisal, affordability commitments, predicting displacement, or ranking people.

## Factors (`web/lib/factors.js`, one definition used everywhere)

| Factor | Direction on 0–100 | Geography | What goes in | Main assumptions |
| --- | --- | --- | --- | --- |
| Market activity & lot fit (`demand`) | higher is better | Neighborhood sales + this lot | Median valid sale price per sq ft, valid sales per 100 parcels (assessment file, valid sales since 2021-09-26), lot area | $80–$350/sq ft and 5–30 per 100 anchors; 50/50 blend with an assumed lot-fit curve by type. Not demand for a type, absorption, or viability. |
| Transit access (`transit`) | higher is better | Place (same for every type) | Weekday scheduled trips within 400 m, distance to nearest stop (PRT GTFS, 2026-09-25) | 800 m walk anchor, 250-trip cap, 55/45 frequency/proximity blend. Scheduled service, not reliability. |
| Equity (`equity`) | higher is better | Block group / tract, then type rule | Income vs county median (ACS 2020–2024), ACS rent burden, CHAS 2018–2022 low-income renter cost burden | Need averaged over available measures; team-chosen production and displacement-exposure multipliers by type (assumptions, not measured effects). |
| Climate hazard (`climate_risk`) | higher is worse | Parcel overlap | FEMA NFHL flood zones, 25%+ slopes (landslide-risk proxy), undermined areas | 50/30/20 blend, SFHA floor of 70, small type multiplier. A map screen, not a survey. |
| Displacement risk (`displacement_risk`) | higher is worse | Tract (same for every type) | Renter share (ACS B25003 2020–2024), CHAS cost burden, tract rent growth minus county (B25064 2015–2019 vs 2020–2024) | Anchors; 50/50 vulnerability/pressure. A screening signal, not a prediction. Ranking prefers lower risk, which differs from targeting high-need areas; the CDC anti-displacement example sets its weight to 0. |
| Carbon-related proxy (`carbon_index`) | higher is worse | Building type + place | RECS 2020 Northeast site energy by building type; embodied-carbon direction from published studies; transit score | 60/40 building/transport split; embodied tier 1.0 single-family, 0.6 multi-unit. Relative, per home; not tonnes, not an emissions inventory, no project baseline. |

Factors overlap: transit enters directly and through the carbon proxy's transport term (with complete data and default weights, transit's total share is (25 + 0.4 × 15) / 130 ≈ 23.8%); need indicators feed equity and displacement.

## Composite and comparison

- Suitability for a higher-is-worse factor is 100 minus the value. The score is the weighted average over factors with a finite value and a positive weight; missing factors are skipped and the weights renormalize ("N of M weighted factors available"). No usable weight → no score, with a message.
- Default relative weights 25/25/25/25/15/15 (demand, transit, equity, climate, displacement, carbon). Raw weights are relative, not percentages.
- Rounding: one decimal, ties to even, in both Python (`round`) and JavaScript (`round1`). Shared vectors in `shared/rank_vector.json` check both.
- Comparison (`web/lib/comparison.js`): contribution = weight × suitability ÷ that scenario's usable weight. Differences sum to the unrounded gap. Zero-weight factors are never drivers. Held-constant, negligible (rounds to 0.0), and uneven-coverage factors are named. Permission is reported separately from the score.
- Permission (`web/lib/zoning.js`): the §911.02 row for the building's unit count (triplex → Three-Unit; 12 and 40 units → Multi-Unit). States: permitted, partial, special approval (A/S/C, not a variance), not permitted under the checked row, unknown (never permitted). Every reading needs expert review.

## Sensitivity (`web/lib/robustness.js`)

Five team-authored illustrative priorities (Balanced, Transit, Housing-need, Lower-hazard, Lower-carbon emphasis), not measured stakeholder preferences. The one-factor sweep moves one raw weight 0–100 in steps of 1 with the others fixed; the exact crossing is solved (polynomial of degree ≤ 2 in the weight) and reported with the first sampled change. On one parcel, transit and displacement cannot reorder options.

## Explanation component

- Runtime: Vercel AI SDK 7. Provider order: AI Gateway (`AI_MODEL`, default `anthropic/claude-haiku-4.5`) when `AI_GATEWAY_API_KEY` is set; otherwise an OpenAI-compatible endpoint from `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL`, then the gateway via Vercel OIDC.
- Grounding: the server rebuilds all facts from committed data; the browser sends only ids, types, weights, toggles, and filters. The facts include contributions, permission, coverage, sources, and computed sensitivity. The prompt forbids new numbers and legal conclusions.
- Guardrails: 600 output tokens, 15 s / 8 s timeouts, input-hash cache, per-IP and per-instance limits (in-memory, per server instance; not a global spending cap), 4 KB requests, redacted server logs, `AI_EXPLANATIONS=off` kill switch.
- **Production status at Checkpoint 3: no working credential, so the live site always shows the labeled deterministic template** (`web/lib/explainTemplate.js`, `explainSites.js`, `explainFacts.js`), which is built from the same facts.

## Data and privacy

Sources, vintages, and caveats: README "Data Sources", `docs/DATA_NOTES.md`, `web/public/data/sources.json`. No owner names, mailing addresses, deed parties, or debt amounts are requested or published (`pipeline/test_pii.py`). Site records (City-owned, vacant, tax-delinquent, condemned) are not availability or title.

## Known limitations

See README "Limitations" and `docs/VALIDATION.md`. Most important: no expert zoning review yet; dimensional rules, utilities, and geotechnical conditions are not evaluated; scores use fixed anchors, not citywide percentiles; ACS margins of error; the CHAS vintage lags; straight-line distances; no practitioner validation of the rankings.
