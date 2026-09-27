# Execution status

Single integrator log for the owner's implementation spec (Sun Sep 27 2026). Times are ET.

## Current state

- Branch: `cursor/ai-explanations-gateway-ded8` (PR #2 against `main`). Main at `866a8cd` (PR #3 merged). This branch contains all of main; GitHub reports PR #2 mergeable.
- Production (https://hack-the-house.vercel.app) still serves the pre-PR-#2 build (page title "Housing typology matchmaker") until PR #2 is merged.
- Head SHA for Checkpoint 1: see the PR; recorded in the checkpoint report.

## Checkpoint 1 (spec D steps 1–4)

| Item | Status | Evidence |
| --- | --- | --- |
| D1 Baseline: tests, build, production state | Done | Before changes: Python 27 tests OK (`test_score`, `test_pii`, `test_sites`), JS 46/46, `next build` OK. Production returned 200; `parcels.geojson` served with `content-encoding: br`. |
| D2 Integrate main (PR #3) into PR #2 | Done (earlier run), verified | `git log HEAD..origin/main` is empty. Find Sites, displacement, carbon, LIHTC/QCT, public-record caveats, and source notes kept. Conflicts in App, ParcelPanel, MapView, CSS, README, and the test script were resolved by keeping both sides. |
| D2 Six factors consistent | Done | `web/lib/factors.js` is the one factor table (id, score key, label, direction, scope, meaning, source ids). Used by ranking, slider labels, comparison, explanation facts, templates, the report, and the brief. The explain API requires all six weight keys. |
| F Composite correctness and Python/JS parity | Done, tested | JS no longer rounds 100 − risk before averaging, and it rounds like Python `round(x, 1)` (ties to even). New shared edge vectors in `shared/rank_vector.json` are checked by both `pipeline/test_score.py` and `web/lib/factors.test.js`: tie, no-early-rounding, all-zero weights, missing factor renormalization, all weighted factors missing. Non-finite values and weights (`""`, NaN, Infinity, numeric strings) are skipped, not zero. Coverage text: "N of M weighted factors available; missing: …". |
| F Deterministic comparison | Done, tested | `web/lib/comparison.js`: per-factor contributions (weight × suitability ÷ that scenario's usable weight), differences that sum to the unrounded gap, drivers from contributions only (zero-weight and sub-0.05 differences excluded), held-constant factors, coverage warning, tie and not-ranked states, and permission kept separate. The UI table, the decision brief, the compare template, and the AI facts all read it. Raw-gap "widest gap" wording and the untested "a small weight change can flip them" wording were removed; "close under the current weights" is used when the gap is under 1 point. |
| G Labels and meanings | Done | Market activity & lot fit (not demand for a type); equity separates measured need from team multipliers; displacement is a screening signal; carbon is a "relative carbon-related proxy per home" (not tonnes, no project baseline). The factor overlap note derives transit's total share from `score_model.json` (default weights: (25 + 0.4 × 15) / 130 ≈ 23.8%). "Confidence" is now shown as "Data coverage (thin-data heuristic)" (field names unchanged). What-if ordering keeps each type's underlying reading. "Not evaluated" is listed for setbacks, lot width, FAR/height, parking, utilities, and geotechnical. The 800 m ring is labeled straight-line; flood wording is "no overlap with the checked FEMA flood zones". |
| G7/G8 Permission states and unit counts | Done, tested | `unitPermission()` reads the §911.02 row for the building's unit count: triplex → Three-Unit, 12- and 40-unit buildings → Multi-Unit. States: permitted, partial, special approval, not permitted under the checked row, and unknown (never permitted). A triplex building (3 units) was added; a 12-home building in R3-L now reads "not permitted" instead of the triplex "partial" label. Find Sites → compare keeps the triplex, and the export and AI facts carry it (test L.7). "No type permitted by right" and "neither scenario permitted" are stated, not presented as recommendations. |
| G3 Displacement intervention | Done | The Find Sites "anti-displacement" example now sets the displacement weight to 0 and says why. It does not change risk values. |
| D4 Guided shortlist → compare → brief | Done, browser-checked | "Try a real example" (header and onboarding). `web/lib/guide.js` resolves the parcel from data at runtime: the city-triplex Find Sites question gives 25 matches; the top match is PIN 0056F00338000000 (Hazelwood Ave, LNC, 5,100 sq ft vacant, City inventory). The guide compares a triplex with a townhouse / duplex on that lot (72.6 vs 72.9, close). The CDC preset puts the triplex ahead (70.4 vs 68.6). Step 3 prints a decision brief with both scenarios, permission, contributions, weights and shares, a robustness summary, unresolved items, three rule-based next steps (`web/lib/nextActions.js`), sources, and build/model/data/prompt versions. |
| Header / first screen | Done | "Hack the House", a plain task line, the parcel count from `summary.json`, a primary "Try a real example" button, and "Find sites". |

## Tests at Checkpoint 1

- JS: `cd web && npm test` → 57 pass, 0 fail.
- Python: `test_score.py` 18 OK (adds shared edge vectors), `test_pii.py` 5 OK, `test_sites.py` 5 OK.
- `cd web && npm run build` → compiled successfully.
- Section L coverage: 1, 2, 3, 4 (coverage; the mandatory hazard filters already fail on missing layers in `sites.js`), 5, 6, 7, and 8 are automated. 9 is covered by the mock-model and fallback tests. 10 is code-reviewed only (`useExplanation` resets on a key change and ignores out-of-order responses); it has no hook test. 11 was browser-run (headless Chrome over CDP, below). 12 is partial: a skip link, focus outlines, labeled tables, and non-color labels exist. It was not re-audited at this checkpoint.

## Browser run (headless Chrome, SwiftShader, local `next start`)

A fresh profile opened onboarding. "Try a real example" went to the shortlist banner (25 matches, top PIN 0056F00338000000). Compare switched to drop mode with triplex vs townhouse, 6/6 factors each. The contribution table rendered. "Does the winner hold?": B stays #1 under 2 of 5 presets. The CDC preset reverses the order. The brief printed to PDF on 2 pages (page 2 is the source and version footer). No page exceptions. Parcels took ~31 s to render in this software-rendered headless run; that is not a real-browser load time and is the Checkpoint 2 performance item.

Screenshots and the brief PDF are in the agent artifacts (`/opt/cursor/artifacts/cp1/`), not in git.

## Unverified or open

- Real AI Gateway call on the deployment: not run. There is no local credential; it will be checked after merge (OIDC on Vercel).
- Presets still use stakeholder-style names (Resident, CDC, …) labeled as team-authored examples. The spec's suggested emphasis names and the exact threshold solve are Checkpoint 2 (sensitivity).
- Evidence drawer, reproducible scenario state (share URL or JSON), the performance fix, and acceptance checks against production are Checkpoint 2.
- MODEL_CARD, VALIDATION, DEMO_SCRIPT, SUBMISSION, PILOT_PLAN, and the recording are Checkpoint 3.
- Expert zoning review and eligibility/attestation fields: unresolved. They need people; the AI does not attest or review.

## Next action

Owner's assistant: merge PR #2 once CI and build pass, then check the production deploy. Agent: continue to Checkpoint 2 on the go.
