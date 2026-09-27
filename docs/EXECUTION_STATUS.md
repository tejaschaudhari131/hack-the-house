# Execution status

Single integrator log for the owner's implementation spec (Sun Sep 27 2026). Times are ET.

## Current state

- Checkpoint 2 merged: PR #4 → main at `8ff2989`, production deployment `dpl_GRr9btPgnBzAD1GuCF68w7bPsRV2` READY. The owner verified the title, share link, and six-factor compare sentence on production.
- Checkpoint 3 branch: `cursor/checkpoint3-docs-demo-ded8` from `8ff2989`, with a new PR.
- Checkpoint 1 merged: PR #2 → main at `88aa9cb`. Production served the new title ("Housing Typology, Equity & Climate Matchmaker · Pittsburgh") at the start of Checkpoint 2.
- Checkpoint 2 branch: `cursor/checkpoint2-sensitivity-evidence-ded8`, from `88aa9cb`, with a new PR against main.

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

## Checkpoint 2 (spec I, J, L incl. performance)

| Item | Status | Evidence |
| --- | --- | --- |
| Illustrative priorities | Done, tested | Balanced (25/25/25/25/15/15), Transit, Housing-need, Lower-hazard, and Lower-carbon emphasis (`web/lib/presets.js`), labeled as team-authored, not measured stakeholder preferences. A "Show the weights behind each priority" table lists the raw weights. The CDC anti-displacement example stays visible: it opens Find Sites with the high-risk-tract example and sets the displacement weight to 0, and it says this is a different objective, not a lower risk. |
| One-factor sweep | Done, tested | `sweepPair()` moves one raw weight from 0 to 100 in steps of 1 with the others fixed. `solveCrossings()` solves exactly where the two unrounded scores are equal (a polynomial of degree ≤ 2 in w, so unequal coverage is handled); a test checks the scores are equal at the root. The sampled first change (on displayed one-decimal scores) is reported separately. Shared factors on one parcel say "cannot reorder". Shown in the compare and parcel views; included in the AI facts (`sensitivity`) and the brief. Demo parcel: equity crosses at 30.85 (solved), sampled change at 31; demand 21.35; carbon 23.84; climate has no crossing; transit and displacement cannot reorder. |
| Evidence drawer | Done, tested | `web/lib/evidence.js` + `EvidenceDrawer`: for each of the six factors it lists the score, geography, sources with https links from `sources.json`, vintage, observed inputs from the parcel record, assumptions (factor meaning + `score_model.json` normative choices), missing inputs (a missing score says the weights renormalize), and the sources' own limits. It appears in the parcel view (first-listed type) and the compare view (scenario A, plus B on a different parcel). |
| Reproducible scenario state | Done, tested, browser-checked | `web/lib/scenarioState.js` v1: mode, weights, what-if, parcel, the two drops with building type (so unit count and triplex are kept), Find Sites filters and sort, model version, and data pull date, encoded as base64url JSON (`?s=`, ≤ 4000 characters). Import validates the version, mode, all six weights, pins against the loaded data, building types, and filter keys and choices (shared with the API in `lib/validate.js`); unknown keys are dropped. A model or data mismatch gives a warning. Copy link, download JSON, and load JSON (≤ 20 KB). The brief and parcel report print the reproduce link. Browser: a 603-character link restored triplex vs townhouse; a stale version showed two warnings; a bad link was rejected with the reason. |
| L.10 stale / out-of-order explanations | Done, tested | `createRequestGuard()` + `streamExplanation()` in `web/lib/explainClient.js`. Tests: an older slow response for scenario A finishing after B's does not overwrite B; an invalidation (weights or scenario change) drops an in-flight response. |
| L.12 keyboard / narrow / non-color | Checked | Headless run: Tab order starts at "Skip to the results panel", then the header controls, all with a visible outline. At 390 px: 0 px horizontal overflow, 0 tables wider than the viewport. Permission, verdict, and contribution direction are text (badge labels, "+x A/B"), not color alone. The Leaflet map is still not keyboard-operable; address search and Find Sites are the keyboard path. |
| Performance | Done, measured | Transfer is small (production: 1.66–1.78 MB brotli for the 27.8 MB `parcels.geojson`; geometry is 1.3 MB of it). The measured cost was the slider: each move restyled all 8,645 polygons with a full re-rank. The fix: compute each parcel's #1 type directly, cache zoning per district, and call `setStyle` only when a parcel's #1 type or selection changes. Analytical data unchanged. Headless Chrome on this VM, local `next start`, 3 runs each, performance marks and longtask observer: five slider moves went from 5–6 long tasks totaling 324–429 ms (max 72–89 ms) to 1 long task totaling 54–57 ms (max 54–57 ms). Load was unchanged: data parsed ~370–400 ms; first map draw 856–877 ms before vs 835–873 ms after; load long task 159–171 ms before vs 148–157 ms after. These are not real-device timings. |

