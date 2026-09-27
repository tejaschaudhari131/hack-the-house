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

test("six-factor composite matches the shared rank vector", () => {
  const six = vector.six_factor
  for (const [housingType, expected] of Object.entries(six.expected_composite)) {
    assert.equal(composite(six.scores[housingType], six.weights), expected)
  }
  const order = rankTypes(six.scores, six.weights, { whatIf: true }).map((row) => row.id)
  assert.deepEqual(order, six.expected_order_what_if)
})

test("higher displacement risk or carbon lowers the composite; missing is skipped", () => {
  const weights = { demand: 1, transit: 1, equity: 1, climate: 1, displacement: 1, carbon: 1 }
  const base = { demand: 50, transit: 50, equity: 50, climate_risk: 20, displacement_risk: 30, carbon_index: 40 }
  assert.ok(composite({ ...base, displacement_risk: 10 }, weights) > composite({ ...base, displacement_risk: 90 }, weights))
  assert.ok(composite({ ...base, carbon_index: 10 }, weights) > composite({ ...base, carbon_index: 90 }, weights))
  assert.equal(
    composite({ ...base, carbon_index: null }, weights),
    composite(base, { ...weights, carbon: 0 }),
  )
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
