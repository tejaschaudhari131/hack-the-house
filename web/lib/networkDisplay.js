import { segmentTouchesPolygon } from './plannerGeometry.js'
import { neighborhoodId, spatialIndex } from './studioData.js'

/** Reuse the loaded graph for display; no second multi-megabyte roads download. */
const displays = new WeakMap()
export function networkDisplayIndex(network, neighborhoods) {
  if (!displays.has(network)) displays.set(network, new WeakMap())
  const cache = displays.get(network)
  if (!cache.has(neighborhoods)) cache.set(neighborhoods, buildNetworkDisplay(network, neighborhoods))
  return cache.get(neighborhoods)
}

function buildNetworkDisplay(network, neighborhoods) {
  const unique = new Map(), boundaryIndex = spatialIndex(neighborhoods.features), membership = new WeakMap()
  for (const [a, b] of network.edges) {
    const id = a < b ? `${a}:${b}` : `${b}:${a}`
    if (!unique.has(id)) unique.set(id, { type: 'Feature', properties: { id }, geometry: { type: 'LineString', coordinates: [network.nodes[a], network.nodes[b]] } })
  }
  const boundsFor = f => {
    const [a, b] = f.geometry.coordinates
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
  }
  const index = spatialIndex([...unique.values()], .002, boundsFor)
  return {
    query(bounds, visibleIds) {
      if (!visibleIds.length) return []
      const visible = new Set(visibleIds)
      return index.query(bounds).filter(f => {
        if (!membership.has(f)) membership.set(f, boundaryIndex.query(boundsFor(f))
          .filter(n => segmentTouchesPolygon(...f.geometry.coordinates, n.geometry)).map(n => neighborhoodId(n.properties.name)))
        return membership.get(f).some(id => visible.has(id))
      })
    },
  }
}