### Production AI fix (added to Checkpoint 2)

- Owner's report: production `/api/explain` (commit 88aa9cb) always fell back with "AI Gateway rejected the credentials" (~1.3 s). The project has no `AI_GATEWAY_API_KEY`, so it relied on OIDC, which was rejected; the legacy `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` were ignored.
- Change: `providerPlan()` in `web/lib/explainHandler.js`. With a gateway key: gateway, then `LLM_*`. Without one: `LLM_*` first (via `@ai-sdk/openai-compatible` 3.0.57, which pins the same `@ai-sdk/provider` 4.0.18 as `ai` 7.0.116), then the gateway through OIDC. Each failure before the first token falls through; if all fail, the labeled template names each failure. `X-Explain-Provider` and `X-Explain-Model` report what answered, and the UI label says "via Vercel AI Gateway" or "via an OpenAI-compatible API".
- Server logs: `[explain] provider error {stage, provider, model, status, name, message}`, with the message redacted against the configured keys and key-like strings. No IP or request body.
- Tests: plan order for each environment combination; `LLM_*` answering without a gateway key; a gateway 401 falling through to `LLM_*`; both failing → template; logs contain the status and no key. Also checked against a local HTTP server speaking the OpenAI streaming protocol (not a mock model): the real `createOpenAICompatible` path streamed text; a wrong key logged status 401 and returned the template.
- Not verified: a real call on production. That needs the merge and the owner's re-test.
- Also fixed from the owner's verification: the compare sentence lists every weighted factor (favoring A, favoring B, held constant, negligible, or not comparable); one rounding rule (Python-style one decimal, ties to even) in the table, sentence, and brief, stated on screen; the double space before "The mapping…" is gone; the browser title is "Hack the House · Pittsburgh housing-site decision support".

### Tests at Checkpoint 2

- JS `npm test`: see the checkpoint report (63 at the last run). Python: `test_score` 18, `test_pii` 5, `test_sites` 5. `next build` green.

## Checkpoint 3 (docs and demo)

- Docs: `docs/MODEL_CARD.md`, `docs/VALIDATION.md`, `docs/DEMO_SCRIPT.md` (resolved parcel PIN 0056F00338000000 and numbers from the committed data), `docs/SUBMISSION.md` (form draft; personal fields, video link, and attestations are TODO for humans), `docs/PILOT_PLAN.md`. README refreshed: live link, framing, docs index, libraries, AI disclosure including the production template status, limitations (expert review pending, not-evaluated items, map keyboard access), and team full names.
- Recording: `/opt/cursor/artifacts/cp3/hack-the-house-demo.mp4` (1280×720 H.264, 3:13, burned-in captions, no audio), with a contact sheet and SRT file. Recorded from https://hack-the-house.vercel.app (production at `8ff2989`) with Playwright and system Chrome (SwiftShader for the 3D map). Numbers in the captions were read from the page at recording time. The explanation shown is the labeled template, because production has no working model credential; the caption says so. Not in git.
- Small code fix: the comparison sentence shows the gap to one decimal ("2.0 points"), matching the rounding rule. It reaches production after the merge (the recording shows "2 points").
- AI on production: still the labeled template. The owner reports `LLM_*` are placeholders and the OIDC gateway call is rejected; a human must add a key in Vercel. No further agent work on this.

