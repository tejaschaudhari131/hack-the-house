import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { recordedEmptySite, screenEmptySite, prepareEmptySites } from './emptySites.js'
import { geometryBounds, rectangleAt } from './plannerGeometry.js'
import { spatialIndex } from './studioData.js'
import { preparedEmptySiteIndex } from './emptySiteData.js'
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
    const precomputed = prepareEmptySites({ features: [f] }, zoning, buildings)
    assert.deepEqual(precomputed.matches, candidate ? [candidate] : [])
    const prepared = preparedEmptySiteIndex({ ...chunk([f], context), emptySites: precomputed })
    assert.deepEqual(prepared.query(geometryBounds(f.geometry)), precomputed.matches)
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

test('prepared candidates are spatially culled without altering geometry or running a new screen', () => {
  const a = feature(), b = feature({ pin: 'remote' }, rectangleAt([-80, 40.5], 35, 50))
  const data = chunk([a, b])
  data.emptySites = prepareEmptySites(data.parcels, zoning, spatialIndex([]))
  const index = preparedEmptySiteIndex(data)
  assert.equal(index.query(geometryBounds(a.geometry))[0], data.emptySites.matches[0])
  assert.deepEqual(index.query(geometryBounds(b.geometry)), [data.emptySites.matches[1]])
  assert.deepEqual(index.query([-79, 40, -78, 41]), [])
})

test('missing, stale or mismatched prepared evidence fails closed instead of claiming no candidates', () => {
  const data = chunk([feature()])
  assert.throws(() => preparedEmptySiteIndex(data), /unavailable/)
  assert.throws(() => preparedEmptySiteIndex({ ...data, emptySites: { version: 99, matches: [] } }), /unavailable/)
  for (const matches of [[{ pin: 'elsewhere', typeId: 'single_family' }], [{ pin: 'site', typeId: 'unknown-type' }], [{ pin: 'site', typeId: 'single_family' }, { pin: 'site', typeId: 'triplex' }]]) {
    assert.throws(() => preparedEmptySiteIndex({ ...data, emptySites: { version: 1, matches } }), /do not match/)
  }
  assert.deepEqual(preparedEmptySiteIndex({ ...data, emptySites: { version: 1, matches: [] } }).query(geometryBounds(data.parcels.features[0].geometry)), [])
})
