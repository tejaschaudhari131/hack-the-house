import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { composite, rankTypes } from "./rank.js"

const vector = JSON.parse(
  readFileSync(new URL("../../shared/rank_vector.json", import.meta.url), "utf8"),
)

test("composite matches the shared rank vector", () => {
  for (const [housingType, expected] of Object.entries(vector.expected_composite)) {
    assert.equal(composite(vector.scores[housingType], vector.weights), expected)
  }
})

test("what-if order ignores the zoning allow-list", () => {
  const order = rankTypes(vector.scores, vector.weights, {
    allowed: new Set(vector.allowed),
    whatIf: true,
  }).map((row) => row.id)
  assert.deepEqual(order, vector.expected_order_what_if)
})

test("current rules sort allowed types ahead of flagged types", () => {
  const order = rankTypes(vector.scores, vector.weights, {
    allowed: new Set(vector.allowed),
    whatIf: false,
  }).map((row) => row.id)
  assert.deepEqual(order, vector.expected_order_current_rules)
})

test("a missing climate score is skipped instead of counted as zero", () => {
  const withClimate = composite(
    { demand: 80, transit: 80, equity: 80, climate_risk: 0 },
    { demand: 1, transit: 1, equity: 1, climate: 1 },
  )
  const missingClimate = composite(
    { demand: 80, transit: 80, equity: 80, climate_risk: null },
    { demand: 1, transit: 1, equity: 1, climate: 1 },
  )
  assert.equal(withClimate, 85)
  assert.equal(missingClimate, 80)
})