## Final status against the spec's mandatory requirements

| Requirement | Implemented | Verified | Evidence / blocker |
| --- | --- | --- | --- |
| Six-factor consistency | Yes | Tests + production (owner) | `lib/factors.js`; `factors.test.js`; parity vectors in Python and JS |
| Trustworthy comparison (contributions, coverage, permission apart) | Yes | Tests + browser + production (owner) | `lib/comparison.js`, `comparison.test.js` |
| Permission and unit-count correctness | Yes | Tests | `lib/zoning.js` `unitPermission`; triplex tests |
| Guided shortlist → compare → brief | Yes | Browser (local + production recording) | `lib/guide.js`, GuideBanner, DecisionBrief |
| Sensitivity (priorities, solved sweep) | Yes | Tests + browser | `lib/robustness.js` |
| Evidence visibility | Yes | Tests + browser | `lib/evidence.js`, EvidenceDrawer |
| Reproducible state | Yes | Tests + browser + production (owner) | `lib/scenarioState.js` |
| Grounded AI with labeled fallback | Yes | Mocks + local protocol server; production shows the template | Blocked on a real credential (human) |
| Performance fix, measured | Yes | Headless before/after | See Checkpoint 2 |
| Submission package | Drafted | Needs human review | `docs/SUBMISSION.md` TODOs: member emails and affiliations, video link, 18+ and eligibility attestations, confirmation of the AI disclosure |
| Demo recording | Yes | Contact sheet reviewed | `/opt/cursor/artifacts/cp3/` |
| Expert zoning review | No | — | Needs a qualified human reviewer; badges say "needs expert review" |

Recovery: the last known-good production commit is `8ff2989` (Checkpoint 2). Roll back in Vercel to that deployment if a later merge misbehaves.

## Presentation pass (after Checkpoint 3)

- Branch `cursor/ui-friendly-navigation-ded8` from `bd9e866`. No change to scoring, comparison math, permission logic, data, or tests; 66/66 JS and all Python tests still pass.
- Three-step navigation (Find sites · Compare options · Get the brief) with the current step marked (`aria-current="step"`), a next-step bar, **Start guided example** as the primary button, **How it works**, and **Browse the parcel map** as the fallback view. The app now opens on step 1.
- Answer first: the comparison and parcel views open with a headline result (which option scores higher, scores out of 100, allowed / needs special approval / not allowed / check with the City, shown with a text mark and a word, not color alone) and one plain sentence of why (`plainSummary()` restates the computed comparison). The points table, sweep, evidence, option details, data coverage, not-evaluated list, share and JSON, and flag box are behind labeled expanders.
- Plain labels on primary surfaces (for example "Market & lot fit", "Housing need", "Allowed"); precise terms stay in tooltips and details.
- "What matters most to you?": priority buttons first, sliders folded under "Fine-tune with sliders", and a live "Ranking changed: …" message in compare, parcel, and Find Sites views.
- Step 3 shows the decision brief on screen with Print / save as PDF (the print-only copy is unchanged).
- Shorter three-screen intro; closing it returns keyboard focus to the skip link (it only appears on keyboard focus).
- Checks (headless Chrome, local production build): Tab order skip link → Start guided example → How it works → steps 1–3 → Browse, all with visible outlines; 0 px horizontal overflow at 390 px; guided flow works end to end; the "Ranking changed" cue appears when Housing-need emphasis reverses the demo comparison. The MapLibre "Worker failed to load" console error also appears on production in this headless setup (pre-existing).
- Screenshots in `/opt/cursor/artifacts/ui/` (before and after first screen, each step, details expanded, narrow). `docs/DEMO_SCRIPT.md` is updated for the new navigation; the re-recording waits for the owner's go.

## Next action

Owner's assistant: merge PR #2 once CI and build pass, then check the production deploy. Owner: merge the Checkpoint 3 PR, fill the TODO fields in `docs/SUBMISSION.md`, upload the recording, add a model key if available (then re-record the explanation segment), and submit the form. The agent does not submit.
