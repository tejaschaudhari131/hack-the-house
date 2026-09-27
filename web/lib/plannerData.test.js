import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compactPlannerParcels, PLANNER_PROPERTIES, PLANNER_SCORES } from './plannerData.js'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'
import { initialScenario, EXAMPLES } from './plannerState.js'
import { prepareNetwork } from './networkModel.js'
import { geometryBounds, boundsOverlap, slimParcels } from './plannerGeometry.js'

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)))
const source = read('parcels.geojson'), compact = compactPlannerParcels(source)

test('compact view retains every parcel, exact geometry, evidence fields and model input', () => {
  assert.equal(compact.features.length, source.features.length)
  source.features.forEach((f, index) => {
    const c = compact.features[index]
    assert.deepEqual(c.geometry, f.geometry)
    for (const key of PLANNER_PROPERTIES) assert.deepEqual(c.properties[key], f.properties[key])
    for (const [type, scores] of Object.entries(f.properties.scores)) for (const key of PLANNER_SCORES) assert.equal(c.properties.scores[type][key], scores[key])
  })
  assert.deepEqual(slimParcels(compact), slimParcels(source))
  assert.ok(JSON.stringify(compact).length < JSON.stringify(source).length * .55)
})

test('compact view gives identical seven-factor results for both real examples and a service scenario', () => {
  const zoning = read('zoning.json'), stops = read('stops.geojson'), buildings = read('existing-buildings.geojson'), networkContext = prepareNetwork(read('walking-network.json'))
  // Raw legacy score fields are deliberately not returned in the studio view.
  const comparisons = result => Object.fromEntries(['baseline', 'proposal'].map(state => [state, Object.fromEntries(['A', 'B'].map(slot => { const { raw, ...o } = result[state][slot]; return [slot, o] }))]))
  for (const example of EXAMPLES) for (const additionalDepartures of [0, 60]) {
    const index = source.features.findIndex(f => f.properties.pin === example.pin), feature = source.features[index]
    const stop = preferredStop(nearbyStops(feature, stops)), scenario = { ...initialScenario(example.pin, feature.properties, String(stop.stop_id)), accessMode: 'network', additionalDepartures, spareBoardings: 3 }
    assert.deepEqual(initialScenario(example.pin, compact.features[index].properties, String(stop.stop_id)), initialScenario(example.pin, feature.properties, String(stop.stop_id)))
    const existingBuildings = buildings.features.filter(b => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(b.geometry)))
    const input = { feature, stop, scenario, existingBuildings, zoning, networkContext }
    const a = evaluatePlanner(input), b = evaluatePlanner({ ...input, feature: compact.features[index] })
    assert.deepEqual(comparisons(a), comparisons(b))
    assert.equal(a.after, b.after)
    assert.equal(a.explanation, b.explanation)
  }
})
