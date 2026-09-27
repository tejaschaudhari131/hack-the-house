import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { partitionStudioData } from '../scripts/prepare-studio-data.mjs'
import { DETAIL_ZOOM, visibleNeighborhoods, mergeNeighborhoods, retainNeighborhoods, spatialIndex } from './studioData.js'
import { geometryBounds, boundsOverlap } from './plannerGeometry.js'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'
import { EXAMPLES, initialStudioScenario } from './plannerState.js'
import { prepareNetwork } from './networkModel.js'

const read = name => JSON.parse(readFileSync(new URL(`../testdata/study/${name}`, import.meta.url)))
const parcels = read('parcels.geojson'), buildings = read('existing-buildings.geojson'), neighborhoods = read('neighborhoods.geojson')
const { manifest, chunks } = partitionStudioData(parcels, buildings, neighborhoods)
const originals = new Map(parcels.features.map(f => [f.properties.pin, f]))

test('neighborhood transport retains every original parcel and all recorded building geometry', () => {
  const joined = mergeNeighborhoods(chunks.map(c => c.data), 'parcels')
  assert.equal(joined.features.length, parcels.features.length)
  for (const f of joined.features) assert.deepEqual(f, originals.get(f.properties.pin))
  assert.equal(manifest.catalogue.length, parcels.features.length)
  const joinedBuildings = new Map(mergeNeighborhoods(chunks.map(c => c.data), 'buildings').features.map(f => [f.properties.id, f]))
  assert.equal(joinedBuildings.size, buildings.features.length)
  for (const f of buildings.features) assert.deepEqual(joinedBuildings.get(f.properties.id).geometry, f.geometry)
})

test('each parcel keeps every possible recorded collision, including boundaries and unmatched footprints', () => {
  const full = spatialIndex(buildings.features)
  for (const chunk of chunks) {
    const local = spatialIndex(chunk.data.buildings.features)
    for (const parcel of chunk.data.parcels.features) {
      const bounds = geometryBounds(parcel.geometry), ids = features => features.map(f => f.properties.id).sort()
      assert.deepEqual(ids(local.query(bounds)), ids(full.query(bounds)), parcel.properties.pin)
    }
  }
})

test('spatial index matches brute-force overlap at parcel and regional scales', () => {
  const index = spatialIndex(buildings.features), indexed = buildings.features.map(f => ({ f, b: geometryBounds(f.geometry) }))
  const queries = [...parcels.features.filter((_, i) => i % 200 === 0).map(f => geometryBounds(f.geometry)), [-81, 39, -74, 43], [-79, 40, -78.99, 40.01]]
  for (const box of queries) assert.deepEqual(index.query(box).map(f => f.properties.id).sort(), indexed.filter(f => boundsOverlap(box, f.b)).map(f => f.f.properties.id).sort())
})

test('overview requests no detailed chunks; neighborhood views only request intersecting data', () => {
  const hazelwood = manifest.neighborhoods.find(n => n.name === 'Hazelwood')
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: [-81, 39, -74, 43], zoom: DETAIL_ZOOM - .01 }), [])
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: geometryBounds(originals.get(EXAMPLES[0].pin).geometry), zoom: 17 }), [hazelwood.id])
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: [-77, 40, -76, 41], zoom: 17 }), [])
})

test('cache eviction retains active-plan evidence and recent neighborhoods', () => {
  const cache = new Map(Array.from({ length: 10 }, (_, i) => [String(i), i]))
  assert.deepEqual([...retainNeighborhoods(cache, ['0', '1'], 4).keys()], ['0', '1', '8', '9'])
  assert.equal(retainNeighborhoods(cache, [...cache.keys()], 4).size, 10)
  assert.equal(cache.size, 10, 'eviction does not mutate a rendered snapshot')
})

test('chunked evidence produces identical housing results before and after camera culling', () => {
  const zoning = read('zoning.json'), stops = read('stops.geojson'), networkContext = prepareNetwork(read('walking-network.json'))
  const full = spatialIndex(buildings.features)
  for (const example of EXAMPLES) {
    const feature = originals.get(example.pin), stop = preferredStop(nearbyStops(feature, stops))
    const scenario = { ...initialStudioScenario(example.pin, feature.properties, String(stop.stop_id)), accessMode: 'network', comparisonTypes: ['single_family', 'triplex', 'small_apartment', 'large_apartment'], additionalDepartures: 60, spareBoardings: 3 }
    const bounds = geometryBounds(feature.geometry), chunk = chunks.find(c => c.data.parcels.features.some(f => f.properties.pin === example.pin))
    const input = { feature, scenario, stop, zoning, networkContext }
    const expected = evaluatePlanner({ ...input, existingBuildings: full.query(bounds) })
    assert.deepEqual(evaluatePlanner({ ...input, existingBuildings: spatialIndex(chunk.data.buildings.features).query(bounds) }), expected)
    // At overview there is no rendered building collection, but plan evidence is retained.
    assert.deepEqual(visibleNeighborhoods(manifest, { zoom: 10, bounds }), [])
    const kept = retainNeighborhoods(new Map(chunks.map(c => [c.id, c.data])), [chunk.id], 1)
    assert.deepEqual(evaluatePlanner({ ...input, existingBuildings: spatialIndex(kept.get(chunk.id).buildings.features).query(bounds) }), expected)
  }
})
