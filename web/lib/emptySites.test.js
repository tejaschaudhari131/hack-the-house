import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { gunzipSync } from 'node:zlib'
import { recordedEmptySite, screenEmptySite, emptySiteChunk, emptySiteIndex } from './emptySites.js'
import { geometryBounds, rectangleAt } from './plannerGeometry.js'
import { spatialIndex } from './studioData.js'
import { evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario, optionFor } from './plannerState.js'

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)))
const zoning = read('zoning.json')
const feature = (properties = {}, geometry = rectangleAt([-79.94, 40.41], 35, 50)) => ({ type: 'Feature', geometry, properties: { pin: 'site', vacant_lot: true, land_use: 'VACANT LAND', zoning_code: 'RM-M', lot_sqft: 10000, ...properties } })
const chunk = (parcels, buildings = []) => ({ parcels: { features: parcels }, buildings: { features: buildings } })

test('only affirmative, noncontradictory vacancy evidence can qualify', () => {
  for (const vacant_lot of [false, null, undefined, 'true']) assert.equal(recordedEmptySite(feature({ vacant_lot }).properties), false)
  for (const land_use of ['SINGLE FAMILY', 'MUNICIPAL GOVERNMENT', 'PUBLIC PARK', 'RIGHT OF WAY']) assert.equal(recordedEmptySite(feature({ land_use }).properties), false)
  assert.equal(recordedEmptySite(feature({ city_open_space: true }).properties), false)
  assert.equal(recordedEmptySite(feature({ land_use: 'VACANT COMMERCIAL LAND' }).properties), true)
  assert.equal(recordedEmptySite(feature({ land_use: null }).properties), true, 'affirmative City vacancy flag can qualify when the assessment use is missing')
  assert.equal(screenEmptySite(feature({ lot_sqft: null }), zoning, []), null)
  assert.equal(screenEmptySite(feature(), zoning, null), null, 'missing building evidence is not an empty layer')
})

test('vacancy does not override footprint, physical fit or supported zoning conflicts', () => {
  assert.equal(screenEmptySite(feature(), zoning, [{ geometry: rectangleAt([-79.94, 40.41], 2, 2) }]), null, 'even a small footprint excludes an empty-site candidate')
  assert.equal(screenEmptySite(feature({}, rectangleAt([-79.94, 40.41], 4, 5)), zoning, []), null)
  assert.equal(screenEmptySite(feature({ lot_sqft: 1 }), zoning, []), null, 'minimum lot area is a supported conflict')
  for (const zoning_code of ['GI', 'UI', 'SP-10', 'UNKNOWN', null]) assert.equal(screenEmptySite(feature({ zoning_code }), zoning, []), null, `${zoning_code}: prohibited, special or unknown use is not by-right permission`)
  assert.equal(screenEmptySite(feature(), zoning, []).typeId, 'single_family')
  assert.equal(screenEmptySite(feature({ sfha_overlap: .5 }), zoning, []).typeId, 'single_family', 'a hazard review signal alone does not invent a legal prohibition')
})

test('worker input preserves exact geometry, drops scores, and keeps boundary collision context', () => {
  const f = feature({ scores: { arbitrary: 70 } })
  const borderBuilding = { geometry: rectangleAt([-79.94, 40.41], 2, 2), properties: { display_neighborhoods: ['neighbor'] } }
  const input = emptySiteChunk(chunk([f, feature({ pin: 'occupied', land_use: 'SINGLE FAMILY' })], [borderBuilding]))
  assert.equal(input.parcels.length, 1)
  assert.equal(input.parcels[0].geometry, f.geometry)
  assert.equal(input.parcels[0].properties.scores, undefined)
  assert.equal(input.buildings[0].geometry, borderBuilding.geometry)
  assert.deepEqual([...emptySiteIndex(input, zoning).query(geometryBounds(f.geometry))], [null])
  assert.deepEqual([...emptySiteIndex(emptySiteChunk({ parcels: { features: [f] } }), zoning).query(geometryBounds(f.geometry))], [null])
})

