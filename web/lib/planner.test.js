import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rectangleAt, rectangleInside, fitMassing, slimParcels, geometryBounds, boundsOverlap, placementAt, geometriesOverlap } from './plannerGeometry.js'
import { evaluatePlanner, nearbyStops, preferredStop, serviceMetrics } from './plannerModel.js'
import { initialScenario, scenarioReducer, historyFor, EXAMPLES, scenarioExport } from './plannerState.js'

const parcels = JSON.parse(readFileSync(new URL('../public/data/parcels.geojson', import.meta.url)))
const zoning = JSON.parse(readFileSync(new URL('../public/data/zoning.json', import.meta.url)))
const stops = JSON.parse(readFileSync(new URL('../public/data/stops.geojson', import.meta.url)))
const buildings = JSON.parse(readFileSync(new URL('../public/data/existing-buildings.geojson', import.meta.url)))
function inputFor(pin = EXAMPLES[0].pin) {
  const feature = parcels.features.find(f => f.properties.pin === pin)
  const stop = preferredStop(nearbyStops(feature, stops))
  const existingBuildings = buildings.features.filter(f => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(f.geometry)))
  return { feature, zoning, stop, existingBuildings, scenario: initialScenario(pin, feature.properties, String(stop.stop_id)) }
}

test('both real examples have valid baselines and fixed-size proposal footprints', () => {
  for (const example of EXAMPLES) {
    const input = inputFor(example.pin)
    const result = evaluatePlanner(input)
    assert.equal(result.baseline.A.permission.category, 'permitted')
    assert.equal(result.baseline.B.permission.category, 'permitted')
    assert.equal(result.baseline.A.massing.fits, true)
    assert.equal(result.baseline.B.massing.fits, true)
    assert.ok(result.baseline.A.service.departures > 0)
    assert.equal(input.scenario.options.A.rent + input.scenario.options.A.utilities, input.feature.properties.median_gross_rent)
    assert.deepEqual(result.baseline, result.proposal)
  }
})

test('more service improves access without rewriting baseline observations, carbon or displacement', () => {
  const input = inputFor(), original = JSON.stringify(input.feature)
  input.scenario.additionalDepartures = 60
  const result = evaluatePlanner(input)
  assert.ok(result.accessDelta > 0)
  for (const slot of ['A', 'B']) {
    assert.equal(result.proposal[slot].service.departures - result.baseline[slot].service.departures, 60)
    for (const key of ['demand', 'physical', 'affordability', 'displacement', 'carbon']) assert.equal(result.baseline[slot].scores[key], result.proposal[slot].scores[key])
  }
  const gainA = result.proposal.A.total - result.baseline.A.total
  const gainB = result.proposal.B.total - result.baseline.B.total
  assert.ok(Math.abs(gainA - gainB) < 1e-9)
  assert.equal(result.before, result.after)
  assert.equal(JSON.stringify(input.feature), original)
})

test('a missing or unserved stop cannot generate access or conditional capacity', () => {
  const input = inputFor()
  input.scenario.additionalDepartures = 60
  input.scenario.spareBoardings = 200
  assert.equal(serviceMetrics(null, input.scenario, true), null)
  assert.equal(serviceMetrics({ ...input.stop, weekday_trips: 0 }, input.scenario, true), null)
  const result = evaluatePlanner({ ...input, stop: null })
  assert.equal(result.proposal.A.scores.capacity, null)
  assert.equal(result.proposal.A.scores.access, null)
  assert.ok(result.excluded.includes('access'))
})

test('unknown capacity is excluded on both sides; supplied capacity compares explicit loads', () => {
  const input = inputFor()
  input.scenario.additionalDepartures = 30
  let result = evaluatePlanner(input)
  assert.equal(result.proposal.A.supply, null)
  assert.equal(result.baseline.A.scores.capacity, null)
  assert.ok(result.excluded.includes('capacity'))
  input.scenario.spareBoardings = 0
  result = evaluatePlanner(input)
  assert.equal(result.baseline.A.scores.capacity, 0)
  assert.equal(result.proposal.A.addedPlaces, 600)
  assert.equal(result.proposal.A.demandBoardings, 4)
  assert.equal(result.proposal.B.demandBoardings, 6)
  assert.equal(result.proposal.B.scores.capacity, 100)
})

test('all-zero weights produce no winner and no numerical total', () => {
  const input = inputFor()
  input.scenario.weights = Object.fromEntries(Object.keys(input.scenario.weights).map(k => [k, 0]))
  const result = evaluatePlanner(input)
  assert.equal(result.after, null)
  assert.equal(result.proposal.A.total, null)
})

test('physical failures never win merely because other scores are high', () => {
  const input = inputFor()
  input.scenario.options.A.width = 100
  input.scenario.options.A.depth = 100
  const result = evaluatePlanner(input)
  assert.equal(result.proposal.A.eligible, false)
  assert.equal(result.after, 'B')
})

test('use-table prohibition excludes a housing proposal', () => {
  const input = inputFor()
  input.feature = { ...input.feature, properties: { ...input.feature.properties, zoning_code: 'test' } }
  input.zoning = { districts: { test: { use_table_read: true, code_section: 'test', allowed: [], use_rows: { 'Two-Unit': '', 'Three-Unit': '' } } } }
  const result = evaluatePlanner(input)
  assert.equal(result.proposal.B.permission.category, 'not_permitted')
  assert.equal(result.proposal.B.eligible, false)
  assert.equal(result.proposal.B.total, null)
  assert.equal(result.after, null)
})

