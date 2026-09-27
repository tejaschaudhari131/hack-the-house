import test from "node:test"
import assert from "node:assert/strict"

import { PRESETS, PRESET_NOTE, matchPreset, presetWeights } from "./presets.js"
import { DEFAULT_WEIGHTS } from "./rank.js"
import { analyzeRobustness, compareWinner, describeRobustness, parcelWinner } from "./robustness.js"

const scores = {
  single_family: { demand: 50, transit: 60, equity: 30, climate_risk: 20 },
  townhouse_duplex: { demand: 70, transit: 60, equity: 40, climate_risk: 20 },
  small_apartment: { demand: 45, transit: 60, equity: 60, climate_risk: 22 },
  large_apartment: { demand: 30, transit: 60, equity: 62, climate_risk: 25 },
}

test("presets cover the five profiles, fill every weight key, and say they are value judgments", () => {
  assert.deepEqual(PRESETS.map((preset) => preset.id), ["resident", "cdc", "planner", "developer", "climate"])
  for (const preset of PRESETS) {
    const weights = presetWeights(preset)
    assert.deepEqual(Object.keys(weights), Object.keys(DEFAULT_WEIGHTS))
    for (const value of Object.values(weights)) assert.ok(value >= 0 && value <= 100)
  }
  assert.equal(matchPreset(DEFAULT_WEIGHTS)?.id, "planner")
  assert.equal(matchPreset({ ...DEFAULT_WEIGHTS, demand: 26 }), null)
  assert.match(PRESET_NOTE, /value judgments/)
  assert.match(PRESET_NOTE, /not data/)
})

test("robustness counts presets that keep #1 and finds the nearest single-slider flip", () => {
  const analysis = analyzeRobustness(parcelWinner(scores), DEFAULT_WEIGHTS)
  assert.equal(analysis.current.id, "townhouse_duplex")
  assert.equal(analysis.total, 5)
  assert.ok(analysis.agree >= 1 && analysis.agree <= 5)
  const equityUp = analysis.flips.find((flip) => flip.key === "equity" && flip.direction === "up")
  assert.ok(equityUp, "raising equity should eventually favor an apartment")
  assert.match(equityUp.to.id, /apartment/)
  const justBefore = parcelWinner(scores)({ ...DEFAULT_WEIGHTS, equity: equityUp.at - 1 })
  assert.equal(justBefore.id, "townhouse_duplex")
  const text = describeRobustness(analysis)
  assert.match(text, /Townhouse \/ duplex stays #1 under \d of 5 presets/)
  assert.match(text, /Flips to/)
})

test("a zoning filter that leaves one type makes #1 independent of the weights", () => {
  const analysis = analyzeRobustness(parcelWinner(scores, { allowed: new Set(["single_family"]) }), DEFAULT_WEIGHTS)
  assert.equal(analysis.current.id, "single_family")
  assert.equal(analysis.agree, 5)
  assert.equal(analysis.flips.length, 0)
  assert.equal(analysis.verdict, "robust")
})

test("compare robustness names which building wins and when it flips", () => {
  const winner = compareWinner({ scores, typeId: "townhouse_duplex" }, { scores, typeId: "large_apartment" })
  const analysis = analyzeRobustness(winner, DEFAULT_WEIGHTS)
  assert.equal(analysis.current.id, "A")
  const flip = analysis.flips.find((row) => row.key === "equity")
  assert.equal(flip.to.id, "B")
  assert.match(describeRobustness(analysis), /Building A/)
})
