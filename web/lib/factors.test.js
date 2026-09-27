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
