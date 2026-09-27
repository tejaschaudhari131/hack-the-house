/** Small, dependency-free metre-based massing checks. These are not zoning setbacks. */
const METRES = 111320
const EPS = 1e-7

function polygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates
  return []
}

export function geometryCenter(geometry) {
  const points = polygons(geometry).flatMap(p => p[0] || [])
  if (!points.length) return null
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) }
function onSegment(p, a, b) {
  return Math.abs(cross(a, b, p)) < EPS && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
}
function insideRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (onSegment(p, a, b)) return true
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
function intersects(a, b, c, d) {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d), cd1 = cross(c, d, a), cd2 = cross(c, d, b)
  return (ab1 * ab2 < -EPS && cd1 * cd2 < -EPS) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}

/** Reject boundary contact and hole crossings, including a hole entirely under the rectangle. */
export function rectangleInside(rect, polygon) {
  if (!rect.every(p => insideRing(p, polygon[0]) && !polygon.slice(1).some(hole => insideRing(p, hole)))) return false
  for (const ring of polygon) {
    for (let i = 0; i < rect.length; i++) {
      for (let j = 0; j < ring.length - 1; j++) if (intersects(rect[i], rect[(i + 1) % rect.length], ring[j], ring[j + 1])) return false
    }
  }
  return !polygon.slice(1).some(hole => insideRing(hole[0], [...rect, rect[0]]))
}

function rectangle(x, y, width, depth, angle) {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([a, b]) => [x + a * c - b * s, y + a * s + b * c])
}

export function rectangleAt(center, width, depth) {
  const scale = METRES * Math.cos(center[1] * Math.PI / 180)
  const ring = rectangle(0, 0, width, depth, 0).map(([x, y]) => [center[0] + x / scale, center[1] + y / METRES])
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
}

export function geometryBounds(geometry) {
  const points = polygons(geometry).flatMap(p => p[0] || [])
  if (!points.length) return null
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))]
}

export function boundsOverlap(a, b) { return !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1] }

export function placementAt(geometry, coordinates, bearing = 0) {
  const origin = geometryCenter(geometry)
  if (!origin) return null
  return { east: (coordinates[0] - origin[0]) * METRES * Math.cos(origin[1] * Math.PI / 180), north: (coordinates[1] - origin[1]) * METRES, bearing }
}

/** Polygon contact/overlap in local metres, retaining holes and multipart buildings. */
export function geometriesOverlap(a, b) {
  if (!boundsOverlap(geometryBounds(a), geometryBounds(b))) return false
  const origin = geometryCenter(a), scale = METRES * Math.cos(origin[1] * Math.PI / 180)
  const project = p => [(p[0] - origin[0]) * scale, (p[1] - origin[1]) * METRES]
  const contains = (p, poly) => insideRing(p, poly[0]) && !poly.slice(1).some(hole => insideRing(p, hole))
  for (const pa of polygons(a)) for (const pb of polygons(b)) {
    const x = pa.map(r => r.map(project)), y = pb.map(r => r.map(project))
    for (const rx of x) for (const ry of y) for (let i = 0; i < rx.length - 1; i++) for (let j = 0; j < ry.length - 1; j++) {
      if (intersects(rx[i], rx[i + 1], ry[j], ry[j + 1])) return true
    }
    if (contains(x[0][0], y) || contains(y[0][0], x)) return true
  }
  return false
}

/** Fixed-size search, preferring parcel edges; explicit manual placements are never moved. */
export function fitMassing(geometry, width, depth, placement = null, existingBuildings = null) {
  const origin = geometryCenter(geometry)
  if (!origin || !Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return { fits: false, geometry: null, reason: 'Invalid dimensions or parcel geometry.' }
  const scale = METRES * Math.cos(origin[1] * Math.PI / 180)
  const project = ([lon, lat]) => [(lon - origin[0]) * scale, (lat - origin[1]) * METRES]
  const unproject = ([x, y]) => [origin[0] + x / scale, origin[1] + y / METRES]
  const makeGeometry = rect => {
    const ring = rect.map(unproject)
    return { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
  }
  const collisionCount = candidate => existingBuildings === null ? null : existingBuildings.filter(f => geometriesOverlap(candidate, f.geometry)).length
  if (placement) {
    if (![placement.east, placement.north, placement.bearing].every(Number.isFinite)) return { fits: false, geometry: null, reason: 'Invalid placement.' }
    const rect = rectangle(placement.east, placement.north, width, depth, -placement.bearing * Math.PI / 180)
    const candidate = makeGeometry(rect), fits = polygons(geometry).some(rings => rectangleInside(rect, rings.map(r => r.map(project))))
    return { fits, geometry: candidate, placement, mode: 'manual', collisions: collisionCount(candidate), reason: fits ? 'Your exact placement fits the parcel outline. Setbacks, access, height and engineering are not checked.' : 'Your placement crosses or touches the parcel boundary or a hole. Move or rotate it; its size and position have not been changed automatically.' }
  }
  let occupiedFit = null
  for (const rings of polygons(geometry)) {
    const polygon = rings.map(ring => ring.map(project))
    const xs = polygon[0].map(p => p[0]), ys = polygon[0].map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const centers = [[(minX + maxX) / 2, (minY + maxY) / 2]]
    for (const fx of [.25, .4, .6, .75]) for (const fy of [.25, .4, .6, .75]) centers.push([minX + (maxX - minX) * fx, minY + (maxY - minY) * fy])
    const edges = polygon[0].slice(0, -1).map((p, i) => {
      const q = polygon[0][i + 1], dx = q[0] - p[0], dy = q[1] - p[1]
      return { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) - (depth >= width ? Math.PI / 2 : 0) }
    }).filter(edge => edge.length > .1).sort((a, b) => b.length - a.length)
    // Parallel/opposite edges share the same alignment. Also try the perpendicular
    // orientation, but do not invent arbitrary angles to manufacture an aligned fit.
    const angles = [...new Set(edges.flatMap(e => [e.angle, e.angle + Math.PI / 2]).map(a => Math.round(((a % Math.PI + Math.PI) % Math.PI) * 1e6) / 1e6))]
    for (const angle of angles) for (const [x, y] of centers) {
      const rect = rectangle(x, y, width, depth, angle)
      if (rectangleInside(rect, polygon)) {
        const candidate = makeGeometry(rect), collisions = collisionCount(candidate)
        const result = { fits: true, geometry: candidate, placement: { east: x, north: y, bearing: ((-angle * 180 / Math.PI) % 360 + 360) % 360 }, mode: 'parcel', collisions, reason: 'Aligned to a parcel edge, prioritizing its longest edge. This does not identify street frontage. Setbacks, access, height and engineering are not checked.' }
        if (!collisions) return result
        occupiedFit ||= result
      }
    }
  }
  if (occupiedFit) return occupiedFit
  const fallback = rectangleAt(origin, width, depth)
  return { fits: false, geometry: fallback, placement: { east: 0, north: 0, bearing: 0 }, mode: 'parcel', collisions: collisionCount(fallback), reason: 'No parcel-aligned fit found by the sampled placement search. Try manual rotation or smaller dimensions; this is not proof that every design is infeasible.' }
}

export function slimParcels(collection) {
  return { type: 'FeatureCollection', features: collection.features.map(f => ({ type: 'Feature', id: f.properties.pin, geometry: f.geometry, properties: { pin: f.properties.pin, vacant: f.properties.vacant_lot === true, area: f.properties.area } })) }
}