test('undo and redo restore the entire scenario including inputs and derived outcomes', () => {
  const input = inputFor(), baseline = evaluatePlanner(input)
  let history = historyFor(input.scenario)
  history = scenarioReducer(history, { type: 'set', key: 'additionalDepartures', value: 60 })
  history = scenarioReducer(history, { type: 'option', slot: 'B', value: { rent: 2000 } })
  const changed = history.present
  history = scenarioReducer(history, { type: 'undo' })
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(evaluatePlanner({ ...input, scenario: history.present }), baseline)
  history = scenarioReducer(history, { type: 'redo' })
  history = scenarioReducer(history, { type: 'redo' })
  assert.deepEqual(history.present, changed)
  history = scenarioReducer(history, { type: 'undo' })
  history = scenarioReducer(history, { type: 'set', key: 'additionalDepartures', value: 30 })
  assert.equal(history.future.length, 0)
})

test('massing rejects holes, concave crossings and silently scaled fits', () => {
  const outer = [[0, 0], [30, 0], [30, 30], [0, 30], [0, 0]]
  const hole = [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
  assert.equal(rectangleInside([[5, 5], [25, 5], [25, 25], [5, 25]], [outer, hole]), false)
  const concave = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30], [0, 0]]
  assert.equal(rectangleInside([[5, 5], [25, 5], [25, 25], [5, 25]], [concave]), false)
  const site = rectangleAt([-79.94, 40.41], 20, 30)
  assert.equal(fitMassing(site, 10, 15).fits, true)
  assert.equal(fitMassing(site, 35, 35).fits, false)
})

test('map properties are slim and exports preserve model, baseline and assumptions', () => {
  const input = inputFor()
  const slim = slimParcels({ type: 'FeatureCollection', features: [input.feature] })
  assert.equal(slim.features[0].properties.scores, undefined)
  assert.equal(slim.features[0].id, input.feature.properties.pin)
  const output = scenarioExport(input.scenario, { pulled_at: '2026-09-27' })
  assert.equal(output.dataVersion, '2026-09-27')
  assert.ok(output.modelVersion)
  assert.deepEqual(output.scenario, input.scenario)
})

test('automatic alignment follows a rotated parcel and manual rotation preserves the exact position', () => {
  const site = rectangleAt([-79.94, 40.41], 40, 60)
  const rotated = fitMassing(site, 20, 40, { east: 0, north: 0, bearing: 27 }, [])
  const automatic = fitMassing(rotated.geometry, 8, 16, null, [])
  assert.ok(automatic.fits)
  assert.ok(Math.abs(automatic.placement.bearing % 180 - 27) < .01)
  const placement = { ...automatic.placement, east: 2, north: -3, bearing: 42 }
  const manual = fitMassing(site, 8, 16, placement, [])
  assert.deepEqual(manual.placement, placement)
  assert.equal(manual.mode, 'manual')
  assert.ok(manual.fits)
  const outside = fitMassing(site, 8, 16, { ...placement, east: 100 }, [])
  assert.equal(outside.fits, false)
  assert.equal(outside.placement.east, 100)
  assert.ok(outside.geometry)
  const clicked = placementAt(site, [-79.94, 40.41], 42)
  assert.ok(Math.abs(clicked.east) < 1e-6 && Math.abs(clicked.north) < 1e-6)
  assert.equal(clicked.bearing, 42)
})

test('overlap checks detect containment and crossing but respect holes and disjoint polygons', () => {
  const outer = rectangleAt([-79.94, 40.41], 40, 40)
  const inner = rectangleAt([-79.94, 40.41], 10, 10)
  assert.equal(geometriesOverlap(outer, inner), true)
  assert.equal(geometriesOverlap(inner, outer), true)
  const hole = rectangleAt([-79.94, 40.41], 20, 20)
  assert.equal(geometriesOverlap({ type: 'Polygon', coordinates: [outer.coordinates[0], hole.coordinates[0]] }, inner), false)
  assert.equal(geometriesOverlap(outer, rectangleAt([-79.95, 40.42], 10, 10)), false)
  assert.equal(geometriesOverlap(rectangleAt([-79.94, 40.41], 4, 40), rectangleAt([-79.94, 40.41], 40, 4)), true)
})

test('mapped overlap or missing context withholds ranking, and placement history is reversible', () => {
  const input = inputFor()
  const obstacle = { type: 'Feature', properties: {}, geometry: input.feature.geometry }
  let result = evaluatePlanner({ ...input, existingBuildings: [obstacle] })
  assert.ok(result.proposal.A.massing.collisions > 0)
  assert.equal(result.proposal.A.scores.physical, 0)
  assert.equal(result.after, null)
  result = evaluatePlanner({ ...input, existingBuildings: null })
  assert.equal(result.proposal.A.scores.physical, null)
  assert.equal(result.after, null)
  let history = historyFor(input.scenario)
  history = scenarioReducer(history, { type: 'option', slot: 'B', value: { placement: { east: 100, north: 0, bearing: 15 } } })
  assert.equal(evaluatePlanner({ ...input, scenario: history.present }).proposal.B.massing.fits, false)
  history = scenarioReducer(history, { type: 'undo' })
  assert.equal(history.present.options.B.placement, null)
  history = scenarioReducer(history, { type: 'redo' })
  assert.equal(scenarioExport(history.present).scenario.options.B.placement.east, 100)
})

test('display height estimates never change recommendation scores or footprint collisions', () => {
  for (const example of EXAMPLES) {
    const input = inputFor(example.pin)
    const obstacle = { type: 'Feature', geometry: input.feature.geometry, properties: { height_m: 3.5, height_method: 'typology_estimate' } }
    const result = evaluatePlanner({ ...input, existingBuildings: [obstacle] })
    const taller = { ...obstacle, properties: { height_m: 30, height_method: 'osm_height' } }
    assert.deepEqual(evaluatePlanner({ ...input, existingBuildings: [taller] }), result)
    assert.ok(result.proposal.A.massing.collisions > 0)
  }
})
