import { boundsOverlap, geometryBounds } from './plannerGeometry.js'

export const DETAIL_ZOOM = 14
export const NEIGHBORHOOD_CACHE_SIZE = 6
export const collection = features => ({ type: 'FeatureCollection', features })
export const neighborhoodId = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const containsBounds = (outer, inner) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]

export function visibleNeighborhoods(manifest, viewport) {
  if (!viewport || viewport.zoom < DETAIL_ZOOM) return []
  return manifest.neighborhoods.filter(n => boundsOverlap(n.bounds, viewport.bounds)).map(n => n.id).sort()
}

export function mergeNeighborhoods(chunks, field) {
  const unique = new Map()
  for (const chunk of chunks) for (const feature of chunk?.[field]?.features || []) {
    unique.set(field === 'parcels' ? feature.properties.pin : feature.properties.id, feature)
  }
  return collection([...unique.values()])
}

/** Keep evidence for the active plan even when its sites leave the camera view. */
export function retainNeighborhoods(cache, required, limit = NEIGHBORHOOD_CACHE_SIZE) {
  const pinned = new Set(required), result = new Map(cache)
  for (const id of result.keys()) {
    if (result.size <= Math.max(limit, pinned.size)) break
    if (!pinned.has(id)) result.delete(id)
  }
  return result
}

/** Fixed geographic cells avoid scanning every building during pointer movement. */
export function spatialIndex(features, cellSize = .002) {
  const cells = new Map(), entries = features.map(feature => ({ feature, bounds: geometryBounds(feature.geometry) }))
  const cellRange = bounds => [Math.floor(bounds[0] / cellSize), Math.floor(bounds[1] / cellSize), Math.floor(bounds[2] / cellSize), Math.floor(bounds[3] / cellSize)]
  for (const entry of entries) {
    const [west, south, east, north] = cellRange(entry.bounds)
    for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) {
      const key = `${x}:${y}`
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(entry)
    }
  }
  return {
    query(bounds) {
      const [west, south, east, north] = cellRange(bounds), found = new Set()
      // Large camera extents are cheaper to scan than enumerating empty grid cells.
      const candidates = (east - west + 1) * (north - south + 1) > cells.size * 2
        ? entries : null
      const visit = entry => { if (boundsOverlap(bounds, entry.bounds)) found.add(entry.feature) }
      if (candidates) candidates.forEach(visit)
      else for (let x = west; x <= east; x++) for (let y = south; y <= north; y++) (cells.get(`${x}:${y}`) || []).forEach(visit)
      return [...found]
    },
  }
}
