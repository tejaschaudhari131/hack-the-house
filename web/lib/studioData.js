import { boundsOverlap, geometryBounds, geometriesOverlap, slimParcels } from './plannerGeometry.js'

export const DETAIL_ZOOM = 14
export const NEIGHBORHOOD_CACHE_SIZE = 6
export const collection = features => ({ type: 'FeatureCollection', features })
export const neighborhoodId = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const containsBounds = (outer, inner) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]

export function neighborhoodAdjacency(neighborhoods) {
  const rows = neighborhoods.features.map(f => ({ id: neighborhoodId(f.properties.name), geometry: f.geometry }))
  return Object.fromEntries(rows.map(a => [a.id, rows.filter(b => a !== b && geometriesOverlap(a.geometry, b.geometry)).map(b => b.id).sort()]))
}

/** Only the selected neighborhood and its immediate geographic neighbors may load for display. */
export function visibleNeighborhoods(manifest, viewport, activeId, boundaries) {
  if (!viewport || viewport.zoom < DETAIL_ZOOM) return []
  const active = manifest.neighborhoods.find(n => n.id === activeId)
  if (!active) return []
  const allowed = new Set([active.id, ...(active.neighbors || [])])
  const [w,s,e,n] = viewport.bounds
  const view = { type: 'Polygon', coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] }
  return manifest.neighborhoods.filter(n => allowed.has(n.id) && boundsOverlap(n.viewBounds || n.bounds, viewport.bounds)
    && (!boundaries?.get(n.id) || geometriesOverlap(boundaries.get(n.id), view))).map(n => n.id).sort()
}

/** Collision chunks include cross-boundary context; display membership must not expose distant context. */
export function displayBuildings(buildings, visibleIds) {
  const ids = new Set(visibleIds)
  return collection(buildings.features.filter(f => f.properties.display_neighborhoods?.some(id => ids.has(id))))
}

export function sameFeatureSet(a, b) {
  if (!a || a.length !== b.length) return false
  const previous = new Set(a)
  return b.every(f => previous.has(f))
}

export function sameChunkMap(a, b) {
  return a.size === b.size && [...a].every(([id, chunk]) => b.get(id) === chunk)
}

/** Build each loaded neighborhood's display indexes once, not once per combination.
 * Weak keys release indexes with evicted chunks; collision evidence remains untouched.
 */
export function createNeighborhoodDisplay() {
  const prepared = new WeakMap(), stats = { prepared: 0 }
  let previous
  function get(chunks, ids) {
    const key = ids.join('|'), sources = ids.map(id => chunks.get(id)).filter(Boolean)
    if (previous?.key === key && previous.sources.length === sources.length && sources.every((source, i) => source === previous.sources[i])) return previous.result
    const indexes = sources.map(chunk => {
      if (!prepared.has(chunk)) {
        prepared.set(chunk, { parcels: spatialIndex(slimParcels(chunk.parcels).features), buildings: spatialIndex(chunk.buildings.features) })
        stats.prepared++
      }
      return prepared.get(chunk)
    })
    const visible = new Set(ids)
    const query = (field, bounds) => {
      const matches = new Map()
      for (const index of indexes) for (const f of index[field].query(bounds)) {
        if (field === 'buildings' && !f.properties.display_neighborhoods?.some(id => visible.has(id))) continue
        matches.set(field === 'parcels' ? f.properties.pin : f.properties.id, f)
      }
      return [...matches.values()]
    }
    const result = { parcelIndex: { query: bounds => query('parcels', bounds) }, buildingIndex: { query: bounds => query('buildings', bounds) } }
    previous = { key, sources, result }
    return result
  }
  return { get, stats }
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
export function spatialIndex(features, cellSize = .002, boundsFor = feature => geometryBounds(feature.geometry)) {
  const cells = new Map(), entries = features.map(feature => ({ feature, bounds: boundsFor(feature) }))
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