test('viewport query reuses cached results and excludes distant parcels', () => {
  const a = feature(), b = feature({ pin: 'distant' }, rectangleAt([-80, 40.5], 35, 50))
  const index = emptySiteIndex(emptySiteChunk(chunk([a, b])), zoning)
  const first = [...index.query(geometryBounds(a.geometry))]
  assert.equal(first.length, 1)
  assert.equal(first[0].pin, 'site')
  assert.equal([...index.query(geometryBounds(a.geometry))][0], first[0])
  assert.deepEqual([...index.query([-79, 40, -78, 41])], [])
})

test('real sites match the Studio physical/zoning gates and exclude recorded-vacant footprint conflicts', () => {
  // Canonical snapshots are stable while cityData.test regenerates transport chunks.
  const source = name => JSON.parse(gunzipSync(readFileSync(new URL(`../../pipeline/data/processed/${name}.gz`, import.meta.url))))
  const buildings = spatialIndex(source('existing-buildings.geojson').features)
  for (const [id, pin, expected] of [
    ['hazelwood', '0056F00338000000', true], ['hazelwood', '0056G00082000000', false],
    ['middle-hill', '0010G00045000000', true], ['east-liberty', '0083F00297000000', true],
    ['squirrel-hill-north', '0085L00096000000', true], ['brookline', '0062S00279000000', true],
    ['homewood-south', '0174S00040000000', false], ['arlington', '0031F00080000000', false],
  ]) {
    const parcels = source(`parcels/${id}.geojson`).features
    const f = parcels.find(f => f.properties.pin === pin)
    const context = buildings.query(geometryBounds(f.geometry))
    const candidate = screenEmptySite(f, zoning, context)
    assert.equal(!!candidate, expected, `${id} ${pin}`)
    if (candidate) {
      const scenario = initialStudioScenario(pin, f.properties)
      scenario.draft = optionFor(candidate.typeId, scenario.draft.rent)
      const result = evaluatePlanner({ feature: f, zoning, scenario, stop: null, existingBuildings: context }).proposal[candidate.typeId]
      assert.equal(result.eligible, true, `${pin} must pass the actual Studio gate`)
      assert.ok(Number.isFinite(result.total), `${pin} has a housing score`)
    }
  }
})

test('background worker discards stale searches, evicts old neighborhoods, and clears at overview zoom', async t => {
  const workerUrl = new URL('../workers/emptySites.worker.js', import.meta.url).href
  const worker = new Worker(`const { parentPort } = require('node:worker_threads'); global.self = { postMessage: data => parentPort.postMessage(data) }; import(${JSON.stringify(workerUrl)}).then(() => { parentPort.on('message', data => self.onmessage({data})); parentPort.postMessage({ready:true}); });`, { eval: true })
  t.after(() => worker.terminate())
  await once(worker, 'message')
  worker.postMessage({ type: 'init', zoning })
  const features = Array.from({ length: 36 }, (_, i) => feature({ pin: `site-${i}` }))
  const data = emptySiteChunk(chunk(features)), bounds = geometryBounds(features[0].geometry)
  const response = once(worker, 'message')
  worker.postMessage({ revision: 1, chunks: [['first', data]], ids: ['first'], bounds })
  worker.postMessage({ revision: 2, chunks: [], ids: [], bounds })
  assert.deepEqual((await response)[0], { revision: 2, matches: [] }, 'a new scope cancels the old long query')
  let next = once(worker, 'message')
  worker.postMessage({ revision: 3, chunks: [], ids: ['first'], bounds })
  assert.deepEqual((await next)[0].matches, [], 'evicted data cannot reappear without reloading')
  next = once(worker, 'message')
  worker.postMessage({ revision: 4, chunks: [['first', data]], ids: ['first'], bounds })
  assert.equal((await next)[0].matches.length, 36)
  next = once(worker, 'message')
  worker.postMessage({ revision: 5, chunks: [], ids: [], bounds: null })
  assert.deepEqual((await next)[0].matches, [])
})
