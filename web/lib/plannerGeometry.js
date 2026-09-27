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

/** Fixed-size search: never shrink a proposed building to manufacture a fit. */
export function fitMassing(geometry, width, depth) {
  const origin = geometryCenter(geometry)
  if (!origin || !Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return { fits: false, geometry: null, reason: 'Invalid dimensions or parcel geometry.' }
  const scale = METRES * Math.cos(origin[1] * Math.PI / 180)
  const project = ([lon, lat]) => [(lon - origin[0]) * scale, (lat - origin[1]) * METRES]
  const unproject = ([x, y]) => [origin[0] + x / scale, origin[1] + y / METRES]
  for (const rings of polygons(geometry)) {
    const polygon = rings.map(ring => ring.map(project))
    const xs = polygon[0].map(p => p[0]), ys = polygon[0].map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const centers = [[(minX + maxX) / 2, (minY + maxY) / 2]]
    for (const fx of [.25, .4, .6, .75]) for (const fy of [.25, .4, .6, .75]) centers.push([minX + (maxX - minX) * fx, minY + (maxY - minY) * fy])
    for (const [x, y] of centers) for (let angle = 0; angle < 180; angle += 5) {
      const rect = rectangle(x, y, width, depth, angle * Math.PI / 180)
      if (rectangleInside(rect, polygon)) {
        const ring = rect.map(unproject)
        return { fits: true, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] }, angle, reason: 'A fixed-size footprint fits the parcel outline. Setbacks, access, height and engineering are not checked.' }
      }
    }
  }
  return { fits: false, geometry: rectangleAt(origin, width, depth), reason: 'No fit found by the sampled placement search. Reduce dimensions or review manually; this is not proof that every design is infeasible.' }
}

export function slimParcels(collection) {
  return { type: 'FeatureCollection', features: collection.features.map(f => ({ type: 'Feature', id: f.properties.pin, geometry: f.geometry, properties: { pin: f.properties.pin, vacant: f.properties.vacant_lot === true, area: f.properties.area } })) }
}
