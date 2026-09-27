import test from 'node:test'
import assert from 'node:assert/strict'
import { priorityShares, samePriorityRatios } from './priorityWeights.js'
import { PLANNER_FACTORS, initialStudioScenario } from './plannerState.js'
import { evaluatePlanner } from './plannerModel.js'
import { BUILDING_IDS } from './buildings.js'
import { rectangleAt } from './plannerGeometry.js'
const ids = PLANNER_FACTORS.map(f => f.id)
const uniform = value => Object.fromEntries(ids.map(id => [id, value]))
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

function fixture() {
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map((id, i) => [id, { demand: 30 + 15 * i, displacement_risk: 30, carbon_index: 60 - 10 * i }]))
  const feature = { type: 'Feature', properties: { pin: 'fixture', zoning_code: 'TEST', scores }, geometry: rectangleAt([-79.94, 40.41], 100, 100) }
  const zoning = { districts: { TEST: { use_table_read: true, code_section: 'Fixture', allowed: ['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'], use_rows: { 'Single-Unit Detached': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const scenario = { ...initialStudioScenario('fixture', feature.properties), comparisonTypes: BUILDING_IDS, spareBoardings: 20, additionalDepartures: 30 }
  return { feature, zoning, scenario, stop: { stop_id: 'test', distance: 160, weekday_trips: 80 }, existingBuildings: [] }
}

test('all 1, 5, 50 or 100 produce identical multi-type scores, leaders, and effective shares', () => {
  const input = fixture()
  const results = [1, 5, 50, 100].map(n => evaluatePlanner({ ...input, scenario: { ...input.scenario, weights: uniform(n) } }))
  assert.equal(results[0].included.length, 7)
  for (const r of results) {
    assert.deepEqual(r.comparison.baseline, results[0].comparison.baseline)
    assert.deepEqual(r.comparison.proposal, results[0].comparison.proposal)
    for (const state of ['baseline', 'proposal']) for (const id of BUILDING_IDS) close(r[state][id].total, results[0][state][id].total)
    for (const factor of r.comparison.factors) close(factor.effectiveWeight, 1 / 7)
  }
})

test('relative ratios, zero weights and missing evidence drive displayed shares', () => {
  const weights = { ...uniform(1), demand: 2 }
  close(priorityShares(weights).demand, 2 / 8)
  close(priorityShares(weights).physical, 1 / 8)
  assert.equal(samePriorityRatios(weights, Object.fromEntries(ids.map(id => [id, weights[id] * 5]))), true)
  const shared = ids.filter(id => id !== 'capacity')
  const shares = priorityShares({ ...uniform(1), capacity: 100, carbon: 0 }, shared)
  assert.equal(shares.capacity, 0)
  assert.equal(shares.carbon, 0)
  close(shares.demand, 1 / 5)
  close(Object.values(shares).reduce((a, b) => a + b, 0), 1)
})

test('scaling non-uniform priorities also preserves scores and missing-evidence handling', () => {
  const input = fixture()
  input.scenario.spareBoardings = null
  const weights = { demand: 2, physical: 1, affordability: 4, displacement: 3, capacity: 8, access: 1, carbon: 0 }
  const evaluate = scale => evaluatePlanner({ ...input, scenario: { ...input.scenario, weights: Object.fromEntries(ids.map(id => [id, weights[id] * scale])) } })
  const a = evaluate(1), b = evaluate(5)
  assert.ok(a.excluded.includes('capacity'))
  assert.ok(a.excluded.includes('carbon'))
  assert.deepEqual(a.comparison.proposal, b.comparison.proposal)
  for (const id of BUILDING_IDS) close(a.proposal[id].total, b.proposal[id].total)
  for (const f of a.comparison.factors) close(f.effectiveWeight, priorityShares(weights, a.included)[f.id])
})

test('all priorities off means no ranked result and zero score shares', () => {
  const input = fixture()
  input.scenario.weights = uniform(0)
  const result = evaluatePlanner(input)
  assert.deepEqual(result.comparison.proposal.order, [])
  assert.equal(result.after, null)
  for (const id of BUILDING_IDS) assert.equal(result.proposal[id].total, null)
  assert.deepEqual(priorityShares(input.scenario.weights), uniform(0))
})
