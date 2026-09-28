import test from 'node:test'
import assert from 'node:assert/strict'
import { mapSourceDiff } from './mapSourceDiff.js'
import { GeoJSONVT } from '@maplibre/geojson-vt'

const feature = (pin, height = 12.3456789) => ({ type: 'Feature', properties: { pin, height }, geometry: { type: 'Polygon', coordinates: [[[-79.923456789,40.412345678],[-79.923556789,40.412345678],[-79.923556789,40.412445678],[-79.923456789,40.412345678]]] } })
function apply(map, diff) {
  if (!diff) return
  if (diff.removeAll) map.clear()
  for (const id of diff.remove || []) map.delete(id)
  for (const f of diff.add || []) map.set(f.properties.pin, structuredClone(f))
  for (const change of diff.update || []) {
    const f = map.get(change.id)
    if (change.newGeometry) f.geometry = structuredClone(change.newGeometry)
    if (change.removeAllProperties) f.properties = {}
    for (const key of change.removeProperties || []) delete f.properties[key]
    for (const { key, value } of change.addOrUpdateProperties || []) f.properties[key] = value
  }
}

test('camera changes send only added/removed features and preserve exact geometry and heights', () => {
  const a = feature('a'), b = feature('b'), c = feature('c')
  const first = mapSourceDiff(undefined, [a, b], 'pin'), rendered = new Map()
  apply(rendered, first.diff)
  const next = mapSourceDiff(first.next, [b, c], 'pin')
  assert.deepEqual(next.diff, { add: [c], remove: ['a'] })
  assert.equal(next.diff.add[0], c)
  apply(rendered, next.diff)
  assert.deepEqual([...rendered.values()], [b, c])
  assert.equal(mapSourceDiff(next.next, [c, b], 'pin').diff, null, 'camera traversal order is not an update')
})

test('updates replace changed geometry and remove obsolete properties; overview clears everything', () => {
  const original = feature(0), first = mapSourceDiff(undefined, [original], 'pin'), rendered = new Map()
  apply(rendered, first.diff)
  const changed = { ...original, geometry: { type: 'Point', coordinates: [-79.9456789123, 40.4156789123] }, properties: { pin: 0, classification: 'updated' } }
  const next = mapSourceDiff(first.next, [changed], 'pin')
  assert.equal(next.diff.update[0].newGeometry, changed.geometry)
  apply(rendered, next.diff)
  assert.deepEqual(rendered.get(0), changed)
  const clear = mapSourceDiff(next.next, [], 'pin')
  assert.deepEqual(clear.diff, { removeAll: true })
  apply(rendered, clear.diff)
  assert.equal(rendered.size, 0)
  const restore = mapSourceDiff(clear.next, [original], 'pin')
  apply(rendered, restore.diff)
  assert.deepEqual(rendered.get(0), original, 'zooming back in restores exact data')
})

test('promoted building and road IDs are supported and duplicate/missing IDs cannot silently drop features', () => {
  const road = { ...feature('unused'), properties: { id: '5:9' }, geometry: { type: 'LineString', coordinates: [[-79.9,40.4],[-79.95,40.45]] } }
  assert.deepEqual(mapSourceDiff(undefined, [road], 'id').diff, { add: [road] })
  assert.throws(() => mapSourceDiff(undefined, [feature('a'), feature('a')], 'pin'), /unique/)
  assert.throws(() => mapSourceDiff(undefined, [feature(undefined)], 'pin'), /unique/)
})

test('real MapLibre tiler retains IDs, heights and colours when a cached chunk replaces a feature', () => {
  const original = feature('home'), first = mapSourceDiff(undefined, [original], 'pin')
  const tiler = new GeoJSONVT({ type: 'FeatureCollection', features: [] }, { promoteId: 'pin', updateable: true, maxZoom: 20, tolerance: 0 })
  tiler.updateData(first.diff)
  // The same building arrives as a different object from an overlapping chunk.
  const replacement = structuredClone(original)
  replacement.properties.use_color = '#abcdef'
  const next = mapSourceDiff(first.next, [replacement], 'pin')
  tiler.updateData(next.diff)
  const [lng, lat] = original.geometry.coordinates[0][0], z = 18, scale = 2 ** z
  const x = Math.floor((lng + 180) / 360 * scale)
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale)
  const tileFeature = () => tiler.getTile(z, x, y).features.find(f => f.tags.pin === 'home')
  assert.deepEqual(tileFeature()?.tags, replacement.properties, 'worker tiles must retain promoted ID and extrusion height')
  const changed = { ...replacement, properties: { pin: 'home', height: 22.3456789 } }
  tiler.updateData(mapSourceDiff(next.next, [changed], 'pin').diff)
  assert.deepEqual(tileFeature()?.tags, changed.properties, 'removed colours cannot persist on rendered tiles')
})
