import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BUILDING_IDS, BUILDINGS } from './buildings.js'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'
import { initialScenario, optionFor, EXAMPLES, historyFor, scenarioReducer, scenarioExport } from './plannerState.js'
import { rankTemplates } from './plannerShortlist.js'
import { rectangleAt, boundsOverlap, geometryBounds } from './plannerGeometry.js'
import { prepareNetwork } from './networkModel.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const origin = [-79.94, 40.41]
const network = { nodes: [origin, [-79.938, 40.41]], ground: [1, 1], edges: [[0, 1, 2], [1, 0, 2]], parks: [] }
const networkContext = prepareNetwork(network)
function fixture() {
  const scores = Object.fromEntries(Object.entries({ single_family: 20, townhouse_duplex: 40, small_apartment: 70, large_apartment: 95 }).map(([id, demand]) => [id, { demand, displacement_risk: 30, carbon_index: 20 }]))
  const feature = { type: 'Feature', properties: { pin: 'fixture', zoning_code: 'TEST', scores }, geometry: rectangleAt(origin, 80, 80) }
  const zoning = { districts: { TEST: { use_table_read: true, code_section: 'Test fixture', allowed: ['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'], use_rows: { 'Single-Unit Detached': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const scenario = { ...initialScenario('fixture', feature.properties), accessMode: 'network' }
  const stop = { stop_id: 'test', coordinates: network.nodes[1], weekday_trips: 80, distance: 170 }
  return { feature, zoning, scenario, stop, existingBuildings: [], networkContext }
}

test('both real examples screen all five templates with identical no-op states and shared coverage', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../testdata/study/${name}`, import.meta.url)))
  const parcels = read('parcels.geojson'), stops = read('stops.geojson'), buildings = read('existing-buildings.geojson'), zoning = read('zoning.json'), networkContext = prepareNetwork(read('walking-network.json'))
  for (const example of EXAMPLES) {
    const feature = parcels.features.find(f => f.properties.pin === example.pin), stop = preferredStop(nearbyStops(feature, stops))
    const scenario = { ...initialScenario(example.pin, feature.properties, String(stop.stop_id)), accessMode: 'network' }
    const existingBuildings = buildings.features.filter(b => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(b.geometry)))
    const result = evaluatePlanner({ feature, zoning, scenario, stop, existingBuildings, networkContext })
    assert.equal(result.shortlist.entries.length, 5)
    assert.deepEqual(result.shortlist.baseline, result.shortlist.proposal)
    for (const entry of result.shortlist.entries) {
      assert.deepEqual(entry.baseline, entry.proposal)
      assert.equal(entry.factors.length, 7)
      assert.equal(entry.delta, entry.proposal.eligible ? 0 : null)
      for (const id of result.shortlist.included) assert.ok(Number.isFinite(entry.baseline.scores[id]))
    }
    assert.equal(result.shortlist.changed, false)
    assert.ok(result.shortlist.excluded.includes('capacity'))
  }
})

test('common transit gains do not manufacture a different housing order', () => {
  const input = fixture()
  input.scenario.additionalDepartures = 60
  const { shortlist } = evaluatePlanner(input)
  assert.deepEqual(shortlist.baseline.order, shortlist.proposal.order)
  assert.equal(shortlist.changed, false)
  assert.ok(shortlist.entries[0].delta > 0)
  for (const entry of shortlist.entries) {
    close(entry.delta, shortlist.entries[0].delta)
    close(entry.factors.reduce((n, f) => n + (f.weightedDelta ?? 0), 0), entry.delta)
    for (const id of ['demand', 'affordability', 'displacement', 'carbon']) assert.equal(entry.baseline.scores[id], entry.proposal.scores[id])
  }
})

test('explicit capacity assumptions can change the leader without inventing demand or rent changes', () => {
  const input = fixture()
  input.scenario.weights = { demand: 50, capacity: 50 }
  input.scenario.spareBoardings = 2
  input.scenario.additionalDepartures = 60
  const { shortlist } = evaluatePlanner(input)
  assert.deepEqual(shortlist.baseline.leaders, ['single_family'])
  assert.deepEqual(shortlist.proposal.leaders, ['large_apartment'])
  assert.equal(shortlist.changed, true)
  for (const entry of shortlist.entries) {
    assert.equal(entry.baseline.scores.demand, entry.proposal.scores.demand)
    assert.equal(entry.baseline.rent, entry.proposal.rent)
  }
})

test('reserved land changes eligibility while malformed infrastructure withholds the proposal shortlist', () => {
  const input = fixture()
  input.scenario.parks = [{ id: 'park', node: 0, coordinates: origin, width: 100, depth: 100 }]
  let result = evaluatePlanner(input)
  assert.equal(result.shortlist.baseline.order.length, 5)
  assert.equal(result.shortlist.proposal.order.length, 0)
  assert.ok(result.shortlist.entries.every(e => e.proposal.massing.collisions > 0))
  input.scenario.parks = []
  input.scenario.connections = [{ id: 'bad', from: 999, to: 1, kind: 'path', width: 3 }]
  result = evaluatePlanner(input)
  assert.equal(result.shortlist.proposal.order.length, 0)
  assert.ok(result.shortlist.entries.every(e => /validation/.test(e.proposal.gate)))
})

test('missing factors use one denominator; missing zoning is excluded, while physical context and weights remain required', () => {
  const input = fixture()
  input.scenario.options = { A: optionFor('single_family', 1000), B: optionFor('townhouse_duplex', 1000) }
  input.feature.properties.scores.small_apartment.carbon_index = null
  const result = evaluatePlanner(input)
  assert.ok(result.included.includes('carbon'))
  assert.ok(result.shortlist.excluded.includes('carbon'))
  assert.match(result.shortlist.factors.find(f => f.id === 'carbon').exclusion, /Unknown/)
  for (const entry of result.shortlist.entries) assert.equal(entry.factors.find(f => f.id === 'carbon').weightedDelta, null)
  const unassessed = evaluatePlanner({ ...input, zoning: {} }).shortlist
  assert.ok(unassessed.proposal.order.length > 0)
  assert.ok(unassessed.entries.every(e => e.proposal.titleNine.excluded.includes('use')))
  for (const patch of [{ existingBuildings: null }, { scenario: { ...input.scenario, weights: {} } }]) {
    const list = evaluatePlanner({ ...input, ...patch }).shortlist
    assert.deepEqual(list.baseline.leaders, [])
    assert.deepEqual(list.proposal.leaders, [])
  }
})

test('preview uses the exact screened template, preserves other edits and can be undone and exported', () => {
  const input = fixture()
  input.scenario.options.A = { ...input.scenario.options.A, rent: 1800, utilities: 230, width: 27, height: 33, placement: { east: 5, north: 3, bearing: 45 } }
  const frozen = JSON.stringify(input.scenario)
  const result = evaluatePlanner({ ...input, shortlistSlot: 'A' })
  const entry = result.shortlist.entries.find(e => e.id === 'triplex')
  assert.equal(entry.option.rent, 1800)
  assert.equal(entry.option.utilities, 230)
  assert.equal(entry.option.placement, null)
  assert.equal(entry.option.height, BUILDINGS.triplex.heightM)
  assert.equal(JSON.stringify(input.scenario), frozen)
  let history = scenarioReducer(historyFor(input.scenario), { type: 'option', slot: 'A', value: entry.option })
  const preview = evaluatePlanner({ ...input, scenario: history.present, shortlistSlot: 'A' })
  assert.deepEqual(preview.proposal.A.scores, entry.proposal.scores)
  assert.deepEqual(preview.proposal.A.massing, entry.proposal.massing)
  assert.deepEqual(history.present.options.B, input.scenario.options.B)
  assert.equal(JSON.parse(JSON.stringify({ ...scenarioExport(history.present), results: preview })).results.shortlist.sourceSlot, 'A')
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(history.present, input.scenario)
})

test('ties are retained and high-scoring ineligible templates never lead', () => {
  const options = Object.fromEntries(BUILDING_IDS.map(id => [id, { eligible: true, total: 60 }]))
  options.large_apartment = { eligible: false, total: 100 }
  assert.equal(rankTemplates(options).leaders.length, 4)
  options.single_family.total = 60.09
  assert.equal(rankTemplates(options).leaders.length, 4)
  options.single_family.total = 60.11
  assert.deepEqual(rankTemplates(options).leaders, ['single_family'])
})
