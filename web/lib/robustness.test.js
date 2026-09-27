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
  assert.deepEqual(PRESETS.map((preset) => preset.id), ["balanced", "transit", "housing_need", "lower_hazard", "lower_carbon"])
  for (const preset of PRESETS) {
    const weights = presetWeights(preset)
    assert.deepEqual(Object.keys(weights), Object.keys(DEFAULT_WEIGHTS))
    for (const value of Object.values(weights)) assert.ok(value >= 0 && value <= 100)
  }
  assert.equal(matchPreset(DEFAULT_WEIGHTS)?.id, "balanced")
  assert.equal(matchPreset({ ...DEFAULT_WEIGHTS, demand: 26 }), null)
  assert.match(PRESET_NOTE, /not measured stakeholder preferences/)
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
  const winner = compareWinner({ scores: scores.townhouse_duplex, label: "Townhouse / duplex" }, { scores: scores.large_apartment, label: "Large apartment (40 units)" })
  const analysis = analyzeRobustness(winner, DEFAULT_WEIGHTS)
  assert.equal(analysis.current.id, "A")
  const flip = analysis.flips.find((row) => row.key === "equity")
  assert.equal(flip.to.id, "B")
  assert.match(describeRobustness(analysis), /Building A/)
})

test("presets and robustness move the displacement and carbon weights too", () => {
  for (const preset of PRESETS) {
    const weights = presetWeights(preset)
    assert.ok(Number.isFinite(weights.displacement))
    assert.ok(Number.isFinite(weights.carbon))
  }
  const withCarbon = {
    single_family: { demand: 60, transit: 60, equity: 40, climate_risk: 20, displacement_risk: 50, carbon_index: 70 },
    small_apartment: { demand: 55, transit: 60, equity: 40, climate_risk: 20, displacement_risk: 50, carbon_index: 30 },
  }
  const analysis = analyzeRobustness(parcelWinner(withCarbon), DEFAULT_WEIGHTS)
  assert.equal(analysis.current.id, "small_apartment")
  const carbonDown = analysis.flips.find((flip) => flip.key === "carbon" && flip.direction === "down")
  assert.ok(carbonDown, "lowering the carbon weight should hand #1 to single-family")
  assert.equal(carbonDown.to.id, "single_family")
})

test("one-factor sweep: solved crossings make the unrounded scores equal; shared factors cannot reorder", async () => {
  const { sweepPair, solveCrossings, SWEEP } = await import("./robustness.js")
  const { breakdown } = await import("./factors.js")
  const a = { label: "Triplex (3 units)", scores: { demand: 47.2, transit: 97.5, equity: 55, climate_risk: 2.5, displacement_risk: 30.3, carbon_index: 35.9 } }
  const b = { label: "Townhouse / duplex", scores: { demand: 57.6, transit: 97.5, equity: 48.5, climate_risk: 2.3, displacement_risk: 30.3, carbon_index: 40.2 } }
  const rows = sweepPair(a, b, DEFAULT_WEIGHTS)
  const equity = rows.find((row) => row.id === "equity")
  assert.equal(equity.solved.length, 1)
  const at = equity.solved[0]
  const weights = { ...DEFAULT_WEIGHTS, equity: at }
  assert.ok(Math.abs(breakdown(a.scores, weights).exact - breakdown(b.scores, weights).exact) < 1e-9)
  assert.ok(Math.abs(equity.sampled.at - at) <= SWEEP.step + 1e-9)
  assert.match(equity.text, /solved exactly/)
  for (const id of ["transit", "displacement"]) {
    const row = rows.find((item) => item.id === id)
    assert.equal(row.same, true)
    assert.equal(row.solved.length, 0)
    assert.match(row.text, /cannot reorder/)
  }
  const thin = { scores: { ...b.scores, equity: null } }
  const roots = solveCrossings(a.scores, thin.scores, DEFAULT_WEIGHTS, "demand")
  for (const w of roots) {
    const ww = { ...DEFAULT_WEIGHTS, demand: w }
    assert.ok(Math.abs(breakdown(a.scores, ww).exact - breakdown(thin.scores, ww).exact) < 1e-9)
  }
})
