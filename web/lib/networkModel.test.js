import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { prepareNetwork, nearestNode, shortestPaths, networkAccess, validateConnection, validatePark, infrastructureReservations } from './networkModel.js'
import { rectangleAt } from './plannerGeometry.js'
import { initialScenario, EXAMPLES, scenarioReducer, historyFor } from './plannerState.js'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'

const nodes = [[-79.94, 40.41], [-79.94, 40.412], [-79.938, 40.412], [-79.938, 40.41], [-79.939, 40.409], [-79.939, 40.411]]
const network = { nodes, ground: [1, 1, 1, 1, 1, 1], edges: [[0, 1, 3], [1, 0, 3], [1, 2, 2], [2, 1, 2], [2, 3, 3], [3, 2, 3], [4, 5, 3], [5, 4, 3]], parks: [{ id: 'park', name: 'Existing park', nodes: [3] }] }
const prepared = prepareNetwork(network)
const feature = { type: 'Feature', geometry: rectangleAt(nodes[0], 40, 40), properties: {} }
const stop = { coordinates: nodes[3], weekday_trips: 80, distance: 100 }
const connection = { id: 'shortcut', from: 0, to: 3, kind: 'path', width: 3 }

test('network uses topology, ignores line crossings and rejects invalid connections', () => {
  assert.equal(shortestPaths(prepared, 0).distances[3], 8)
  assert.equal(shortestPaths(prepared, 0).distances[5], Infinity)
  assert.ok(shortestPaths(prepared, 0, [connection]).distances[3] < 3)
  assert.equal(validateConnection(network, connection), null)
  for (const bad of [{ ...connection, from: 999 }, { ...connection, to: 0 }, { ...connection, width: -1 }, { ...connection, kind: 'motorway' }]) {
    assert.ok(validateConnection(network, bad))
    assert.equal(shortestPaths(prepared, 0, [bad]).distances[3], 8)
  }
  assert.equal(nearestNode({ ...network, ground: [0, 0, 0, 0, 0, 0] }, nodes[0]), null)
})

test('baseline is immutable, undo restores access, and a disconnected park adds no access', () => {
  const scenario = { ...initialScenario('test'), accessMode: 'network' }, frozen = JSON.stringify(network)
  const before = networkAccess(prepared, feature, stop, scenario, false)
  let history = historyFor(scenario)
  history = scenarioReducer(history, { type: 'set', key: 'connections', value: [connection] })
  const after = networkAccess(prepared, feature, stop, history.present, true)
  assert.ok(after.walkMinutes < before.walkMinutes)
  assert.ok(after.parkMinutes < before.parkMinutes)
  assert.deepEqual(networkAccess(prepared, feature, stop, history.present, false), before)
  history = scenarioReducer(history, { type: 'undo' })
  assert.deepEqual(networkAccess(prepared, feature, stop, history.present, true), before)
  const park = { id: 'new', node: 4, coordinates: nodes[4], width: 20, depth: 20 }
  assert.equal(validatePark(network, park), null)
  assert.equal(networkAccess(prepared, feature, stop, { ...scenario, parks: [park] }, true).parkMinutes, before.parkMinutes)
  assert.equal(JSON.stringify(network), frozen)
})

test('parks only affect access and reserved land under explicit preference inputs', () => {
  const scenario = { ...initialScenario('test'), accessMode: 'network', parkAccessShare: 50 }
  const park = { id: 'new', node: 0, coordinates: nodes[0], width: 5, depth: 5 }
  const input = { feature, stop, scenario, zoning: {}, existingBuildings: [], networkContext: prepared }
  const original = evaluatePlanner(input)
  const result = evaluatePlanner({ ...input, scenario: { ...scenario, parks: [park] } })
  assert.ok(result.proposal.A.scores.access > original.proposal.A.scores.access)
  for (const id of ['demand', 'affordability', 'displacement', 'carbon']) assert.equal(result.proposal.A.scores[id], original.proposal.A.scores[id])
  assert.equal(infrastructureReservations(network, { parks: [park] }).length, 1)
  const occupied = evaluatePlanner({ ...input, scenario: { ...scenario, parks: [{ ...park, width: 80, depth: 80 }] } })
  assert.equal(occupied.baseline.A.massing.collisions, 0)
  assert.ok(occupied.proposal.A.massing.collisions > 0)
  assert.equal(occupied.proposal.A.eligible, false)
})

test('missing or disconnected network produces unknown transit rather than straight-line fallback', () => {
  const scenario = { ...initialScenario('test'), accessMode: 'network' }
  assert.equal(networkAccess(null, feature, stop, scenario).available, false)
  assert.equal(networkAccess(prepared, feature, { ...stop, coordinates: nodes[5] }, scenario).walkMinutes, null)
  const result = evaluatePlanner({ feature, zoning: {}, scenario, stop, existingBuildings: [] })
  assert.equal(result.baseline.A.service, null)
  assert.equal(result.baseline.A.scores.access, null)
  for (const networkContext of [null, prepared]) {
    const invalid = evaluatePlanner({ feature, zoning: {}, scenario: { ...scenario, connections: [{ ...connection, from: 999 }] }, stop, existingBuildings: [], networkContext })
    assert.equal(invalid.after, null)
    assert.equal(invalid.proposal.A.scores.physical, null)
    assert.equal(invalid.proposal.A.eligible, false)
    assert.ok(invalid.infrastructureErrors.length)
  }
})

test('real study examples have reproducible routed access and a hash-matched network', () => {
  const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)))
  const raw = readFileSync(new URL('../public/data/walking-network.json', import.meta.url))
  const actual = JSON.parse(raw), manifest = read('walking-network.sources.json')
  assert.equal(createHash('sha256').update(raw).digest('hex'), manifest.sha256)
  assert.equal(actual.nodes.length, manifest.counts.nodes)
  const ctx = prepareNetwork(actual), parcels = read('parcels.geojson'), stops = read('stops.geojson')
  for (const example of EXAMPLES) {
    const f = parcels.features.find(f => f.properties.pin === example.pin), s = preferredStop(nearbyStops(f, stops)), state = initialScenario(example.pin)
    const baseline = networkAccess(ctx, f, s, state)
    assert.ok(baseline.walkMinutes > 0 && baseline.parkMinutes > 0)
    assert.ok(baseline.route.length > 2)
    assert.deepEqual(networkAccess(ctx, f, s, state, true), baseline)
  }
})
