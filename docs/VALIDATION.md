# Validation

What has been checked, how, and what has not. Run everything with:

```bash
cd pipeline && python3 test_score.py && python3 test_pii.py && python3 test_sites.py
cd web && npm ci && npm test && npm run build
```

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
