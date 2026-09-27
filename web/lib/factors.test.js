import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { FACTORS, breakdown, coverageText, round1, transitTotalShare, weightShares } from "./factors.js"
import { DEFAULT_WEIGHTS, composite, rankTypes } from "./rank.js"

const vector = JSON.parse(readFileSync(new URL("../../shared/rank_vector.json", import.meta.url)))

test("Python and JS agree on the shared vectors, including ties and unrounded inversion", () => {
  for (const [type, expected] of Object.entries(vector.six_factor.expected_composite)) {
    assert.equal(composite(vector.six_factor.scores[type], vector.six_factor.weights), expected, type)
  }
  for (const [type, expected] of Object.entries(vector.expected_composite)) {
    assert.equal(composite(vector.scores[type], vector.weights), expected, type)
  }
  for (const item of vector.edge_cases) assert.equal(composite(item.score, item.weights), item.expected, item.name)
  assert.equal(round1(62.25), 62.2)
  assert.equal(round1(62.35), 62.4)
  assert.equal(round1(0.05 + 0.1), 0.2)
})

test("non-finite values and weights are skipped, not treated as zero", () => {
  const weights = { demand: 1, transit: 1, equity: 1, climate: 1, displacement: 0, carbon: 0 }
  const clean = composite({ demand: 60, transit: 80 }, weights)
  assert.equal(composite({ demand: 60, transit: 80, equity: "", climate_risk: Number.NaN }, weights), clean)
  assert.equal(composite({ demand: 60, transit: 80, equity: "40", climate_risk: Infinity }, weights), clean)
  assert.equal(composite({ demand: 60, transit: 80 }, { ...weights, equity: Infinity, climate: "25" }), clean)
  const result = breakdown({ demand: 60, transit: 80 }, weights)
  assert.deepEqual(result.missingIds, ["equity", "climate"])
  assert.match(coverageText(result), /2 of 4 weighted factors available; missing: Equity, Climate hazard/)
  const none = breakdown({ demand: 60 }, { demand: 0 })
  assert.equal(none.composite, null)
  assert.match(none.noScoreReason, /every weight is zero/)
})

test("contributions sum to the unrounded score, and risk factors are inverted", () => {
  const score = { demand: 70, transit: 80, equity: 30, climate_risk: 10, displacement_risk: 60, carbon_index: 40 }
  const result = breakdown(score, DEFAULT_WEIGHTS)
  const sum = result.rows.reduce((total, row) => total + (row.contribution ?? 0), 0)
  assert.ok(Math.abs(sum - result.exact) < 1e-9)
  assert.equal(result.rows.find((row) => row.id === "climate").suitability, 90)
  assert.equal(result.rows.find((row) => row.id === "displacement").suitability, 40)
  assert.equal(FACTORS.filter((factor) => factor.direction === "higher_worse").length, 3)
  const ranked = rankTypes({ single_family: score }, DEFAULT_WEIGHTS)
  assert.equal(ranked.find((row) => row.id === "single_family").composite, result.composite)
})

test("weights are relative; shares are derived, and transit's total share includes the carbon transport term", () => {
  const shares = weightShares(DEFAULT_WEIGHTS)
  assert.ok(Math.abs(Object.values(shares).reduce((a, b) => a + b, 0) - 1) < 1e-12)
  assert.ok(Math.abs(transitTotalShare(DEFAULT_WEIGHTS, 0.4) - (25 + 0.4 * 15) / 130) < 1e-12)
})

test("the evidence drawer lists sources with links, observed inputs, assumptions, and missing data for all six factors", async () => {
  const { buildEvidence } = await import("./evidence.js")
  const sources = JSON.parse(readFileSync(new URL("../public/data/sources.json", import.meta.url)))
  const model = JSON.parse(readFileSync(new URL("../public/data/score_model.json", import.meta.url)))
  const props = {
    pin: "1",
    lot_sqft: 5100,
    trips_within_400m: 270,
    nearest_stop_name: "SECOND AVE + GLENWOOD",
    nearest_stop_m: 90,
    sfha_overlap: 0,
    steep_slope_overlap: 0.08,
    undermined_overlap: null,
    renter_share: 0.49,
    factors: { price_per_sqft: 153.1, lot_fit: { small_apartment: 0.4 } },
    scores: { small_apartment: { demand: 47.2, transit: 97.5, equity: null, climate_risk: 2.5, displacement_risk: 30.3, carbon_index: 35.9 } },
  }
  const evidence = buildEvidence({ props, typeId: "small_apartment", sources, summary: { county_median_income: 78548 }, zoningRules: null, model })
  assert.equal(evidence.length, 6)
  for (const entry of evidence) {
    assert.ok(entry.sources.length, entry.id)
    assert.ok(entry.assumptions.length >= 2, entry.id)
  }
  const climate = evidence.find((entry) => entry.id === "climate")
  assert.ok(climate.sources.some((source) => source.url?.startsWith("https://")))
  assert.ok(climate.missing.some((line) => /Undermined/.test(line)))
  assert.ok(evidence.find((entry) => entry.id === "equity").missing[0].includes("renormalize"))
  assert.ok(!JSON.stringify(evidence).match(/owner|grantor|mailing/i))
})
