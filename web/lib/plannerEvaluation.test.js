import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlannerEvaluator, sameEvaluationContext } from './plannerEvaluation.js'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'
import { initialStudioScenario, initialScenario, PLANNER_FACTORS, optionFor } from './plannerState.js'
import { BUILDING_IDS } from './buildings.js'
import { rectangleAt, geometryBounds } from './plannerGeometry.js'
import { spatialIndex } from './studioData.js'
import { prepareNetwork } from './networkModel.js'

const weights = value => Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, value]))
function fixture(legacy = false) {
  const feature = { type: 'Feature', geometry: rectangleAt([-79.94, 40.41], 150, 150), properties: { pin: 'site', zoning_code: 'LNC', lot_sqft: 200000, scores: Object.fromEntries(['single_family','townhouse_duplex','small_apartment','large_apartment'].map((id, i) => [id, { demand: 25 + 20 * i, carbon_index: 60 - 15 * i, displacement_risk: 40 }])) } }
  const zoning = JSON.parse(readFileSync(new URL('../public/data/zoning.json', import.meta.url)))
  const scenario = (legacy ? initialScenario : initialStudioScenario)('site', feature.properties, 'bus')
  scenario.comparisonTypes = BUILDING_IDS
  scenario.additionalDepartures = 60; scenario.spareBoardings = 10
  return { feature, zoning, scenario, stop: { stop_id: 'bus', weekday_trips: 80, distance: 100 }, existingBuildings: [] }
}

test('priority-only results exactly match full evaluation, including all summaries, explanations and exclusions', () => {
  for (const legacy of [false, true]) for (const missing of [false, true]) {
    const input = fixture(legacy), evaluator = createPlannerEvaluator()
    if (missing) { input.existingBuildings = null; input.stop = null }
    evaluator.evaluate(input)
    const priorities = [weights(0), weights(1), weights(100), { ...weights(0), carbon: 100 }, { ...weights(1), demand: 100, capacity: 0 }, weights(5)]
    for (const w of priorities) {
      const next = { ...input, scenario: { ...input.scenario, weights: w } }
      assert.deepEqual(evaluator.evaluate(next), evaluatePlanner(next))
    }
    assert.deepEqual(evaluator.stats, { evaluated: 1, reweighted: priorities.length })
  }
})

test('placed-plan summaries and blocked candidates remain identical after reweighting', () => {
  const input = fixture(), evaluator = createPlannerEvaluator()
  input.areaSites = [{ id: 'placed', feature: input.feature, stop: input.stop, existingBuildings: [], targetIncome: 40000, option: { ...optionFor('triplex', 1000), placement: { east: -40, north: 0, bearing: 0 } } }]
  const before = evaluator.evaluate(input), snapshot = structuredClone(before)
  const next = { ...input, scenario: { ...input.scenario, weights: { ...weights(1), capacity: 100 } } }
  assert.deepEqual(evaluator.evaluate(next), evaluatePlanner(next))
  assert.deepEqual(before, snapshot, 'reweighting never mutates the earlier result')
  assert.equal(evaluator.stats.reweighted, 1)
})

test('every non-priority scenario edit and changed evidence invalidates the fast path', () => {
  const input = fixture()
  const edits = [s => ({ ...s, draft: { ...s.draft, width: 7 } }), s => ({ ...s, additionalDepartures: 30 }), s => ({ ...s, targetIncome: 25000 }), s => ({ ...s, comparisonTypes: ['single_family'] }), s => ({ ...s, zoningInputsByPin: { site: { parkingRegime: 'base', parkingSpaces: 0 } } }), s => ({ ...s, projectInputs: { affordableUnits: 0 } }), s => ({ ...s, parks: [{ node: 999, coordinates: [-79.94, 40.41], width: 20, depth: 20 }] })]
  for (const edit of edits) {
    const evaluator = createPlannerEvaluator(); evaluator.evaluate(input)
    const next = { ...input, scenario: edit(input.scenario) }
    assert.deepEqual(evaluator.evaluate(next), evaluatePlanner(next))
    assert.equal(evaluator.stats.evaluated, 2)
  }
  for (const key of ['feature', 'zoning', 'stop', 'existingBuildings']) {
    const evaluator = createPlannerEvaluator(); evaluator.evaluate(input)
    const next = { ...input, [key]: structuredClone(input[key]) }
    assert.deepEqual(evaluator.evaluate(next), evaluatePlanner(next))
    assert.equal(evaluator.stats.evaluated, 2, key)
  }
  assert.equal(sameEvaluationContext(input, { ...input, networkContext: null }), false)
})

test('both real study examples retain routed scores and exact geometry across slider edits', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../testdata/study/${name}`, import.meta.url)))
  const parcels = read('parcels.geojson'), stops = read('stops.geojson'), zoning = read('zoning.json')
  const buildings = spatialIndex(read('existing-buildings.geojson').features), networkContext = prepareNetwork(read('walking-network.json'))
  for (const pin of ['0056F00338000000', '0049N00010000000']) {
    const feature = parcels.features.find(f => f.properties.pin === pin), stop = preferredStop(nearbyStops(feature, stops))
    const input = { feature, zoning, stop, networkContext, existingBuildings: buildings.query(geometryBounds(feature.geometry)), scenario: { ...initialStudioScenario(pin, feature.properties, String(stop.stop_id)), accessMode: 'network', comparisonTypes: BUILDING_IDS } }
    const evaluator = createPlannerEvaluator(), before = evaluator.evaluate(input)
    const next = { ...input, scenario: { ...input.scenario, weights: { ...weights(1), affordability: 80 } } }
    const actual = evaluator.evaluate(next)
    assert.deepEqual(actual, evaluatePlanner(next))
    assert.equal(actual.baseline.townhouse_duplex.massing, before.baseline.townhouse_duplex.massing)
    assert.equal(actual.baseline.townhouse_duplex.access, before.baseline.townhouse_duplex.access)
    assert.equal(actual.baseline.townhouse_duplex.titleNine, before.baseline.townhouse_duplex.titleNine)
    assert.equal(evaluator.stats.reweighted, 1)
  }
})
