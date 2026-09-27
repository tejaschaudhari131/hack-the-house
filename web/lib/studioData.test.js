import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { partitionStudioData } from '../scripts/prepare-studio-data.mjs'
import { DETAIL_ZOOM, visibleNeighborhoods, mergeNeighborhoods, retainNeighborhoods, spatialIndex, neighborhoodAdjacency, displayBuildings, sameFeatureSet } from './studioData.js'
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
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: [-81, 39, -74, 43], zoom: DETAIL_ZOOM - .01 }, hazelwood.id), [])
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: geometryBounds(originals.get(EXAMPLES[0].pin).geometry), zoom: 17 }, hazelwood.id), [hazelwood.id])
  assert.deepEqual(visibleNeighborhoods(manifest, { bounds: [-77, 40, -76, 41], zoom: 17 }, hazelwood.id), [])
})

test('cache eviction retains active-plan evidence and recent neighborhoods', () => {
  const cache = new Map(Array.from({ length: 10 }, (_, i) => [String(i), i]))
  assert.deepEqual([...retainNeighborhoods(cache, ['0', '1'], 4).keys()], ['0', '1', '8', '9'])
  assert.equal(retainNeighborhoods(cache, [...cache.keys()], 4).size, 10)
  assert.equal(cache.size, 10, 'eviction does not mutate a rendered snapshot')
})

test('a wide view can load only the selected neighborhood and directly adjoining neighbors', () => {
  const square = (name, x) => ({ type:'Feature', properties:{name}, geometry:{type:'Polygon',coordinates:[[[x,0],[x+1,0],[x+1,1],[x,1],[x,0]]]} })
  const features = [square('A',0),square('B',1),square('C',2),square('Remote',10)]
  const adjacency = neighborhoodAdjacency({features})
  const m = {neighborhoods:features.map(f=>({id:f.properties.name.toLowerCase(),neighbors:adjacency[f.properties.name.toLowerCase()],bounds:geometryBounds(f.geometry)}))}
  assert.deepEqual(visibleNeighborhoods(m,{zoom:14,bounds:[-1,-1,20,20]},'a'),['a','b'])
  assert.deepEqual(visibleNeighborhoods(m,{zoom:17,bounds:[.1,.1,.9,.9]},'a'),['a'])
  assert.deepEqual(visibleNeighborhoods(m,{zoom:17,bounds:[10,0,11,1]},'a'),[])
  assert.deepEqual(visibleNeighborhoods(m,{zoom:13,bounds:[-1,-1,20,20]},'a'),[])
  assert.deepEqual(visibleNeighborhoods(m,{zoom:17,bounds:[-1,-1,20,20]},'remote'),['remote'])
  assert.deepEqual(visibleNeighborhoods(m,{zoom:17,bounds:[-1,-1,20,20]},'missing'),[])
})

test('display culling preserves full-resolution features and ignores remote collision context', () => {
  const a={properties:{display_neighborhoods:['a'],height_m:12.345},geometry:buildings.features[0].geometry}
  const b={properties:{display_neighborhoods:['b']},geometry:buildings.features[1].geometry}
  const cross={properties:{display_neighborhoods:['a','b']},geometry:buildings.features[2].geometry}
  const evidence={features:[a,b,cross]}
  const visible=displayBuildings(evidence,['a'])
  assert.deepEqual(visible.features,[a,cross])
  assert.equal(visible.features[0],a,'original geometry and height references are retained')
  assert.equal(evidence.features.length,3,'collision evidence is unchanged')
  assert.deepEqual(displayBuildings(evidence,[]).features,[])
  assert.ok(sameFeatureSet([a,cross],[cross,a]),'camera traversal order does not need another upload')
  assert.ok(!sameFeatureSet([a,cross],[a,b]))
  assert.ok(!sameFeatureSet([a],[{...a}]),'revised feature objects must upload')
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
    assert.deepEqual(visibleNeighborhoods(manifest, { zoom: 10, bounds }, chunk.id), [])
    const kept = retainNeighborhoods(new Map(chunks.map(c => [c.id, c.data])), [chunk.id], 1)
    assert.deepEqual(evaluatePlanner({ ...input, existingBuildings: spatialIndex(kept.get(chunk.id).buildings.features).query(bounds) }), expected)
  }
})
