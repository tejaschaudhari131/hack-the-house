import test from 'node:test'
import assert from 'node:assert/strict'
import { renderViewport, hasMapDetail, containsBounds, visibleNeighborhoods, createNeighborhoodDisplay } from './studioData.js'

test('nearby camera movement retains buffered geometry; larger pans and zoom-ins release it', () => {
  const initial = renderViewport(null, { zoom: 17, bounds: [0, 0, 1, 1] })
  assert.ok(containsBounds(initial.bounds, [-.2, -.2, 1.2, 1.2]))
  const jitter = renderViewport(initial, { zoom: 16.9, bounds: [-.1, -.1, 1.1, 1.1] })
  assert.equal(jitter.bounds, initial.bounds, 'small zooms do not requery and patch every feature')
  const pan = renderViewport(jitter, { zoom: 17, bounds: [.5, 0, 1.5, 1] })
  assert.notEqual(pan.bounds, initial.bounds)
  assert.ok(containsBounds(pan.bounds, [.5, 0, 1.5, 1]))
  const close = renderViewport(pan, { zoom: 20, bounds: [.7, .2, .8, .3] })
  assert.notEqual(close.bounds, pan.bounds, 'a close view does not keep neighborhood-scale geometry')
  assert.ok(close.bounds[2] - close.bounds[0] < .2)
})

test('detail survives cutoff jitter but clears at overview and returns without another pan', () => {
  const bounds = [0, 0, 1, 1]
  let view = renderViewport(null, { zoom: 13.9, bounds })
  assert.equal(hasMapDetail(view), false, 'cold overview does not fetch detail')
  for (const zoom of [14, 13.99, 14.01, 13.6, 13.5]) {
    view = renderViewport(view, { zoom, bounds })
    assert.equal(hasMapDetail(view), true, `retain detail at ${zoom}`)
  }
  view = renderViewport(view, { zoom: 13.49, bounds })
  assert.equal(hasMapDetail(view), false)
  view = renderViewport(view, { zoom: 13.9, bounds })
  assert.equal(hasMapDetail(view), false)
  assert.equal(hasMapDetail(renderViewport(view, { zoom: 17, bounds })), true)
})

test('live cached detail can return while the last settled request remains an overview', () => {
  const manifest = { neighborhoods: [
    { id: 'a', neighbors: ['b'], bounds: [0, 0, 1, 1] },
    { id: 'b', neighbors: ['a', 'c'], bounds: [1, 0, 2, 1] },
    { id: 'c', neighbors: ['b'], bounds: [2, 0, 3, 1] },
  ] }
  const building = { type: 'Feature', properties: { id: 'home', display_neighborhoods: ['a'], height_m: 12.345 }, geometry: { type: 'Polygon', coordinates: [[[.2,.2],[.3,.2],[.3,.3],[.2,.3],[.2,.2]]] } }
  const chunks = new Map([['a', { parcels: { features: [] }, buildings: { features: [building] } }]])
  const display = createNeighborhoodDisplay()
  const settled = renderViewport(null, { zoom: 13, bounds: [-1, -1, 4, 2] })
  assert.deepEqual(visibleNeighborhoods(manifest, settled, 'a'), [])
  assert.deepEqual(display.get(chunks, []).buildingIndex.query(settled.bounds), [])
  const moving = renderViewport(settled, { zoom: 14.1, bounds: [0, 0, 3, 1] })
  const ids = visibleNeighborhoods(manifest, moving, 'a')
  assert.deepEqual(ids, ['a', 'b'], 'buffer cannot pull in neighbors of neighbors')
  const returned = display.get(chunks, ids).buildingIndex.query(moving.bounds)
  assert.deepEqual(returned, [building])
  assert.equal(returned[0], building, 'render selection preserves exact geometry and height')
  assert.deepEqual(visibleNeighborhoods(manifest, settled, 'a'), [], 'no new download scope until settling')
})
