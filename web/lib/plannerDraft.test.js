import test from 'node:test'
import assert from 'node:assert/strict'
import { BUILDING_IDS } from './buildings.js'
import { initialStudioScenario, scenarioReducer, historyFor, scenarioExport } from './plannerState.js'
import { comparisonTemplates } from './plannerShortlist.js'
import { evaluatePlanner } from './plannerModel.js'
import { rectangleAt } from './plannerGeometry.js'

function fixture() {
  const scores = Object.fromEntries(['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'].map((id, i) => [id, { demand: 30 + 15 * i, displacement_risk: 30, carbon_index: 60 - 10 * i }]))
  const feature = { type: 'Feature', properties: { pin: 'fixture', zoning_code: 'TEST', scores }, geometry: rectangleAt([-79.94, 40.41], 100, 100) }
  const zoning = { districts: { TEST: { use_table_read: true, code_section: 'Fixture', allowed: ['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'], use_rows: { 'Single-Unit Detached': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  return { feature, zoning, scenario: initialStudioScenario('fixture', feature.properties), stop: null, existingBuildings: [] }
}

test('Studio stores and exports one draft; comparison types are unique and optional', () => {
  const { scenario } = fixture()
  assert.equal(scenario.options, undefined)
  assert.deepEqual(Object.keys(comparisonTemplates(scenario)), [scenario.draft.typeId])
  scenario.comparisonTypes = [...BUILDING_IDS, ...BUILDING_IDS, 'invalid']
  assert.equal(Object.keys(comparisonTemplates(scenario)).length, 5)
  const exported = scenarioExport(scenario)
  assert.equal(exported.schemaVersion, 4)
  assert.equal(exported.scenario.options, undefined)
})

test('selected comparison uses the exact custom draft and shared costs, with no hidden alternative', () => {
  const input = fixture()
  Object.assign(input.scenario.draft, { width: 8.25, depth: 12.75, rent: 1423.5, utilities: 137.25, placement: { east: 10, north: 0, bearing: 0 } })
  input.scenario.comparisonTypes = ['triplex']
  const r = evaluatePlanner(input)
  assert.deepEqual(Object.keys(r.proposal), ['townhouse_duplex', 'triplex'])
  assert.equal(r.proposal.townhouse_duplex.width, 8.25)
  assert.deepEqual(r.proposal.townhouse_duplex.placement, input.scenario.draft.placement)
  assert.equal(r.proposal.triplex.width, 10)
  assert.equal(r.proposal.triplex.rent, 1423.5)
  assert.equal(r.proposal.triplex.utilities, 137.25)
  assert.equal(r.comparison.entries.length, 2)
  assert.equal(r.comparison.sourceSlot, undefined)
  assert.deepEqual(r.baseline, r.proposal)
  assert.deepEqual(Object.keys(r.audit.factors[0].values), ['townhouse_duplex', 'triplex'])
})

test('only selected types determine shared evidence coverage', () => {
  const input = fixture()
  input.feature.properties.scores.large_apartment.carbon_index = null
  assert.ok(evaluatePlanner(input).included.includes('carbon'))
  input.scenario.comparisonTypes = BUILDING_IDS
  const r = evaluatePlanner(input)
  assert.equal(r.comparison.entries.length, 5)
  assert.ok(!r.included.includes('carbon'))
  assert.deepEqual(r.included, r.comparison.included)
  for (const f of r.audit.factors.filter(f => f.included)) assert.equal(Object.keys(f.values).length, 5)
})

test('adding a building resets only the draft placement and remains undoable', () => {
  const { scenario } = fixture()
  scenario.draft.placement = { east: 10, north: 0, bearing: 25 }
  const building = { id: 'one', pin: scenario.pin, option: { ...scenario.draft }, targetIncome: scenario.targetIncome, stopId: scenario.stopId }
  let h = historyFor(scenario)
  h = scenarioReducer(h, { type: 'addBuilding', building })
  assert.equal(h.present.draft.placement, null)
  assert.equal(h.present.buildings[0].option.placement.bearing, 25)
  h = scenarioReducer(h, { type: 'undo' })
  assert.equal(h.present.buildings.length, 0)
  assert.equal(h.present.draft.placement.bearing, 25)
})


test('choosing a compared type swaps it into the single draft without losing the comparison', () => {
  const { scenario } = fixture()
  scenario.comparisonTypes = ['triplex']
  const h = scenarioReducer(historyFor(scenario), { type: 'draft', value: { typeId: 'triplex' } })
  assert.equal(h.present.draft.typeId, 'triplex')
  assert.deepEqual(h.present.comparisonTypes, ['townhouse_duplex'])
})
