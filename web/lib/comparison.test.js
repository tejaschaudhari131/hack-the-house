import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { buildScenario, compareScenarios, describeComparison } from "./comparison.js"
import { DEFAULT_WEIGHTS } from "./rank.js"

const rules = JSON.parse(readFileSync(new URL("../public/data/zoning.json", import.meta.url)))

const props = {
  pin: "0000A00001000000",
  address: "1 TEST ST",
  neighborhood: "Hazelwood",
  zoning_code: "R3-L",
  scores: {
    townhouse_duplex: { demand: 70, transit: 80, equity: 30, climate_risk: 10, displacement_risk: 40, carbon_index: 45 },
    small_apartment: { demand: 50, transit: 80, equity: 55, climate_risk: 12, displacement_risk: 40, carbon_index: 35 },
    large_apartment: { demand: 30, transit: 80, equity: 57, climate_risk: 14, displacement_risk: 40, carbon_index: 30 },
  },
}

test("contribution differences reconcile with the unrounded gap", () => {
  const a = buildScenario("A", "triplex", props, rules)
  const b = buildScenario("B", "townhouse_duplex", props, rules)
  const result = compareScenarios(a, b, DEFAULT_WEIGHTS)
  const sum = result.factors.reduce((total, row) => total + row.difference, 0)
  assert.ok(Math.abs(sum - result.gap) < 1e-9)
  assert.equal(result.sameParcel, true)
  assert.deepEqual(result.heldConstant.sort(), ["displacement", "transit"])
  for (const id of ["transit", "displacement"]) assert.ok(Math.abs(result.factors.find((row) => row.id === id).difference) < 1e-9)
  assert.equal(a.permission.category, "permitted")
  assert.equal(a.units, 3)
  assert.match(a.scoreNote, /3-home count is a display default/)
  assert.match(describeComparison(result), /Permission is separate from the score/)
})

test("a zero-weight factor is never a driver", () => {
  const a = buildScenario("A", "triplex", props, rules)
  const b = buildScenario("B", "townhouse_duplex", props, rules)
  const result = compareScenarios(a, b, { ...DEFAULT_WEIGHTS, equity: 0 })
  assert.equal(result.factors.find((row) => row.id === "equity").difference, 0)
  assert.ok(![...result.favorA, ...result.favorB].some((row) => row.id === "equity"))
})

test("unequal coverage is disclosed and a missing factor is not an advantage", () => {
  const thin = { ...props, pin: "0000A00002000000", scores: { townhouse_duplex: { ...props.scores.townhouse_duplex, equity: null } } }
  const result = compareScenarios(buildScenario("A", "townhouse_duplex", props, rules), buildScenario("B", "townhouse_duplex", thin, rules), DEFAULT_WEIGHTS)
  assert.equal(result.sameCoverage, false)
  assert.match(result.coverageWarning, /different evidence coverage/)
  assert.ok(![...result.favorA, ...result.favorB].some((row) => row.id === "equity"))
  assert.match(result.b.coverage, /5 of 6 weighted factors available; missing: Equity/)
})

test("ties, unscored scenarios, and a 12-unit building in a triplex-only district", () => {
  const same = compareScenarios(buildScenario("A", "townhouse_duplex", props, rules), buildScenario("B", "townhouse_duplex", props, rules), DEFAULT_WEIGHTS)
  assert.equal(same.winner, "tie")
  assert.match(describeComparison(same), /tied at/)
  const zero = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, 0]))
  const none = compareScenarios(buildScenario("A", "triplex", props, rules), buildScenario("B", "townhouse_duplex", props, rules), zero)
  assert.equal(none.ranked, false)
  assert.match(describeComparison(none), /not ranked against each other/)
  const twelve = buildScenario("B", "small_apartment", props, rules)
  assert.equal(twelve.permission.category, "not_permitted")
  assert.equal(twelve.units, 12)
  const both = compareScenarios(buildScenario("A", "large_apartment", props, rules), twelve, DEFAULT_WEIGHTS)
  assert.equal(both.neitherPermitted, true)
  assert.match(describeComparison(both), /Neither scenario is permitted by right/)
})
